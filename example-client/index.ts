import { connectToVsCode, editorContract } from "vscode-remote-interface";
import { FileTokenStore } from "vscode-remote-interface/out/FileTokenStore";
import { guaranteeDisposeAsync } from "@hediet/utils/api/disposable";

async function main() {
	await guaranteeDisposeAsync(async items => {
		const client = await connectToVsCode({
			appName: "Demo",
			tokenStore: new FileTokenStore("./token.json"),
		});
		items.push(client);

		const instance = await client.registrar.listInstances({});
		if (!instance) {
			console.log("No vscode instance");
			client.close();
			return;
		}
		const vsCodeClient = await client.connectToInstance(instance[0]);
		items.push(vsCodeClient);

		const editor = editorContract.registerClientAndGetServer(
			vsCodeClient.channel,
			{}
		);

		let i = 0;
		while (i < 100) {
			i++;
			editor.annotateLines({
				annotations: [
					{
						line: 4,
						text: "test" + i,
					},
				],
			});
		}
	});

	/*
	const s = nodeDebuggerContract.registerClientAndGetServer(
		connection.channel,
		{}
	);
	s.nodeDebugTargetBecameAvailable({ port: 134, targetId: "test12" });
*/
}

main().catch(err => {
	console.error(err);
});
