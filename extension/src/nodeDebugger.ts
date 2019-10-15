import { TypedChannel, MessageStream } from "@hediet/typed-json-rpc";
import { nodeDebuggerContract } from "vscode-rpc";
import {
	OutputChannel,
	DebugConfiguration,
	debug,
	StatusBarAlignment,
} from "vscode";
import { StatusBarOptionService } from "./StatusBarOptionService";
import { Barrier } from "@hediet/std/synchronization";
import { dispatched } from "./contractTransformer";
import { Disposable } from "@hediet/std/disposable";
import { Config } from "./Config";

const dispatchedNodeDebuggerContract = dispatched(nodeDebuggerContract);

type Contract = typeof dispatchedNodeDebuggerContract;
type Server = Contract["TServerInterface"];

export class NodeDebugServer {
	private autoAttachLabels = new Set<string>();
	private readonly clients = new Set<Contract["TClientInterface"]>();
	public dispose = Disposable.fn();

	constructor(
		private readonly outputChannel: OutputChannel,
		private readonly registrarServer: TypedChannel,
		private readonly config: Config
	) {
		this.dispose.track(this.statusBarService);

		this.dispose.track(
			config.onChange.sub(() => {
				this.reloadConfig();
			})
		);
		this.reloadConfig();
	}

	private reloadConfig() {
		this.autoAttachLabels = new Set(this.config.getAutoAttachLabels());
	}

	private readonly statusBarService = new StatusBarOptionService({
		id: "nodeDebugStatusBar",
		alignment: StatusBarAlignment.Right,
		priority: 10000000,
	});

	public handleClient(channel: TypedChannel, stream: MessageStream) {
		const { client } = dispatchedNodeDebuggerContract.registerServer(
			channel,
			{
				addNodeDebugTarget: this.addNodeDebugTarget,
				removeNodeDebugTarget: this.removeNodeDebugTarget,
			}
		);
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

	private readonly removeNodeDebugTarget: Server["removeNodeDebugTarget"] = async ({
		targetId,
	}) => {
		this.cancelRequest(targetId);
	};

	private readonly addNodeDebugTarget: Server["addNodeDebugTarget"] = async ({
		port: debuggerPort,
		targetId,
		name,
		$sourceClientId,
	}) => {
		const b = new Barrier<{ attach: boolean }>();

		if (name && this.autoAttachLabels.has(name)) {
			b.unlock({ attach: true });
		} else {
			this.openRequestsByTargetId.set(
				targetId,
				this.statusBarService.addOptions({
					options: [
						{
							caption: `$(bug) Debug Node Process${
								name ? ` "${name}"` : ""
							}`,
							action: () => {
								b.unlock({ attach: true });
							},
						},
						{
							caption: `Continue`,
							action: () => {
								b.unlock({ attach: false });
							},
						},
					],
				})
			);
		}

		let client = this.targetIdsByClientId.get($sourceClientId);
		if (!client) {
			client = [];
			this.targetIdsByClientId.set($sourceClientId, client);
		}
		client.push(targetId);

		const { attach } = await b.onUnlocked;
		if (attach) {
			await this.launchDebugger(debuggerPort, targetId);
		} else {
			for (const client of this.clients) {
				client.onNodeDebugTargetIgnored({
					targetId,
				});
			}
		}
	};

	private async launchDebugger(debuggerPort: number, targetId: string) {
		// "type: node" does not work!
		const config: DebugConfiguration = {
			type: this.config.getDebugAdapterKey(),
			request: "attach",
			name: "Attach to process",
			port: debuggerPort,
		};

		try {
			for (const client of this.clients) {
				client.onAttachingToNodeDebugTarget({
					targetId,
				});
			}
			const result = await debug.startDebugging(undefined, config);
			this.outputChannel.appendLine(`start: ${result}`);
		} catch (ex) {
			this.outputChannel.appendLine(`ex: ${ex}`);
		}
	}
}
