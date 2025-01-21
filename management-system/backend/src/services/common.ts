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
