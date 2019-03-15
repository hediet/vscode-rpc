import { registrarCliContract } from "./contract";
import { NodeJsMessageStream } from "@hediet/typed-json-rpc-streams";
import { wait } from "@hediet/std/timer";
import { spawn } from "child_process";
import { join } from "path";

export function startRegistrarProcessIfNotRunning(): Promise<void> {
	return new Promise((resolve, reject) => {
		const proc = spawn("node", [join(__dirname, "./launcher-entry")], {
			shell: false,
			windowsHide: true,
		});

		proc.on("error", e => {
			console.error("error", e);
		});
		proc.on("close", e => {
			console.log("closed", e);
		});

		registrarCliContract.getServerFromStream(
			NodeJsMessageStream.connectToProcess(proc),
			undefined,
			{
				log: async ({ message }) =>
					console.log("Log from Server: ", message),
				error: async ({ message }) =>
					console.error("Error from Server: ", message),
				started: async ({ succesful }) => {
					proc.kill();
					resolve();
				},
			}
		);

		wait(1000).then(() => resolve());

		proc.stderr.on("data", chunk => {
			console.log("data", chunk.toString("utf8"));
		});
	});
}
