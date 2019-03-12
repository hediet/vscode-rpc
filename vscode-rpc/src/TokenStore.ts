export interface TokenStore {
	loadToken(): Promise<string | undefined>;
	storeToken(token: string): void;
}

export class StringToken implements TokenStore {
	constructor(public token: string | undefined) {}

	public async loadToken(): Promise<string | undefined> {
		return this.token;
	}

	public storeToken(token: string): void {
		this.token = token;
	}
}
