export type FajnFeedMode = "incremental" | "full_snapshot";

export type FajnFeedCity = "brno" | "praha" | "ostrava" | "olomouc";

const approvedFeedHost = "media.fajnsprava.cz";
const feedUrlEnvByCity: Record<FajnFeedCity, string> = {
  brno: "FAJN_BRIGADY_FEED_URL",
  praha: "FAJN_BRIGADY_PRAHA_FEED_URL",
  ostrava: "FAJN_BRIGADY_OSTRAVA_FEED_URL",
  olomouc: "FAJN_BRIGADY_OLOMOUC_FEED_URL",
};

function validFeedUrl(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    let pathname = url.pathname; try { pathname = decodeURIComponent(pathname); } catch { return undefined; }
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== approvedFeedHost || url.username || url.password || (url.port && url.port !== "443") || /\/vzor_detail\.xml\/?$/i.test(pathname)) return undefined;
    return url.href;
  } catch { return undefined; }
}

export function fajnFeedConfig(cityOrEnv: FajnFeedCity | NodeJS.ProcessEnv = "brno", env: NodeJS.ProcessEnv = process.env) {
  const city: FajnFeedCity = typeof cityOrEnv === "string" ? cityOrEnv : "brno";
  if (typeof cityOrEnv !== "string") env = cityOrEnv;
  const feedUrl = validFeedUrl(env[feedUrlEnvByCity[city]]);
  const permissionConfirmed = env.FAJN_BRIGADY_PERMISSION_CONFIRMED === "true";
  const requested = env.FAJN_BRIGADY_FEED_ENABLED === "true";
  const parsedInterval = Number(env.FAJN_BRIGADY_SYNC_INTERVAL_HOURS || 9);
  const intervalHours = Number.isFinite(parsedInterval) ? Math.max(1, Math.min(10, Math.floor(parsedInterval))) : 9;
  const mode: FajnFeedMode = env.FAJN_BRIGADY_FEED_MODE === "full_snapshot" ? "full_snapshot" : "incremental";
  const enabled = requested && permissionConfirmed && Boolean(feedUrl);
  const statusReason = !feedUrl
    ? "Čeká na ostrý XML feed."
    : !requested || !permissionConfirmed
      ? "Ostrý XML feed je uložený, ale import čeká na povolení a potvrzení smluvního oprávnění."
    : "Zapnuto pro smluvní XML feed.";
  return { city, feedUrlEnv: feedUrlEnvByCity[city], enabled, requested, permissionConfirmed, feedUrl, intervalHours, mode, statusReason };
}
