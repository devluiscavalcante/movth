import { hash, verify } from "@node-rs/argon2";
import { env } from "../config/env.js";

function withPepper(password: string) {
  return `${password}${env.PASSWORD_PEPPER ?? ""}`;
}

export async function hashPassword(password: string) {
  return hash(withPepper(password), {
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1
  });
}

export async function verifyPassword(hashValue: string, password: string) {
  try {
    return await verify(hashValue, withPepper(password));
  } catch {
    return false;
  }
}
