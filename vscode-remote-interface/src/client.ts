import {
	TypedChannel,
	ConsoleRpcLogger,
	StreamLogger,
} from "@hediet/typed-json-rpc";
import { WebSocketStream } from "@hediet/typed-json-rpc-websocket";
import {
	registrarContract,
	authenticationContract,
	RegistrarPort,
} from "./contracts";

export abstract class Client {
	constructor(
		public readonly channel: TypedChannel,
		public readonly stream: WebSocketStream
	) {}

	public close(): void {
		this.stream.close();
	}
}

export class RegistrarClient extends Client {
	constructor(
		channel: TypedChannel,
		stream: WebSocketStream,
		private readonly appName: string,
		private readonly token: string
	) {
		super(channel, stream);

		this.registrar = registrarContract.registerClientAndGetServer(
			channel,
			{}
		);
	}

	public readonly registrar: typeof registrarContract["TServerInterface"];

	public async connectToInstance({
		vscodeServerPort,
	}: {
		vscodeServerPort: number;
	}): Promise<VsCodeClient> {
		const data = await connectAndAuthenticate(
			{ tokenStore: new StringToken(this.token), appName: this.appName },
			vscodeServerPort
		);
		return new VsCodeClient(data.channel, data.stream);
	}
}

export class VsCodeClient extends Client {}

export interface TokenStore {
	loadToken(): Promise<string | undefined>;
	storeToken(token: string): void;
}

export class StringToken implements TokenStore {
	constructor(public readonly token: string) {}

	public async loadToken(): Promise<string | undefined> {
		return this.token;
	}

	public storeToken(_token: string): void {
		throw new Error("Not supported");
	}
}

export interface ConnectOptions {
	appName: string;
	tokenStore?: TokenStore;
}

export async function connectToVsCode(
	options: ConnectOptions
): Promise<RegistrarClient> {
	const data = await connectAndAuthenticate(options, RegistrarPort);
	return new RegistrarClient(
		data.channel,
		data.stream,
		options.appName,
		data.token
	);
}

async function connectAndAuthenticate(
	options: ConnectOptions,
	port: number
): Promise<{ stream: WebSocketStream; channel: TypedChannel; token: string }> {
	const stream = await WebSocketStream.connectTo({
		host: "localhost",
		port,
	});
	const channel = TypedChannel.fromStream(
		new StreamLogger(stream),
		new ConsoleRpcLogger()
	);
	channel.startListen();

	const server = authenticationContract.registerClientAndGetServer(
		channel,
		{}
	);

	const appName = options.appName;
	let token: string | undefined = undefined;
	if (options.tokenStore) {
		token = await options.tokenStore.loadToken();
	}
	if (!token) {
		const result = await server.requestToken({ appName });
		token = result.token;
		if (options.tokenStore) {
			options.tokenStore.storeToken(token);
		}
	}

	await server.authenticate({ token, appName });

	return {
		stream,
		channel,
		token,
	};
}
