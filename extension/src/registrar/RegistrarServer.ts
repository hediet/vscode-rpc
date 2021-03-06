import { startWebSocketServer } from "@hediet/typed-json-rpc-websocket-server";
import {
	TypedChannel,
	rawNotification,
	RequestObject,
	MessageStream,
	RpcLogger,
	RpcStreamLogger,
} from "@hediet/typed-json-rpc";
import envPaths from "env-paths";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import cryptoRandomString = require("crypto-random-string");
import { mkdirSync } from "mkdir-recursive";
import {
	vscodeClientContract,
	RegistrarPort,
	authenticationContract,
	registrarContract,
} from "vscode-rpc";
import { type, literal, string, array, union, nullType } from "io-ts";
import { DateFromISOString } from "io-ts-types";
import { Barrier } from "@hediet/std/synchronization";
import {
	sourceClientIdParam,
	serverToServerParam,
} from "../contractTransformer";
import { registrarCliContract } from "./contract";
import { hash } from "./hash";

const paths = envPaths("VsCodeRemoteInterfaceServer");
mkdirSync(paths.config);
const secretPath = join(paths.config, "secret.txt");
const configPath = join(paths.config, "config.json");

interface VsCodeClient {
	type: "vscode";
	name: string;
	id: string;
	vscodeServerPort: number;
	client: typeof vscodeClientContract["TClientInterface"];
	channel: TypedChannel;
	stream: MessageStream;
}

interface NormalClient {
	type: "normal";
	appName: string;
	id: string;
	channel: TypedChannel;
	stream: MessageStream;
}

interface UnauthorizedClient {
	type: "unauthorized";
	id: string;
	channel: TypedChannel;
	stream: MessageStream;
}

const allowedClient = type({
	appName: string,
	tokenHash: string,
	granted: DateFromISOString,
	lastAuthenticated: union([nullType, DateFromISOString]),
});

const configType = type({
	version: literal(1),
	clients: array(allowedClient),
});

interface Context {
	client: NormalClient | VsCodeClient | UnauthorizedClient;
}

const vscodeClientContractWithContext = vscodeClientContract.withContext<
	Context
>();

const authenticationContractWithContext = authenticationContract.withContext<
	Context
>();

export class RegistrarServer {
	private readonly vsCodeClients = new Map<string, VsCodeClient>();
	private readonly normalClients = new Map<string, NormalClient>();
	private id: number = 0;
	private accessId: number = 0;
	private readonly secret = cryptoRandomString({ length: 20 });
	private allowedClients = new Array<typeof allowedClient["_A"]>();
	private rpcLogger: RpcLogger;

	constructor(
		private readonly cliContract: typeof registrarCliContract.TClientInterface
	) {
		this.rpcLogger = {
			debug: entry => cliContract.log({ message: entry.text }),
			trace: entry => cliContract.log({ message: entry.text }),
			warn: entry => cliContract.log({ message: entry.text }),
		};
	}

	async start() {
		await this.startServer();
		// port could be allocated, no race conditions here
		writeFileSync(secretPath, this.secret);

		this.loadConfig();
	}

	loadConfig() {
		if (!existsSync(configPath)) {
			this.storeConfig();
			return;
		}

		const configJson = readFileSync(configPath, {
			encoding: "utf8",
		});
		const config = JSON.parse(configJson);
		const result = configType.decode(config);
		if (result.isRight()) {
			this.allowedClients = result.value.clients;
		} else {
			this.cliContract.error({
				message:
					"Could not load config: " +
					result.value.map(e => e.message).join(", "),
			});
			this.allowedClients = [];
		}
	}

	getDaysBetweenDates(firstDate: Date, secondDate: Date): number {
		const oneDay = 24 * 60 * 60 * 1000; // hours*minutes*seconds*milliseconds
		const diffDays = Math.round(
			Math.abs((firstDate.getTime() - secondDate.getTime()) / oneDay)
		);
		return diffDays;
	}

	storeConfig() {
		// delete clients that didn't connect in the last 30 days
		this.allowedClients = this.allowedClients.filter(c => {
			const d = c.lastAuthenticated || c.granted;
			if (this.getDaysBetweenDates(d, new Date()) > 30) {
				return false;
			}
			return true;
		});

		const json = JSON.stringify(
			configType.encode({
				version: 1,
				clients: this.allowedClients,
			}),
			undefined,
			"\t"
		);
		writeFileSync(configPath, json);
	}

	private createToken(): string {
		return cryptoRandomString({ length: 20 });
	}

	private hashToken(token: string): string {
		// salted hash
		return hash("5df82936cbf0864be4b7ba801bee392457fde9e4" + token);
	}

	private async startServer(): Promise<void> {
		const server = startWebSocketServer({ port: RegistrarPort }, stream => {
			const channel = TypedChannel.fromStream(
				new RpcStreamLogger(stream, this.rpcLogger),
				this.rpcLogger
			);

			const context: Context = {
				client: {
					type: "unauthorized",
					channel,
					stream,
					id: `client${this.id++}`,
				},
			};

			vscodeClientContractWithContext.registerServer(channel, context, {
				registerAsVsCodeInstance: this.registerAsVsCodeInstance,
				authenticateClient: this.authenticateClient,
				getConfigFileName: async () => ({
					path: configPath,
				}),
				reloadConfig: async () => {
					this.loadConfig();
				},
			});

			authenticationContractWithContext.registerServer(channel, context, {
				authenticate: this.authenticate,
				requestToken: this.requestToken,
			});

			channel.startListen();
		});

		await server.onListening;
	}

	private broadcast(
		sourceClientId: string,
		n: RequestObject,
		clients: { channel: TypedChannel }[]
	): void {
		const params = n.params;
		if (typeof params === "object" && !Array.isArray(params)) {
			sourceClientIdParam.set(params, sourceClientId);
		}
		for (const client of clients) {
			client.channel.notify(rawNotification(n.method), n.params);
		}
	}

	private readonly registerAsVsCodeInstance: typeof vscodeClientContractWithContext.TServerHandler.registerAsVsCodeInstance = async (
		{ name, vscodeServerPort },
		{ context, counterpart, newErr }
	) => {
		if (context.client.type !== "unauthorized") {
			return newErr({
				error: undefined,
				errorMessage: "Client already registered",
			});
		}

		const { content } = await counterpart.authenticateVsCodeInstance({
			filePathToRead: secretPath,
		});

		if (content !== this.secret) {
			return newErr({
				error: undefined,
				errorMessage: "Invalid secret",
			});
		}
		context.client = {
			type: "vscode",
			name,
			client: counterpart,
			vscodeServerPort,
			id: context.client.id,
			channel: context.client.channel,
			stream: context.client.stream,
		};

		context.client.channel.registerUnknownNotificationHandler(n => {
			if (
				n.params &&
				!Array.isArray(n.params) &&
				serverToServerParam.get(n.params)
			) {
				this.broadcast(
					context.client.id,
					n,
					Array.from(this.vsCodeClients.values())
				);
			} else {
				this.broadcast(
					context.client.id,
					n,
					Array.from(this.normalClients.values())
				);
			}
		});

		this.vsCodeClients.set(context.client.id, context.client);
		context.client.stream.onClosed.then(() => {
			this.vsCodeClients.delete(context.client.id);
			if (this.vsCodeClients.size === 0) {
				process.exit();
			}
		});
	};

	private readonly requestToken: typeof authenticationContractWithContext.TServerHandler.requestToken = async (
		{ appName },
		{ newErr, context }
	) => {
		if (this.vsCodeClients.size === 0) {
			return newErr({
				error: { kind: "denied" },
				errorMessage:
					"There is no VsCode instance that could grant access",
			});
		}
		const requestId = this.accessId;
		this.accessId++;

		let accessRequestOngoing = true;

		context.client.stream.onClosed.then(c => {
			if (accessRequestOngoing) {
				for (const client of this.vsCodeClients.values()) {
					client.client.cancelAccessRequest({
						requestId,
					});
				}
			}
		});

		const b = new Barrier<{ accessGranted: boolean }>();
		let count = this.vsCodeClients.size;
		for (const c of this.vsCodeClients.values()) {
			c.client
				.requestAccess({
					requestId,
					appName,
				})
				.then(({ accessGranted }) => {
					b.unlock({ accessGranted });
				})
				.catch(err => {
					count--;
					if (count === 0) {
						b.unlock({ accessGranted: false });
					}
				});
		}

		const { accessGranted } = await b.onUnlocked;
		accessRequestOngoing = false;

		for (const client of this.vsCodeClients.values()) {
			client.client.cancelAccessRequest({
				requestId,
			});
		}

		if (!accessGranted) {
			return newErr({
				error: { kind: "denied" },
				errorMessage: "Not allowed",
			});
		} else {
			const token = this.createToken();
			this.allowedClients.push({
				appName,
				tokenHash: await this.hashToken(token),
				granted: new Date(),
				lastAuthenticated: null,
			});
			this.storeConfig();

			return { token };
		}
	};

	private async checkToken(
		token: string
	): Promise<undefined | typeof allowedClient["_A"]> {
		const hashed = await this.hashToken(token);
		const c = this.allowedClients.find(c => c.tokenHash === hashed);
		if (c) {
			c.lastAuthenticated = new Date();
			this.storeConfig();
		}
		return c;
	}

	private readonly authenticateClient: typeof vscodeClientContractWithContext.TServerHandler.authenticateClient = async (
		{ appName, token },
		{ newErr }
	) => {
		const c = await this.checkToken(token);

		if (!c) {
			return newErr({
				error: { kind: "InvalidToken" },
				errorMessage: "Token not found.",
			});
		}
	};

	private authenticate: typeof authenticationContractWithContext.TServerHandler.authenticate = async (
		{ appName, token },
		{ newErr, context }
	) => {
		if (context.client.type !== "unauthorized") {
			throw new Error("Client already registered");
		}

		const c = await this.checkToken(token);
		if (!c) {
			return newErr({
				error: { kind: "InvalidToken" },
				errorMessage: "Token not found.",
			});
		}

		const client = (context.client = {
			type: "normal",
			appName,
			channel: context.client.channel,
			stream: context.client.stream,
			id: context.client.id,
		});

		registrarContract.registerServer(client.channel, {
			listInstances: async () => {
				return Array.from(this.vsCodeClients.values()).map(c => ({
					id: c.id,
					name: c.name,
					vscodeServerPort: c.vscodeServerPort,
				}));
			},
			chooseInstance: async ({}, { newErr }) => {
				return newErr({ errorMessage: "Not implemented yet." });
			},
			lastActiveInstance: async ({}, { newErr }) => {
				return newErr({ errorMessage: "Not implemented yet." });
			},
		});

		client.channel.registerUnknownNotificationHandler(n => {
			this.broadcast(
				client.id,
				n,
				Array.from(this.vsCodeClients.values())
			);
		});

		this.normalClients.set(client.id, client);
		for (const vsCode of this.vsCodeClients.values()) {
			vsCode.client.clientConnected({
				clientId: client.id,
				newClientCount: this.normalClients.size,
			});
		}

		client.stream.onClosed.then(() => {
			this.normalClients.delete(client.id);
			for (const vsCode of this.vsCodeClients.values()) {
				vsCode.client.clientDisconnected({
					clientId: client.id,
					newClientCount: this.normalClients.size,
				});
			}
		});
	};
}
