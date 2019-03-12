import {
	StatusBarAlignment,
	window,
	Disposable,
	commands,
	StatusBarItem,
} from "vscode";
import { getParametrizedCommand } from "./CommandsService";

const resolveOptionCommandId = (id: string) => "resolve-option-" + id;

export interface Options {
	options: { [name: string]: { action: () => void; caption: string } };
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

	constructor(private readonly config: Config) {
		commands.registerCommand(
			resolveOptionCommandId(config.id),
			(id: number, optionName: string) => {
				const option = this.registeredOptions.get(id);
				if (!option) {
					throw new Error("No option with given id");
				}
				const o = option.options.options[optionName];
				if (!o) {
					throw new Error("Selected option does not exist");
				}
				o.action();
				option.disposable.dispose();
			}
		);
	}

	public addOptions(options: Options): Disposable {
		const items = new Array<StatusBarItem>();
		let prio = this.config.priority - this.registeredOptions.size * 4;

		const id = StatusBarOptionService.curId++;
		const disposables = new Array<Disposable>();

		for (const optionName in options.options) {
			prio--;
			const option = options.options[optionName];
			const optionItem = window.createStatusBarItem(
				this.config.alignment,
				prio
			);
			items.push(optionItem);
			const { command, disposable } = getParametrizedCommand(
				resolveOptionCommandId(this.config.id),
				[id, optionName]
			);
			disposables.push(disposable);

			optionItem.command = command;
			optionItem.text = option.caption;
			optionItem.show();
		}

		const disposable = new Disposable(() => {
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
