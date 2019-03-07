import { connectToVsCode, editorContract } from "vscode-remote-interface";
import { FileTokenStore } from "vscode-remote-interface/out/FileTokenStore";

async function main() {
	const client = await connectToVsCode({
		appName: "Demo",
		tokenStore: new FileTokenStore("./token.json"),
	});
	const instance = await client.registrar.listInstances({});
	if (!instance) {
		console.log("No vscode instance");
		client.close();
		return;
	}
	const vsCodeClient = await client.connectToInstance(instance[0]);

	const editor = editorContract.registerClientAndGetServer(
		vsCodeClient.channel,
		{}
	);

	let i = 0;
	while (i < 1000) {
		i++;
		editor.annotateLines({
			annotations: [
				{
					line: 4,
					text: "test2" + i,
				},
			],
		});
	}

	vsCodeClient.close();
	/*
	const s = nodeDebuggerContract.registerClientAndGetServer(
		connection.channel,
		{}
	);
	s.nodeDebugTargetBecameAvailable({ port: 134, targetId: "test12" });
*/

	client.close();
}

main().catch(err => {
	console.error(err);
});
