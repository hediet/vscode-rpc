import { Server } from ".";

try {
	new Server().start();
} catch (e) {
	console.log("error: " + e);
	process.exit(1);
}
