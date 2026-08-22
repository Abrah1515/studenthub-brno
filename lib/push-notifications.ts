import "server-only";

import webPush from "web-push";
import { insertRecord, listRecords, updateRecord } from "@/lib/data-store";

export function pushConfiguration() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}

export async function sendPendingPushNotifications(limit = 100) {
  const config = pushConfiguration();
  if (!config) return { configured: false, notifications: 0, sent: 0, failed: 0, expired: 0 };

  webPush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  const now = Date.now();
  const notifications = (await listRecords("internal_notifications"))
    .filter((row) => !row.push_sent_at && new Date(String(row.available_at)).getTime() <= now)
    .slice(0, limit);
  const subscriptions = (await listRecords("push_subscriptions")).filter((row) => row.enabled);
  const deliveries = await listRecords("notification_deliveries");
  let sent = 0;
  let failed = 0;
  let expired = 0;

  for (const notification of notifications) {
    const alreadyDelivered = new Set(deliveries
      .filter((row) => row.notification_id === notification.id && row.status === "sent")
      .map((row) => String(row.push_subscription_id)));
    const targets = subscriptions.filter((row) => row.installation_id === notification.installation_id && !alreadyDelivered.has(String(row.id)));
    let retryableFailures = 0;

    for (const subscription of targets) {
      try {
        const result = await webPush.sendNotification({
          endpoint: String(subscription.endpoint),
          expirationTime: subscription.expiration_time == null ? null : Number(subscription.expiration_time),
          keys: { p256dh: String(subscription.p256dh), auth: String(subscription.auth_secret) },
        }, JSON.stringify({
          title: notification.title,
          body: notification.body,
          url: notification.destination_url,
          tag: notification.dedupe_key,
        }), { TTL: 86_400, urgency: notification.kind === "academic_change" ? "high" : "normal" });
        sent += 1;
        await updateRecord("push_subscriptions", String(subscription.id), { last_success_at: new Date().toISOString(), failure_count: 0 });
        await insertRecord("notification_deliveries", { notification_id: notification.id, push_subscription_id: subscription.id, status: "sent", provider_status: result.statusCode });
      } catch (error) {
        const status = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : undefined;
        const invalid = status === 404 || status === 410;
        if (invalid) {
          expired += 1;
          await updateRecord("push_subscriptions", String(subscription.id), { enabled: false, last_failure_at: new Date().toISOString(), failure_count: Number(subscription.failure_count || 0) + 1 });
        } else {
          failed += 1;
          retryableFailures += 1;
          await updateRecord("push_subscriptions", String(subscription.id), { last_failure_at: new Date().toISOString(), failure_count: Number(subscription.failure_count || 0) + 1 });
        }
        await insertRecord("notification_deliveries", {
          notification_id: notification.id,
          push_subscription_id: subscription.id,
          status: invalid ? "expired" : "failed",
          provider_status: status || null,
          error_code: error instanceof Error ? error.message.slice(0, 300) : "push_failed",
        });
      }
    }

    await updateRecord("internal_notifications", String(notification.id), {
      push_sent_at: retryableFailures === 0 ? new Date().toISOString() : null,
      push_attempts: Number(notification.push_attempts || 0) + 1,
      last_push_error: retryableFailures ? "temporary_delivery_failure" : targets.length || alreadyDelivered.size ? null : "no_active_subscription",
    });
  }

  return { configured: true, notifications: notifications.length, sent, failed, expired };
}
