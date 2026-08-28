import { expect, test } from "@playwright/test";

const conversationId = "e1111111-1111-4111-8111-111111111111";
const messageId = "e2222222-2222-4222-8222-222222222222";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("studenthub-consent", JSON.stringify({ analytics: false, marketing: false }));
    localStorage.setItem("studenthub-preference-v4", JSON.stringify({ version: 4, cityId: "brno", universityId: "vut", facultyId: "vut-fekt", studyYear: 2, studyYearCycleStart: 2026, completed: true }));
    localStorage.setItem("studenthub-tutorial-version", "studenthub-marketplace-v4");
  });
  let status = "requested"; let messages = [{ id: messageId, senderId: "other", body: "Ahoj, můžeme se domluvit na společném učení?", state: "active", createdAt: new Date().toISOString(), own: false }];
  const conversation = () => ({ id: conversationId, status, requestedByMe: false, canSend: true, canAccept: status === "requested", archived: false, mutedUntil: null, other: { id: "other", username: "jana_studentka", displayName: "Jana Studentka" }, context: { type: "buddy_post", id: "e3333333-3333-4333-8333-333333333333", title: "Reakce na: Společné učení na zkoušku", detail: "Knihovna", href: "/partak", active: true }, lastMessage: messages.at(-1), unreadCount: 1, updatedAt: new Date().toISOString() });
  await page.route("**/api/chat/**", async (route) => {
    const url = new URL(route.request().url()); const method = route.request().method();
    if (url.pathname.endsWith("/bootstrap")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ authenticated: true, available: true, unreadCount: 1 }) });
    if (url.pathname === "/api/chat/conversations" && method === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: url.searchParams.get("tab") === "requests" || url.searchParams.get("tab") === "messages" ? [conversation()] : [] }) });
    if (url.pathname === `/api/chat/conversations/${conversationId}/messages` && method === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: messages, nextCursor: null }) });
    if (url.pathname === `/api/chat/conversations/${conversationId}/messages` && method === "POST") { status = "active"; const input = route.request().postDataJSON(); messages = [...messages, { id: crypto.randomUUID(), senderId: "me", body: input.message, state: "active", createdAt: new Date().toISOString(), own: true }]; return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: messages.at(-1)?.id, acceptedRequest: true }) }); }
    if (url.pathname === `/api/chat/conversations/${conversationId}` && method === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ conversation: conversation() }) });
    if (url.pathname === `/api/chat/conversations/${conversationId}` && method === "PATCH") { const input = route.request().postDataJSON(); if (input.action === "accept") status = "active"; return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ conversation: conversation() }) }); }
    if (url.pathname.includes("/report")) return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ message: "Hlášení bylo bezpečně předáno moderátorům." }) });
    return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ message: "Nenamockováno" }) });
  });
});

test("seznam, žádost, odpověď a messengerové rozložení fungují bez overflow", async ({ page }) => {
  await page.goto("/chat");
  await expect(page.getByRole("heading", { name: "Chat" })).toBeVisible();
  await expect(page.getByText("Jana Studentka")).toBeVisible();
  await page.getByText("Jana Studentka").click();
  await expect(page.getByText("Žádost o kontakt")).toBeVisible();
  await expect(page.getByText(/Společné učení na zkoušku/)).toBeVisible();
  await page.getByRole("button", { name: "Přijmout" }).click();
  await page.getByLabel("Zpráva").fill("Ano, napiš mi prosím navrhovaný čas.");
  await page.getByRole("button", { name: "Odeslat zprávu" }).click();
  await expect(page.getByText("Ano, napiš mi prosím navrhovaný čas.")).toBeVisible();
  await page.locator('summary[aria-label="Akce konverzace"]').click();
  await expect(page.getByRole("button", { name: "Opustit konverzaci" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Archivovat" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await expect(page.locator(".chat-editor")).toBeVisible();
});

test("desktop drží právě jedno minimalizovatelné chatovací okno", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  await page.goto("/brno");
  await page.locator("html[data-chat-dock-ready='true']").waitFor();
  await page.evaluate((id) => window.dispatchEvent(new CustomEvent("studenthub-open-chat", { detail: { id } })), conversationId);
  await expect(page.locator(".chat-dock")).toHaveCount(1);
  await expect(page.locator(".chat-dock")).toHaveCSS("width", "360px");
  await page.getByRole("button", { name: "Minimalizovat chat" }).click();
  await expect(page.getByRole("button", { name: "Otevřít chat" })).toBeVisible();
  await page.getByRole("button", { name: "Otevřít chat" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Otevřít chat" })).toBeVisible();
});
