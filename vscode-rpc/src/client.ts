import {
	TypedChannel,
	RpcLogger,
	RpcStreamLogger,
} from "@hediet/typed-json-rpc";
import { WebSocketStream } from "@hediet/typed-json-rpc-websocket";
import {
	registrarContract,
	authenticationContract,
	RegistrarPort,
} from "./contracts";
import { TokenStore, StringToken } from "./TokenStore";

export abstract class Client {
	constructor(
		public readonly channel: TypedChannel,
		public readonly stream: WebSocketStream
	) {}

	public close(): void {
		this.stream.close();
	}

	public dispose(): void {
		this.close();
	}
}

export class RegistrarClient extends Client {
	constructor(
		channel: TypedChannel,
		stream: WebSocketStream,
		private readonly logger: RpcLogger | undefined,
		private readonly appName: string,
		private readonly token: string
	) {
		super(channel, stream);

		this.registrar = registrarContract.getServer(channel, {}).server;
	}

	public readonly registrar: typeof registrarContract.TServerInterface;

	public async connectToInstance({
		vscodeServerPort,
	}: {
		vscodeServerPort: number;
	}): Promise<VsCodeClient> {
		const data = await connectAndAuthenticate(
			{
				tokenStore: new StringToken(this.token),
				appName: this.appName,
				logger: this.logger,
			},
			vscodeServerPort
		);
		return new VsCodeClient(data.channel, data.stream);
	}
}

export class VsCodeClient extends Client {}

export interface ConnectOptions {
	appName: string;
	tokenStore?: TokenStore;
	logger?: RpcLogger;
}

export async function connectToVsCode(
	options: ConnectOptions
): Promise<RegistrarClient> {
	const data = await connectAndAuthenticate(options, RegistrarPort);
	return new RegistrarClient(
		data.channel,
		data.stream,
		options.logger,
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
	try {
		const channel = TypedChannel.fromStream(
			options.logger
				? new RpcStreamLogger(stream, options.logger)
				: stream,
			options.logger
		);
		channel.startListen();

		const { server } = authenticationContract.getServer(channel, {});

		const appName = options.appName;
		let token: string | undefined = undefined;
		if (options.tokenStore) {
			token = await options.tokenStore.loadToken();
		}

		const loadedTokenFromStore = !!token;
		if (!token) {
			const result = await server.requestToken({ appName });
			token = result.token;
			if (options.tokenStore) {
				options.tokenStore.storeToken(token);
			}
		}

		try {
			await server.authenticate({ token, appName });
		} catch (e) {
			if (loadedTokenFromStore) {
				const result = await server.requestToken({ appName });
				token = result.token;
				if (options.tokenStore) {
					options.tokenStore.storeToken(token);
				}
			}
			await server.authenticate({ token, appName });
		}

		return {
			stream,
			channel,
			token,
		};
	} catch (e) {
		// close only on an exception
		stream.close();
		throw e;
	}
}
