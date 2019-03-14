import { contract, notificationContract } from "@hediet/typed-json-rpc";
import { type, boolean, string } from "io-ts";

export const registrarCliContract = contract({
	server: {},
	client: {
		started: notificationContract({ params: type({ succesful: boolean }) }),
		log: notificationContract({ params: type({ message: string }) }),
		error: notificationContract({ params: type({ message: string }) }),
	},
});
