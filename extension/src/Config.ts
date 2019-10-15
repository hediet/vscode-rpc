import { EventSource, EventEmitter } from "@hediet/std/events";
import { workspace, ConfigurationTarget } from "vscode";
import { Disposable } from "@hediet/std/disposable";

const showStartupMessageKey = "rpcServer.showStartupMessage";
const autoAttachLabelsKey = "rpcServer.nodeDebugger.autoAttachLabels";
const debugAdapterKey = "rpcServer.nodeDebugger.debugAdapter";

export class Config {
	private changeEventEmitter = new EventEmitter();
	public readonly onChange: EventSource = this.changeEventEmitter;
	public dispose = Disposable.fn();

	constructor() {
		this.dispose.track(
			workspace.onDidChangeConfiguration(() => {
				this.changeEventEmitter.emit();
			})
		);
	}

	public getDebugAdapterKey(): string {
		const c = workspace.getConfiguration();
		return c.get<string>(debugAdapterKey) || "node2";
	}

	public getAutoAttachLabels(): string[] {
		const c = workspace.getConfiguration();
		return c.get<string[]>(autoAttachLabelsKey) || [];
	}

	public getShowStartupMessage(): boolean {
		const c = workspace.getConfiguration();
		const r = c.get<boolean>(showStartupMessageKey);
		if (r === undefined) {
			return true;
		}
		return r;
	}

	public setShowStartupMessage(value: boolean) {
		const c = workspace.getConfiguration();
		c.update(showStartupMessageKey, value, ConfigurationTarget.Global);
	}
}
