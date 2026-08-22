import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { insertRecord, listRecords, updateRecord } from "@/lib/data-store";

export const installationCookieName = "sh_installation";
const tokenPattern = /^[a-f0-9]{64}$/;

function cookieToken(request: Request) {
  const pair = (request.headers.get("cookie") || "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${installationCookieName}=`));
  const token = pair?.slice(installationCookieName.length + 1) || "";
  return tokenPattern.test(token) ? token : null;
}

export function installationIdentity(request: Request) {
  const existing = cookieToken(request);
  const token = existing || randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(`${process.env.RATE_LIMIT_SALT || "local-installation-salt"}:${token}`).digest("hex");
  return { token, hash, isNew: !existing };
}

export const installationCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production" && process.env.ALLOW_LOCAL_FILE_STORE !== "true",
  path: "/",
  maxAge: 60 * 60 * 24 * 365 * 2,
};

export async function ensureInstallation(request: Request, preference?: { cityId?: string; universityId?: string | null; facultyId?: string | null; studyYear?: number | null }) {
  const identity = installationIdentity(request);
  const rows = await listRecords("anonymous_installations");
  let row = rows.find((item) => item.token_hash === identity.hash);
  const changes = {
    last_seen_at: new Date().toISOString(),
    ...(preference?.cityId ? { city_id: preference.cityId } : {}),
    ...(preference && "universityId" in preference ? { university_id: preference.universityId || null } : {}),
    ...(preference && "facultyId" in preference ? { faculty_id: preference.facultyId || null } : {}),
    ...(preference && "studyYear" in preference ? { study_year: preference.studyYear || null } : {}),
  };
  if (row) row = await updateRecord("anonymous_installations", String(row.id), changes);
  else row = await insertRecord("anonymous_installations", { token_hash: identity.hash, city_id: preference?.cityId || "brno", university_id: preference?.universityId || null, faculty_id: preference?.facultyId || null, study_year: preference?.studyYear || null, ...changes });
  return { identity, row };
}

export function installationCookie(response: { cookies: { set: (name: string, value: string, options: typeof installationCookieOptions) => void } }, identity: ReturnType<typeof installationIdentity>) {
  if (identity.isNew) response.cookies.set(installationCookieName, identity.token, installationCookieOptions);
}
