import { RegistrarServer, send } from ".";

async function main() {
	try {
		await new RegistrarServer().start();
	} catch (e) {
		send({ kind: "started", successful: false });
		send({ kind: "error", message: e.toString() });
		process.exit(1);
	}
}

main();
