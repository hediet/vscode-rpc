import { StatusBarAlignment, window, commands, StatusBarItem } from "vscode";
import { getParametrizedCommand } from "./CommandsService";
import { Disposable } from "@hediet/std/disposable";

const resolveOptionCommandId = (id: string) => "resolve-option-" + id;

export interface Options {
	options: { action: () => void; caption: string }[];
}

export interface Config {
	id: string;
	alignment: StatusBarAlignment;
	priority: number;
}

export class StatusBarOptionService {
	private static curId = 0;
	private readonly registeredOptions = new Map<
		number,
		{ options: Options; disposable: Disposable }
	>();
	public readonly dispose = Disposable.fn();

	constructor(private readonly config: Config) {
		this.dispose.track({
			dispose: () => {
				for (const options of this.registeredOptions.values()) {
					options.disposable.dispose();
				}
				this.registeredOptions.clear();
			},
		});

		this.dispose.track(
			commands.registerCommand(
				resolveOptionCommandId(config.id),
				(id: number, optionId: number) => {
					const option = this.registeredOptions.get(id);
					if (!option) {
						throw new Error("No option with given id");
					}
					const o = option.options.options[optionId];
					if (!o) {
						throw new Error("Selected option does not exist");
					}
					o.action();
					option.disposable.dispose();
				}
			)
		);
	}

	public addOptions(options: Options): Disposable {
		const items = new Array<StatusBarItem>();
		let prio = this.config.priority - this.registeredOptions.size * 4;

		const id = StatusBarOptionService.curId++;
		const disposables = new Array<Disposable>();

		let optionIdx = 0;
		for (const option of options.options) {
			prio--;
			const optionItem = window.createStatusBarItem(
				this.config.alignment,
				prio
			);
			items.push(optionItem);
			const { command, disposable } = getParametrizedCommand(
				resolveOptionCommandId(this.config.id),
				[id, optionIdx]
			);
			disposables.push(disposable);

			optionItem.command = command;
			optionItem.text = option.caption;
			optionItem.show();
			optionIdx++;
		}

		const disposable = Disposable.create(() => {
			for (const disp of disposables) {
				disp.dispose();
			}
			for (const item of items) {
				item.hide();
				item.dispose();
			}
		});

		this.registeredOptions.set(id, { options, disposable });

		return disposable;
	}
}
