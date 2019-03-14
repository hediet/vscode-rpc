export type StatusCommand =
	| { kind: "started"; successful: boolean }
	| { kind: "log"; message: string }
	| { kind: "error"; message: string };
