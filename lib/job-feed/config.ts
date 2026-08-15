export type FajnFeedMode = "incremental" | "full_snapshot";

const approvedFeedHost = "media.fajnsprava.cz";

function validFeedUrl(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== approvedFeedHost || url.username || url.password || (url.port && url.port !== "443") || /\/vzor_detail\.xml$/i.test(url.pathname)) return undefined;
    return url.href;
  } catch { return undefined; }
}

export function fajnFeedConfig(env: NodeJS.ProcessEnv = process.env) {
  const feedUrl = validFeedUrl(env.FAJN_BRIGADY_FEED_URL);
  const permissionConfirmed = env.FAJN_BRIGADY_PERMISSION_CONFIRMED === "true";
  const requested = env.FAJN_BRIGADY_FEED_ENABLED === "true";
  const parsedInterval = Number(env.FAJN_BRIGADY_SYNC_INTERVAL_HOURS || 9);
  const intervalHours = Number.isFinite(parsedInterval) ? Math.max(1, Math.min(10, Math.floor(parsedInterval))) : 9;
  const mode: FajnFeedMode = env.FAJN_BRIGADY_FEED_MODE === "full_snapshot" ? "full_snapshot" : "incremental";
  const enabled = requested && permissionConfirmed && Boolean(feedUrl);
  const statusReason = !requested || !permissionConfirmed || !feedUrl
    ? "Čeká se na ostrý XML feed a potvrzení oprávnění."
    : "Zapnuto pro smluvní XML feed.";
  return { enabled, requested, permissionConfirmed, feedUrl, intervalHours, mode, statusReason };
}
