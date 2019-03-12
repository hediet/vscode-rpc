import {
	OneSideContract,
	ContractObject,
	Contract,
	AsOneSideContract,
	JSONArray,
	AnyRequestContract,
	AsRequestContract,
	JSONObject,
	RuntimeJsonType,
} from "@hediet/typed-json-rpc";
import { Type, string } from "io-ts";

class ExternParam<TParamName extends string, TType> {
	constructor(
		public readonly paramName: TParamName,
		public readonly type: RuntimeJsonType<TType>
	) {}

	public get TType(): TType {
		throw new Error("Don't call this method. It is meant for typing only.");
	}
	public get TExtra(): { [TKey in TParamName]: TType } {
		throw new Error("Don't call this method. It is meant for typing only.");
	}

	public set(target: JSONObject, value: TType): void {
		target[this.paramName] = this.type.encode(value);
	}

	public get(target: JSONObject): TType {
		const val = target[this.paramName];
		const r = this.type.decode(val);
		if (r.isLeft()) {
			throw new Error(r.value.map(e => e.message).join(", "));
		} else {
			return r.value;
		}
	}
}

function paramDef<TParamName extends string, TType>(def: {
	paramName: TParamName;
	type: RuntimeJsonType<TType>;
}): ExternParam<TParamName, TType> {
	return new ExternParam(def.paramName, def.type);
}

export const sourceClientIdParam = paramDef({
	paramName: "$sourceClientId",
	type: string,
});

type ExtendServerContract<
	TRequestMap extends OneSideContract
> = AsOneSideContract<
	{
		[TRequest in keyof TRequestMap]: TRequestMap[TRequest] extends AnyRequestContract
			? MapRequest<TRequestMap[TRequest]>
			: {
					kind: "notification";
					params: Type<
						TRequestMap[TRequest]["params"]["_A"] &
							typeof sourceClientIdParam.TExtra,
						JSONArray | JSONObject
					>;
			  }
	}
>;

type MapRequest<TRequest extends AnyRequestContract> = AsRequestContract<{
	kind: "request";
	params: Type<
		TRequest["params"]["_A"] & {
			$sourceClientId: string;
		},
		JSONArray | JSONObject
	>;
	result: TRequest["result"];
	error: TRequest["error"];
}>;

export function dispatched<
	TTags extends string,
	TContractObj extends ContractObject
>(
	contract: Contract<TTags, TContractObj>
): Contract<
	TTags,
	{
		server: ExtendServerContract<TContractObj["server"]>;
		client: TContractObj["client"];
	}
> {
	// TODO
	return contract as any;
}
