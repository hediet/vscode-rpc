import { existsSync, readFileSync, writeFileSync } from "fs";
import { TokenStore } from ".";

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
