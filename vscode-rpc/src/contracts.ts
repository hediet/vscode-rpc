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
			params: t.type({
				name: t.string,
				vscodeServerPort: t.Integer,
			}),
		}),
		authenticateClient: requestContract({
			params: t.type({
				token: t.string,
				appName: t.string,
			}),
			error: t.type({
				kind: t.union([t.literal("InvalidToken"), t.literal("Other")]),
			}),
		}),
		getConfigFileName: requestContract({
			result: t.type({
				path: t.string,
			}),
		}),
		reloadConfig: requestContract({
			error: t.type({
				message: t.string,
			}),
		}),
	},
	client: {
		authenticateVsCodeInstance: requestContract({
			params: t.type({
				filePathToRead: t.string,
			}),
			result: t.type({
				content: t.string,
			}),
		}),
		requestAccess: requestContract({
			params: t.type({
				requestId: t.number,
				appName: t.string,
			}),
			result: t.type({
				accessGranted: t.boolean,
			}),
		}),
		cancelAccessRequest: notificationContract({
			params: t.type({
				requestId: t.number,
			}),
		}),
		clientConnected: notificationContract({
			params: t.type({
				clientId: t.string,
				newClientCount: t.Integer,
			}),
		}),
		clientDisconnected: notificationContract({
			params: t.type({
				clientId: t.string,
				newClientCount: t.Integer,
			}),
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
			params: t.type({
				appName: t.string,
			}),
			result: t.type({
				token: t.string,
			}),
			error: t.type({
				kind: t.literal("denied"),
			}),
		}),
		authenticate: requestContract({
			params: t.type({
				token: t.string,
				appName: t.string,
			}),
			error: t.type({
				kind: t.union([t.literal("InvalidToken"), t.literal("Other")]),
			}),
		}),
	},
	client: {},
});

export const targetIdType = t.string;

export const nodeDebuggerContract = contract([BroadcastContract], {
	server: {
		addNodeDebugTarget: notificationContract({
			params: t.type({
				port: t.Integer,
				targetId: targetIdType,
				name: t.union([t.null, t.string]),
			}),
		}),
		removeNodeDebugTarget: notificationContract({
			params: t.type({ targetId: targetIdType }),
		}),
	},
	client: {
		onNodeDebugTargetIgnored: notificationContract({
			params: t.type({ targetId: targetIdType }),
		}),
		onAttachingToNodeDebugTarget: notificationContract({
			params: t.type({ targetId: targetIdType }),
		}),
	},
});

export const lineBasedTextPosition = t.type({
	/** The zero based line */
	line: t.Integer,
	/** The zero based column */
	character: t.Integer,
});

export const lineBasedTextRange = t.type({
	/** The start position, including */
	start: lineBasedTextPosition,
	/* The end position, including */
	end: lineBasedTextPosition,
});

export const textPosition = t.type({
	/** The zero based position of the character within the document. */
	offset: t.Integer,
});

export const textRange = t.type({
	/** The start position, including */
	start: textPosition,
	/* The end position, including */
	end: textPosition,
});

export const editorContract = contract([VsCodeInstance], {
	server: {
		highlightLine: requestContract({ params: t.type({ line: t.Integer }) }),
		highlight: requestContract({
			params: t.type({
				range: lineBasedTextRange,
			}),
		}),
		annotateLines: requestContract({
			params: t.type({
				annotations: t.array(
					t.type({ line: t.Integer, text: t.string })
				),
			}),
		}),
	},
	client: {
		cursorSelectionsChanged: notificationContract({
			params: t.type({
				selections: t.array(
					t.type({
						fileName: t.string,
						fileUri: t.string,
						range: textRange,
					})
				),
			}),
		}),
	},
});

export const revealTextContract = contract([BroadcastContract], {
	server: {
		revealText: notificationContract({
			params: t.type({
				fileName: t.string,
				range: t.union([lineBasedTextRange, textRange, t.null]),
			}),
		}),
	},
	client: {},
});
