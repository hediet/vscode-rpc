import {
	types as t,
	RpcLogger,
	TypedChannel,
	StreamLogger,
	MessageStream,
	ConsoleStreamLogger,
} from "@hediet/typed-json-rpc";
import { startWebSocketServer } from "@hediet/typed-json-rpc-websocket-server";
import { Disposable, window, OutputChannel, ExtensionContext } from "vscode";
import { WebSocketStream } from "@hediet/typed-json-rpc-websocket";
import { EditorServer } from "./editorServer";
import { NodeDebugServer } from "./nodeDebugger";
import {
	authenticationContract,
	vscodeClientContract,
	RegistrarPort,
} from "vscode-remote-interface";
import { spawn } from "child_process";
import { join } from "path";
import { readFileSync } from "fs";

class Extension implements Disposable {
	private readonly disposables = new Array<Disposable>();
	private readonly outputChannel: OutputChannel;
	private readonly rpcLogger: RpcLogger;
	private readonly clients = new Set<VscodeClient>();
	private readonly editorServer: EditorServer;
	private readonly nodeDebugServer: NodeDebugServer;

	constructor() {
		this.outputChannel = window.createOutputChannel("remote-interface");
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
		const serverPort = 56030;
		startWebSocketServer(
			{ port: serverPort },
			this.rpcLogger,
			async (channel, stream2) => {
				const stream = new ConsoleStreamLogger(stream2);
				const client = { stream };

				authenticationContract.registerServerAndGetClient(channel, {
					authenticate: async ({ appName, token }) => {
						await registrar.authenticateClient({
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
		);

		const proc = spawn("node", [join(__dirname, "./registrar/app")], {
			detached: true,
		});
		proc.on("error", e => {
			console.error(e);
		});
		proc.on("close", e => {
			console.log("closed", e);
		});
		proc.stdout.on("data", chunk => {
			console.log("data", chunk);
		});
		proc.stderr.on("data", chunk => {
			console.log("data", chunk);
		});

		const client2 = await WebSocketStream.connectTo({
			host: "localhost",
			port: RegistrarPort,
		});
		const client = new ConsoleStreamLogger(client2);
		const channel = TypedChannel.fromStream(client, this.rpcLogger);
		const registrar = vscodeClientContract.registerClientAndGetServer(
			channel,
			{
				authenticateVsCodeInstance: async ({ filePathToRead }) => {
					const content = readFileSync(filePathToRead, {
						encoding: "utf8",
					});
					return { content };
				},
				connectedClientCountChanged: () => {},
				requestAccess: async ({ appName, requestId }) => {
					const selected = await window.showInformationMessage(
						`Allow ${appName}`,
						{
							title: "Allow",
							grant: true,
						},
						{
							title: "Deny",
							grant: false,
						}
					);
					return { accessGranted: !!selected && selected.grant };
				},
				cancelAccessRequest: ({ requestId }) => {},
			}
		);

		this.nodeDebugServer.handleClient(channel, client);

		channel.startListen();

		await registrar.registerAsVsCodeInstance({
			name: "VSCode",
			vscodeServerPort: serverPort,
		});

		window.showInformationMessage("Server started");
	}
}

interface VscodeClient {
	stream: MessageStream;
}

export function activate(context: ExtensionContext) {
	const ext = new Extension();
	context.subscriptions.push(ext);
}

export function deactivate() {}
