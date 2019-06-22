import { MessageStream, TypedChannel } from "@hediet/typed-json-rpc";
import { DecorationOptions, ThemeColor, window } from "vscode";
import { editorContract } from "vscode-rpc";
import { translateSpan } from "./position";

type Contract = typeof editorContract;
type Server = Contract["TServerInterface"];

export class EditorServer {
	private readonly highlightDecorationType = window.createTextEditorDecorationType(
		{
			backgroundColor: new ThemeColor(
				"editor.stackFrameHighlightBackground"
			),
		}
	);
	private readonly deco = window.createTextEditorDecorationType({
		after: { margin: "0 0 0 3em", color: "gray" },
	});

	public handleClient(channel: TypedChannel, stream: MessageStream) {
		editorContract.registerServer(channel, {
			highlightLine: this.highlightLine,
			highlight: this.highlight,
			annotateLines: this.annotateLines,
		});
	}

	private readonly highlightLine: Server["highlightLine"] = async ({
		line,
	}) => {
		const editor = window.activeTextEditor;
		if (editor) {
			const range = editor.document.lineAt(line).range;
			editor.setDecorations(this.highlightDecorationType, [range]);
		}
	};

	private readonly highlight: Server["highlight"] = async ({ range }) => {
		const editor = window.activeTextEditor;
		if (editor) {
			editor.setDecorations(this.highlightDecorationType, [
				translateSpan(range, editor.document),
			]);
		}
	};

	private readonly annotateLines: Server["annotateLines"] = async ({
		annotations,
	}) => {
		const editor = window.activeTextEditor;
		if (editor) {
			editor.setDecorations(
				this.deco,
				annotations.map(a => {
					const range = editor.document.lineAt(a.line).range;
					return {
						range,
						renderOptions: {
							after: {
								contentText: a.text,
							},
						},
					} as DecorationOptions;
				})
			);
		}
	};
}
