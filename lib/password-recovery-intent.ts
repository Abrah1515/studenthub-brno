import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export const passwordRecoveryIntentCookie = "sh_password_recovery";
const lifetimeSeconds = 15 * 60;

function secret() {
  return process.env.RATE_LIMIT_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

function signature(userId: string, issuedAt: number) {
  const key = secret();
  if (!key) return "";
  return createHmac("sha256", key).update(`${userId}:${issuedAt}:password-recovery`).digest("hex");
}

export function createPasswordRecoveryIntent(userId: string) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const signed = signature(userId, issuedAt);
  return signed ? `${issuedAt}.${signed}` : null;
}

export function verifyPasswordRecoveryIntent(userId: string, value: string | undefined) {
  const match = value?.match(/^(\d{10})\.([a-f0-9]{64})$/);
  if (!match) return false;
  const issuedAt = Number(match[1]);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(issuedAt) || issuedAt > now + 30 || now - issuedAt > lifetimeSeconds) return false;
  const expected = Buffer.from(signature(userId, issuedAt), "hex");
  const actual = Buffer.from(match[2], "hex");
  return expected.length === actual.length && expected.length > 0 && timingSafeEqual(expected, actual);
}
