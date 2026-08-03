export type LinkStatus = "ok" | "redirected" | "blocked" | "temporary_failure" | "broken";

export function classifyLinkStatus(status: number): LinkStatus {
  if (status >= 200 && status < 300) return "ok";
  if (status === 401 || status === 403) return "blocked";
  if ([408, 425, 429].includes(status) || status >= 500) return "temporary_failure";
  if (status === 404 || status === 410) return "broken";
  return status >= 400 ? "broken" : "temporary_failure";
}
