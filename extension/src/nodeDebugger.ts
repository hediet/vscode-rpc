import { TypedChannel, MessageStream } from "@hediet/typed-json-rpc";
import { nodeDebuggerContract } from "vscode-remote-interface";
import { OutputChannel, window, DebugConfiguration, debug } from "vscode";

type Contract = typeof nodeDebuggerContract;
type Server = Contract["TServerInterface"];

export class NodeDebugServer {
	private readonly clients = new Set<Contract["TClientInterface"]>();
	constructor(private readonly outputChannel: OutputChannel) {}

	public handleClient(channel: TypedChannel, stream: MessageStream) {
		const client = nodeDebuggerContract.registerServerAndGetClient(
			channel,
			{
				nodeDebugTargetBecameAvailable: this
					.nodeDebugTargetBecameAvailable,
			}
		);
		this.clients.add(client);
		stream.onClosed.then(() => {
			this.clients.delete(client);
		});
	}

	private readonly nodeDebugTargetBecameAvailable: Server["nodeDebugTargetBecameAvailable"] = async ({
		port: debuggerPort,
		targetId,
	}) => {
		const result = await window.showInformationMessage(
			"A node target became available.",
			{
				title: "Attach",
				action: async () => {
					const config: DebugConfiguration = {
						type: "node",
						request: "attach",
						name: "Attach to proc",
						port: debuggerPort,
					};

					try {
						for (const client of this.clients) {
							client.attachingToNodeDebugTarget({
								targetId,
							});
						}
						const result = await debug.startDebugging(
							undefined,
							config
						);
						this.outputChannel.appendLine(`start: ${result}`);
					} catch (ex) {
						this.outputChannel.appendLine(`ex: ${ex}`);
					}
				},
			},
			{
				title: "Ignore",
				isCloseAffordance: true,
				action: () => {},
			}
		);

		if (result) {
			result.action();
		}
	};
}
