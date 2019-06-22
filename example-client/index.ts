import {
	connectToVsCode,
	editorContract,
	revealTextContract,
} from "vscode-rpc";
import {
	FileTokenStore,
	GlobalTokenStore,
} from "vscode-rpc/dist/FileTokenStore";
import { disposeOnReturn } from "@hediet/std/disposable";

async function main() {
	await disposeOnReturn(async track => {
		const client = await connectToVsCode({
			appName: "Demo",
			// use `GlobalTokenStore` to use a user wide storage
			tokenStore: new FileTokenStore("./token.json"),
		});
		track(client);

		const s = revealTextContract.getServer(client.channel, {}).server;
		await s.revealText({
			fileName: "S:\\dev\\ts\\hediet-config\\package.json",
			range: {
				start: {
					line: 2,
					character: 12,
				},
				end: {
					character: 0,
					line: 5,
				},
			},
		});

		const instance = await client.registrar.listInstances({});
		if (!instance) {
			console.error("No vscode instance");
			client.close();
			return;
		}

		const vsCodeClient = await client.connectToInstance(instance[0]);
		track(vsCodeClient);

		const editor = editorContract.getServer(vsCodeClient.channel, {})
			.server;

		// the target vs code instance must have an active file open for this to work
		editor.annotateLines({
			annotations: [
				{
					line: 1,
					text: "test",
				},
			],
		});
	});
}

main().catch(err => {
	console.error(err);
});
