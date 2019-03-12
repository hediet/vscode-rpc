import { startWebSocketServer } from "@hediet/typed-json-rpc-websocket-server";
import {
	Disposable,
	window,
	OutputChannel,
	ExtensionContext,
	StatusBarAlignment,
} from "vscode";
import { WebSocketStream } from "@hediet/typed-json-rpc-websocket";
import { EditorServer } from "./editorServer";
import { NodeDebugServer } from "./nodeDebugger";
import {
	authenticationContract,
	vscodeClientContract,
	RegistrarPort,
} from "vscode-rpc";
import { spawn } from "child_process";
import { join } from "path";
import { readFileSync } from "fs";
import { StatusBarOptionService } from "./StatusBarOptionService";
import getPort from "get-port";
import { Barrier } from "@hediet/std/synchronization";
import {
	types as t,
	RpcLogger,
	TypedChannel,
	MessageStream,
	ConsoleStreamLogger,
} from "@hediet/typed-json-rpc";

class Extension implements Disposable {
	private readonly disposables = new Array<Disposable>();
	private readonly outputChannel: OutputChannel;
	private readonly rpcLogger: RpcLogger;
	private readonly clients = new Set<VscodeClient>();
	private readonly editorServer: EditorServer;
	private readonly nodeDebugServer: NodeDebugServer;
	private registrar!: typeof vscodeClientContract.TServerInterface;

	constructor() {
		this.outputChannel = window.createOutputChannel("RPC Server Log");
		this.disposables.push(this.outputChannel);

		this.rpcLogger = {
			debug: args => this.outputChannel.appendLine(args.text),
			trace: args => this.outputChannel.appendLine(args.text),
			warn: args => this.outputChannel.appendLine(args.text),
		};

		this.editorServer = new EditorServer();
		this.nodeDebugServer = new NodeDebugServer(this.outputChannel);

		this.startServer().catch(reason => {
			console.error(reason);
			this.outputChannel.appendLine(`Error: ${reason}`);
		});
	}

	public dispose() {
		for (const d of this.disposables) {
			d.dispose();
		}
	}

	private async startServer() {
		this.startRegistrarProcessIfNotRunning();

		const registrarStream = new ConsoleStreamLogger(
			await WebSocketStream.connectTo({
				host: "localhost",
				port: RegistrarPort,
			})
		);
		const registrarChannel = TypedChannel.fromStream(
			registrarStream,
			this.rpcLogger
		);
		this.registrar = vscodeClientContract.getServer(registrarChannel, {
			authenticateVsCodeInstance: async ({ filePathToRead }) => {
				const content = readFileSync(filePathToRead, {
					encoding: "utf8",
				});
				return { content };
			},
			requestAccess: this.requestAccess,
			cancelAccessRequest: this.cancelAccessRequest,
			clientDisconnected: async ({ clientId }) =>
				this.nodeDebugServer.onClientDisconnected(clientId),
		});

		this.nodeDebugServer.handleClient(registrarChannel, registrarStream);

		registrarChannel.startListen();
		const port = await getPort();
		const server = startWebSocketServer(
			{ port },
			this.rpcLogger,
			(channel, stream) => {
				this.handleClient(channel, stream);
			}
		);

		await this.registrar.registerAsVsCodeInstance({
			name: "VSCode",
			vscodeServerPort: server.port,
		});

		window.showInformationMessage("Server started");
	}

	private async startRegistrarProcessIfNotRunning(): Promise<void> {
		const proc = spawn("node", [join(__dirname, "./registrar/app")], {
			detached: true,
		});
		proc.on("error", e => {
			console.error("error", e);
		});
		proc.on("close", e => {
			console.log("closed", e);
		});
		proc.stdout.on("data", chunk => {
			console.log("data", chunk.toString("utf8"));
		});
		proc.stderr.on("data", chunk => {
			console.log("data", chunk);
		});
	}

	private handleClient(channel: TypedChannel, stream2: MessageStream) {
		const stream = new ConsoleStreamLogger(stream2);
		const client = { stream };

		authenticationContract.registerServer(channel, {
			authenticate: async ({ appName, token }) => {
				await this.registrar.authenticateClient({
					appName,
					token,
				});

				this.clients.add(client);

				this.editorServer.handleClient(channel, stream);
				this.nodeDebugServer.handleClient(channel, stream);

				stream.onClosed.then(() => {
					this.clients.delete(client);
				});
			},
			requestToken: async ({ appName }) => {
				throw new Error("Not supported");
			},
		});

		channel.startListen();
	}

	private options = new Map<number, Disposable>();

	private readonly cancelAccessRequest: typeof vscodeClientContract.TClientInterface.cancelAccessRequest = async ({
		requestId,
	}) => {
		const d = this.options.get(requestId);
		if (d) {
			d.dispose();
			this.options.delete(requestId);
		}
	};

	private readonly authStatusBar = new StatusBarOptionService({
		id: "authStatusBar",
		alignment: StatusBarAlignment.Right,
		priority: 1000000,
	});

	private readonly requestAccess: typeof vscodeClientContract.TClientInterface.requestAccess = async ({
		appName,
		requestId,
	}) => {
		let b = new Barrier<{ accessGranted: boolean }>();

		let x = 10;
		x = x;
		this.options.set(
			requestId,
			this.authStatusBar.addOptions({
				options: {
					allow: {
						caption: `$(key) Grant RPC Token to "${appName}"`,
						action: () => {
							this.options.delete(requestId);
							b.unlock({
								accessGranted: true,
							});
						},
					},
					deny: {
						caption: "Deny",
						action: () => {
							this.options.delete(requestId);
							b.unlock({
								accessGranted: false,
							});
						},
					},
				},
			})
		);

		return await b.onUnlocked;
	};
}

interface VscodeClient {
	stream: MessageStream;
}

export function activate(context: ExtensionContext) {
	const ext = new Extension();
	context.subscriptions.push(ext);
}

export function deactivate() {}
