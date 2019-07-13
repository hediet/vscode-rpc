import { createHash } from "crypto";

export function hash(str: string): string {
	const hash = createHash("sha256");
	hash.update(str);
	return hash.digest("hex");
}
