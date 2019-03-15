import { RegistrarServer } from "./RegistrarServer";
import { NodeJsMessageStream } from "@hediet/typed-json-rpc-streams";
import { registrarCliContract } from "./contract";

async function main() {
	const { client } = registrarCliContract.registerServerToStream(
		NodeJsMessageStream.connectToThisProcess(),
		undefined,
		{}
	);

	try {
		await new RegistrarServer(client).start();
		await client.started({ succesful: true });
	} catch (e) {
		await client.started({ succesful: false });
		await client.error({ message: e.toString() });
		process.exit(1);
	}
}

main();
