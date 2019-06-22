import { MessageStream, TypedChannel } from "@hediet/typed-json-rpc";
import {
	DecorationOptions,
	ThemeColor,
	window,
	workspace,
	Uri,
	TextEditorRevealType,
} from "vscode";
import { revealTextContract } from "vscode-rpc";
import { translateSpan } from "./position";
import { wait } from "@hediet/std/timer";

type Contract = typeof revealTextContract;
type Server = Contract["TServerInterface"];

export class RevealTextServer {
	private readonly highlightDecorationType = window.createTextEditorDecorationType(
		{
			backgroundColor: new ThemeColor(
				"editor.stackFrameHighlightBackground"
			),
		}
	);

	public handleClient(channel: TypedChannel, stream: MessageStream) {
		revealTextContract.registerServer(channel, {
			revealText: this.revealText,
		});
	}

	private readonly revealText: Server["revealText"] = async ({
		fileName,
		range,
	}) => {
		const file = Uri.file(fileName);
		if (isUriInWorkspace(file)) {
			const d = await workspace.openTextDocument(file);
			const e = await window.showTextDocument(d);

			if (range) {
				const vsCodeRange = translateSpan(range, d);
				e.revealRange(vsCodeRange, TextEditorRevealType.Default);
				e.setDecorations(this.highlightDecorationType, [vsCodeRange]);
				wait(1000).then(() => {
					e.setDecorations(this.highlightDecorationType, []);
				});
			}
		}
	};
}

function isUriInWorkspace(uri: Uri): boolean {
	if (!workspace.workspaceFolders) {
		return false;
	}

	for (const w of workspace.workspaceFolders) {
		if (uri.toString().startsWith(w.uri.toString())) {
			return true;
		}
	}
	return false;
}
