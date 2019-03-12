import { commands, Disposable } from "vscode";

let curId = 0;
const commandId = (id: number) => `anonymous-command.${id}`;

export function getAnonymousCommand(
	func: () => void
): { command: string; disposable: Disposable } {
	const id = curId++;
	const parametrizedCommand = commandId(id);
	const d = commands.registerCommand(parametrizedCommand, () => {
		func();
	});

	return {
		command: parametrizedCommand,
		disposable: d,
	};
}

export function getParametrizedCommand(
	command: string,
	args: unknown[]
): { command: string; disposable: Disposable } {
	return getAnonymousCommand(() => {
		commands.executeCommand(command, ...args);
	});
}
