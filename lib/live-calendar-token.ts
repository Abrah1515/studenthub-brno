import "server-only";
import { createHash } from "node:crypto";

export function liveCalendarTokenHash(token: string) { return createHash("sha256").update(`${process.env.RATE_LIMIT_SALT || "local-calendar-salt"}:${token}`).digest("hex"); }
