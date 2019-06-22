import {
	textPosition,
	lineBasedTextPosition,
	textRange,
	lineBasedTextRange,
} from "vscode-rpc";
import { TextDocument, Position, Range } from "vscode";

export function translatePosition(
	position: typeof textPosition._A | typeof lineBasedTextPosition._A,
	doc: TextDocument
): Position {
	if ("line" in position) {
		return new Position(position.line, position.character);
	} else {
		return doc.positionAt(position.offset);
	}
}

export function translateSpan(
	span: typeof textRange._A | typeof lineBasedTextRange._A,
	doc: TextDocument
): Range {
	return new Range(
		translatePosition(span.start, doc),
		translatePosition(span.end, doc)
	);
}
