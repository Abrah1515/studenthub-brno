import "server-only";

import { createHash, randomBytes } from "node:crypto";

export const ownerCookieName = "sh_help_owner";
const tokenPattern = /^[a-f0-9]{64}$/;

function parseCookie(header: string | null) {
  const entry = (header || "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${ownerCookieName}=`));
  const value = entry?.slice(ownerCookieName.length + 1) || "";
  return tokenPattern.test(value) ? value : null;
}

export function ownerIdentity(request: Request) {
  const existing = parseCookie(request.headers.get("cookie"));
  const token = existing || randomBytes(32).toString("hex");
  return { token, hash: createHash("sha256").update(token).digest("hex"), isNew: !existing };
}

export const ownerCookieOptions = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production" && process.env.ALLOW_LOCAL_FILE_STORE !== "true", path: "/", maxAge: 60 * 60 * 24 * 365 };
