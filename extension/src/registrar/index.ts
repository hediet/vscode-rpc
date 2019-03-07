import { startServer } from "@hediet/typed-json-rpc-websocket-server";
import {
	ConsoleRpcLogger,
	TypedChannel,
	rawNotification,
	RequestObject,
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
} from "vscode-remote-interface";

const paths = envPaths("VsCodeRemoteInterfaceServer");
mkdirSync(paths.config);
const secretPath = join(paths.config, "secret.txt");
const allowedClientsPath = join(paths.config, "allowedClients.json");

const logger = new ConsoleRpcLogger();

interface VsCodeClient {
	type: "vscode";
	name: string;
	id: string;
	vscodeServerPort: number;
	client: typeof vscodeClientContract["TClientInterface"];
	channel: TypedChannel;
}

interface NormalClient {
	type: "normal";
	appName: string;
	id: string;
	channel: TypedChannel;
}

interface AllowedClient {
	appName: string;
	token: string;
}

interface Config {
	// todo add last connected
	clients: AllowedClient[];
}

export class Server {
	private readonly vsCodeClients = new Map<string, VsCodeClient>();
	private readonly normalClients = new Map<string, NormalClient>();
	private id: number = 0;
	private accessId: number = 0;
	private readonly secret = cryptoRandomString(20);
	private allowedClients = new Array<AllowedClient>();

	start() {
		this.startServer();
		// port could be allocated, no race conditions here
		writeFileSync(secretPath, this.secret);

		if (existsSync(allowedClientsPath)) {
			const configJson = readFileSync(allowedClientsPath, {
				encoding: "utf8",
			});
			const config = JSON.parse(configJson) as Config;
			this.allowedClients = config.clients;
		}
	}

	storeConfig() {
		const config: Config = {
			clients: this.allowedClients,
		};
		const json = JSON.stringify(config);
		writeFileSync(allowedClientsPath, json);
	}

	private startServer() {
		startServer({ port: RegistrarPort }, logger, (channel, stream) => {
			const id = `${this.id++}`;
			let curClient: NormalClient | VsCodeClient | undefined = undefined;

			const vsCodeClient = vscodeClientContract.registerServerAndGetClient(
				channel,
				{
					registerAsVsCodeInstance: async ({
						name,
						vscodeServerPort,
					}) => {
						if (curClient) {
							throw new Error("Client already registered");
						}

						const {
							content,
						} = await vsCodeClient.authenticateVsCodeInstance({
							filePathToRead: secretPath,
						});

						if (content !== this.secret) {
							throw new Error("Invalid secret");
						}

						curClient = {
							type: "vscode",
							name,
							client: vsCodeClient,
							vscodeServerPort,
							id,
							channel,
						};

						channel.registerUnknownNotificationHandler(n => {
							this.broadcast(
								n,
								Array.from(this.normalClients.values())
							);
						});

						this.vsCodeClients.set(curClient.id, curClient);
						stream.onClosed.then(() => {
							this.vsCodeClients.delete(id);
							if (this.vsCodeClients.size === 0) {
								process.exit();
							}
						});
					},
					authenticateClient: async ({ appName, token }) => {
						if (!this.allowedClients.some(c => c.token === token)) {
							throw new Error("Not authorized");
						}
					},
				}
			);

			authenticationContract.registerServerAndGetClient(channel, {
				requestToken: async ({ appName }) => {
					if (this.vsCodeClients.size === 0) {
						throw new Error(
							"There is no VsCode instance that could grant access"
						);
					}
					const requestId = this.accessId;
					this.accessId++;

					const promises = Array.from(
						this.vsCodeClients.values()
					).map(c =>
						c.client.requestAccess({
							requestId,
							appName,
						})
					);
					const { accessGranted } = await Promise.race(promises);

					for (const client of this.vsCodeClients.values()) {
						client.client.cancelAccessRequest({
							requestId,
						});
					}

					if (!accessGranted) {
						throw new Error("Access denied!");
					} else {
						const token = cryptoRandomString(20);
						this.allowedClients.push({ appName, token });
						this.storeConfig();

						return { token };
					}
				},
				authenticate: async ({ appName, token }) => {
					if (curClient) {
						throw new Error("Client already registered");
					}

					if (!this.allowedClients.some(c => c.token === token)) {
						throw new Error("Not authorized");
					}

					curClient = {
						type: "normal",
						appName,
						channel,
						id,
					};

					registrarContract.registerServerAndGetClient(channel, {
						listInstances: async () => {
							return Array.from(this.vsCodeClients.values()).map(
								c => ({
									id: c.id,
									name: c.name,
									vscodeServerPort: c.vscodeServerPort,
								})
							);
						},
						chooseInstance: async () => {
							return null;
						},
						lastActiveInstance: async () => {
							return null;
						},
					});

					channel.registerUnknownNotificationHandler(n => {
						this.broadcast(
							n,
							Array.from(this.vsCodeClients.values())
						);
					});

					this.normalClients.set(curClient.id, curClient);
					stream.onClosed.then(() => {
						this.normalClients.delete(id);
					});
				},
			});

			channel.startListen();
		});
	}

	private broadcast(n: RequestObject, clients: { channel: TypedChannel }[]) {
		for (const client of clients) {
			client.channel.notify(rawNotification(n.method), n.params);
		}
	}
}
