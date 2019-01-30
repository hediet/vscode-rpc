import * as vscode from 'vscode';
import { contract, types as t, notificationContract, RpcLogger, requestContract } from "@hediet/typed-json-rpc";
import { startServer } from "@hediet/typed-json-rpc-websocket-server";

const targetIdType = t.string;
const vscodeContract = contract({
    server: {
		instanceName: requestContract({ result: t.type({ name: t.string }) }),
		nodeDebugTargetBecameAvailable: notificationContract({ params: { port: t.Integer, targetId: targetIdType } }),
		nodeDebugTargetBecameUnavailable: notificationContract({ params: { targetId: targetIdType } }),
    },
    client: {
		attachingToNodeDebugTarget: notificationContract({ params: { targetId: targetIdType } }),
        attachedToNodeDebugTarget: notificationContract({ params: { targetId: targetIdType } }),
    }
});

const clients = new Set<typeof vscodeContract._clientInterface>();







export function activate(context: vscode.ExtensionContext) {
	const outputChannel = vscode.window.createOutputChannel("remote-interface");

	const logger: RpcLogger = {
		debug: args => outputChannel.appendLine(args.text),
		trace: args => outputChannel.appendLine(args.text),
		warn: args => outputChannel.appendLine(args.text),
	};

	vscode.debug.onDidChangeActiveDebugSession(session => {
		if (session) {
			/*session.configuration.
			for (const client of clients) {
				client.attachedToNodeDebugTarget()
			}*/
			//outputChannel.appendLine("Session changed");
		}
	});

	let disposable = vscode.commands.registerCommand('remote-interface.start-server', () => {
		setupServer(logger, outputChannel);
	});

	context.subscriptions.push(disposable);
}

export function deactivate() {}


function setupServer(logger: RpcLogger, outputChannel: vscode.OutputChannel) {
	startServer({ port: 56024 }, logger, async (channel, stream) => {
    
		const client = vscodeContract.getClientInterface(channel, {
			instanceName: async () => {
				return {
					name: vscode.workspace.name || "vscode"
				};
			},
			nodeDebugTargetBecameAvailable: async ({ port: debuggerPort, targetId }) => {
				const result = await vscode.window.showInformationMessage("A node target became available.", 
					{
						title: "Attach",
						action: async () => {
							const config: vscode.DebugConfiguration = {
								type: 'node',
								request: 'attach',
								name: "Attach to proc",
								port: debuggerPort,

							};

							try {
								for (const client of clients) {
									client.attachingToNodeDebugTarget({ targetId });
								}
								const result = await vscode.debug.startDebugging(undefined, config);
								outputChannel.appendLine(`start: ${result}`);
							} catch (ex) {
								outputChannel.appendLine(`ex: ${ex}`);
							}
						}
					},
					{
						title: "Ignore",
						isCloseAffordance: true,
						action: () => {

						}
					}
				);

				if (result) {
					result.action();
				}
			},
		});
		clients.add(client);
	

		channel.startListen();
		await stream.onClosed;
		clients.delete(client);
	});
	
	vscode.window.showInformationMessage('Server started');
}
