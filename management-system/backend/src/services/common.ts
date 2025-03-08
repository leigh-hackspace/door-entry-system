import { scrypt } from "node:crypto";
import { ScryptKeyLength } from "../db/index.ts";

export function scryptAsync(password: string, salt: string) {
  return new Promise<string>((resolve, reject) => {
    scrypt(password, salt, ScryptKeyLength, (err, result) => {
      if (err) return reject(err);
      return resolve(result.toString("base64"));
    });
  });
}

export async function getHexEncodedSha256(data: string) {
  const te = new TextEncoder();

  return Array.from(new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", te.encode(data))))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
