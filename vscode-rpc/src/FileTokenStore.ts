import { existsSync, readFileSync, writeFileSync } from "fs";
import { TokenStore } from "./TokenStore";
import envPaths from "env-paths";
import { mkdirSync } from "mkdir-recursive";
import { join } from "path";

export class FileTokenStore implements TokenStore {
	constructor(private readonly filePath: string) {}

	public async loadToken(): Promise<string | undefined> {
		if (existsSync(this.filePath)) {
			return JSON.parse(readFileSync(this.filePath, { encoding: "utf8" }))
				.token;
		}
		return undefined;
	}

	storeToken(token: string): void {
		writeFileSync(this.filePath, JSON.stringify({ token }));
	}
}

export class GlobalTokenStore extends FileTokenStore {
	constructor(appName: string, tokenFileName = "token.json") {
		const paths = envPaths(appName);
		const path = paths.config;
		mkdirSync(path);
		super(join(path, tokenFileName));
	}
}
