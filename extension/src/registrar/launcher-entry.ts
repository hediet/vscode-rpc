import { spawn } from "child_process";
import { join } from "path";

spawn("node", [join(__dirname, "./entry")], {
	detached: true,
	stdio: "inherit",
});
