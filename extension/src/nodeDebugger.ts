import { TypedChannel, MessageStream } from "@hediet/typed-json-rpc";
import { nodeDebuggerContract, vscodeClientContract } from "vscode-rpc";
import {
	OutputChannel,
	window,
	DebugConfiguration,
	debug,
	workspace,
	StatusBarAlignment,
	Disposable,
} from "vscode";
import { StatusBarOptionService } from "./StatusBarOptionService";
import { Barrier } from "@hediet/std/synchronization";
import { dispatched } from "./contractTransformer";
import { string } from "io-ts";

const dispatchedNodeDebuggerContract = dispatched(nodeDebuggerContract);

type Contract = typeof dispatchedNodeDebuggerContract;
type Server = Contract["TServerInterface"];

export class NodeDebugServer {
	private readonly clients = new Set<Contract["TClientInterface"]>();
	constructor(private readonly outputChannel: OutputChannel) {}

	private readonly statusBarService = new StatusBarOptionService({
		id: "nodeDebugStatusBar",
		alignment: StatusBarAlignment.Right,
		priority: 10000000,
	});

	public handleClient(channel: TypedChannel, stream: MessageStream) {
		const client = dispatchedNodeDebuggerContract.registerServer(channel, {
			nodeDebugTargetBecameAvailable: this.nodeDebugTargetBecameAvailable,
			nodeDebugTargetBecameUnavailable: this
				.nodeDebugTargetBecameUnavailable,
		});
		this.clients.add(client);

		stream.onClosed.then(() => {
			this.clients.delete(client);
		});
	}

	private readonly targetIdsByClientId = new Map<string, string[]>();
	private readonly openRequestsByTargetId = new Map<string, Disposable>();

	public onClientDisconnected(clientId: string) {
		const c = this.targetIdsByClientId.get(clientId);
		if (c) {
			for (const requestId of c) {
				this.cancelRequest(requestId);
			}
			this.targetIdsByClientId.delete(clientId);
		}
	}

	private cancelRequest(targetId: string): void {
		const r = this.openRequestsByTargetId.get(targetId);
		if (!r) {
			return;
		}

		r.dispose();
		this.openRequestsByTargetId.delete(targetId);
	}

	private readonly nodeDebugTargetBecameUnavailable: Server["nodeDebugTargetBecameUnavailable"] = async ({
		targetId,
	}) => {
		this.cancelRequest(targetId);
	};

	private readonly nodeDebugTargetBecameAvailable: Server["nodeDebugTargetBecameAvailable"] = async ({
		port: debuggerPort,
		targetId,
		name,
		$sourceClientId,
	}) => {
		const b = new Barrier<{ attach: boolean }>();

		this.openRequestsByTargetId.set(
			targetId,
			this.statusBarService.addOptions({
				options: {
					attach: {
						caption: `$(bug) Debug Node Process${
							name ? ` "${name}"` : ""
						}`,
						action: () => {
							b.unlock({ attach: true });
						},
					},
					ignore: {
						caption: `Ignore`,
						action: () => {
							b.unlock({ attach: false });
						},
					},
				},
			})
		);
		let client = this.targetIdsByClientId.get($sourceClientId);
		if (!client) {
			client = [];
			this.targetIdsByClientId.set($sourceClientId, client);
		}
		client.push(targetId);

		const { attach } = await b.onUnlocked;

		if (attach) {
			const config: DebugConfiguration = {
				type: "node2",
				request: "attach",
				name: "Attach to process",
				port: debuggerPort,
			};

			try {
				for (const client of this.clients) {
					client.attachingToNodeDebugTarget({
						targetId,
					});
				}

				const result = await debug.startDebugging(undefined, config);
				this.outputChannel.appendLine(`start: ${result}`);
			} catch (ex) {
				this.outputChannel.appendLine(`ex: ${ex}`);
			}
		}
	};
}
