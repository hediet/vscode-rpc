import {
	contract,
	notificationContract,
	requestContract,
	types as t,
} from "@hediet/typed-json-rpc";

export const RegistrarPort = 56024;

const Registrar = "Registrar";
const VsCodeInstance = "VsCodeInstance";
const BroadcastContract = "BroadcastContract";

export const vscodeClientContract = contract([Registrar], {
	server: {
		registerAsVsCodeInstance: requestContract({
			params: {
				name: t.string,
				vscodeServerPort: t.Integer,
			},
		}),
		authenticateClient: requestContract({
			params: {
				token: t.string,
				appName: t.string,
			},
			error: t.type({
				kind: t.literal("invalid token"),
			}),
		}),
	},
	client: {
		authenticateVsCodeInstance: requestContract({
			params: {
				filePathToRead: t.string,
			},
			result: t.type({
				content: t.string,
			}),
		}),
		requestAccess: requestContract({
			params: {
				requestId: t.number,
				appName: t.string,
			},
			result: t.type({
				accessGranted: t.boolean,
			}),
		}),
		cancelAccessRequest: notificationContract({
			params: {
				requestId: t.number,
			},
		}),
		connectedClientCountChanged: notificationContract({
			params: {
				newClientCount: t.Integer,
			},
		}),
	},
});

export const vsCodeId = t.refinement(t.string, () => true, "VsCodeId");
export const vsCodeInstance = t.type({
	id: vsCodeId,
	name: t.string,
	vscodeServerPort: t.Integer,
});

export const registrarContract = contract([Registrar], {
	server: {
		listInstances: requestContract({
			result: t.array(vsCodeInstance),
		}),
		chooseInstance: requestContract({
			result: t.union([t.null, vsCodeInstance]),
		}),
		lastActiveInstance: requestContract({
			result: t.union([t.null, vsCodeInstance]),
		}),
	},
	client: {},
});

export const authenticationContract = contract([Registrar, VsCodeInstance], {
	server: {
		requestToken: requestContract({
			params: {
				appName: t.string,
			},
			result: t.type({
				token: t.string,
			}),
			error: t.type({
				kind: t.literal("denied"),
			}),
		}),
		authenticate: requestContract({
			params: {
				token: t.string,
				appName: t.string,
			},
			error: t.type({
				kind: t.literal("invalid token"),
			}),
		}),
	},
	client: {},
});

export const targetIdType = t.string;

export const nodeDebuggerContract = contract([BroadcastContract], {
	server: {
		nodeDebugTargetBecameAvailable: notificationContract({
			params: { port: t.Integer, targetId: targetIdType },
		}),
		nodeDebugTargetBecameUnavailable: notificationContract({
			params: { targetId: targetIdType },
		}),
	},
	client: {
		attachingToNodeDebugTarget: notificationContract({
			params: { targetId: targetIdType },
		}),
		attachedToNodeDebugTarget: notificationContract({
			params: { targetId: targetIdType },
		}),
	},
});

export const textPosition = t.type({
	/** The zero based line */
	line: t.Integer,
	/** The zero based column */
	character: t.Integer,
});

export const textRange = t.type({
	/** The start position, including */
	start: textPosition,
	/* The end position, including */
	end: textPosition,
});

export const editorContract = contract([VsCodeInstance], {
	server: {
		highlightLine: requestContract({ params: { line: t.Integer } }),
		highlight: requestContract({
			params: {
				range: textRange,
			},
		}),
		annotateLines: requestContract({
			params: {
				annotations: t.array(
					t.type({ line: t.Integer, text: t.string })
				),
			},
		}),
	},
	client: {},
});
