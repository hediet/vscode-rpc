import { RegistrarServer } from ".";

try {
	new RegistrarServer().start();
} catch (e) {
	console.log("error: " + e);
	process.exit(1);
}
