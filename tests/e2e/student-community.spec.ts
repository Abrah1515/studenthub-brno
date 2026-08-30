import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("studenthub-consent", JSON.stringify({ analytics: false, marketing: false }));
    localStorage.setItem("studenthub-preference-v4", JSON.stringify({ version: 4, cityId: "brno", universityId: "vut", facultyId: "vut-fekt", studyYear: 2, studyYearCycleStart: 2026, completed: true }));
    localStorage.setItem("studenthub-tutorial-version", "studenthub-marketplace-v4");
  });
});

test("komunitní feed má bezpečný prázdný stav, filtry a nepřetéká", async ({ page }) => {
  await page.goto("/komunita");
  await expect(page.getByRole("heading", { name: "Studentská komunita", exact: true })).toBeVisible();
  await expect(page.getByText("Komunita zatím čeká na první příspěvek")).toBeVisible();
  await expect(page.getByRole("button", { name: "Nejnovější" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Oblíbené" })).toBeVisible();
  await expect(page.getByLabel("Univerzita", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
});

test("formulář příspěvku vyžádá jednotný účet a zachová jediný modál", async ({ page }) => {
  await page.goto("/komunita"); const trigger = page.getByRole("button", { name: "Napsat příspěvek" }).first(); await trigger.click();
  await expect(page.locator('[role="dialog"][aria-modal="true"]')).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Přihlášení k publikování" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Přihlášení k publikování" })).toContainText("rozepsaný text zůstane uložený");
  await expect(page.getByRole("button", { name: "Zavřít formulář" })).toBeFocused();
  await page.keyboard.press("Escape"); await expect(page.locator('[role="dialog"][aria-modal="true"]')).toHaveCount(0); await expect(trigger).toBeFocused();
});

test("přihlášený formulář drží layout, validuje obrázek a odešle školní rozsah jen jednou", async ({ page }, testInfo) => {
  let submitted = ""; let postRequests = 0;
  await page.route("**/api/community/posts**", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [], viewer: { loggedIn: true, nickname: "Audit", profileComplete: true }, nextPage: null }) });
    postRequests += 1; submitted = route.request().postData() || "";
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ item: { id: "11111111-1111-4111-8111-111111111111", nickname: "Audit", author: { username: "audit_student", displayName: "Audit", verifiedEmail: true, legacy: false }, category: "Studium", body: "Hledám tipy na klidné studium v okolí kampusu.", universityId: "vut", facultyId: "vut-fekt", helpfulCount: 0, commentCount: 0, createdAt: "2026-08-22T10:00:00Z", updatedAt: "2026-08-22T10:00:00Z", owned: true, viewerHelpful: false } }) });
  });
  await page.goto("/komunita"); await page.getByRole("button", { name: "Napsat příspěvek" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Napsat příspěvek" }); await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Zveřejnit příspěvek" }).click(); await expect(dialog.getByRole("alert").first()).toContainText("Zkontrolujte formulář");
  await dialog.getByLabel("Text příspěvku *").fill("Hledám tipy na klidné studium v okolí kampusu.");
  await dialog.locator('select[name="universityId"]').selectOption("vut"); await dialog.locator('select[name="facultyId"]').selectOption("vut-fekt");
  const input = dialog.locator('input[type="file"]'); await input.setInputFiles({ name: "spatny.gif", mimeType: "image/gif", buffer: Buffer.from("GIF89a") }); await expect(dialog.getByText(/JPEG, PNG nebo WebP do 5 MB/)).toBeVisible();
  await input.setInputFiles({ name: "kampus.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64") }); await expect(dialog.getByAltText("Náhled přiloženého obrázku")).toBeVisible();
  await page.screenshot({ path: `artifacts/community-compose-${testInfo.project.name}.png`, fullPage: false });
  await dialog.getByRole("button", { name: "Odebrat" }).click(); await expect(dialog.getByAltText("Náhled přiloženého obrázku")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Zveřejnit příspěvek" }).click({ clickCount: 2 });
  await expect(dialog.getByRole("status")).toContainText("Příspěvek je zveřejněný"); await expect(page.getByText("Hledám tipy na klidné studium v okolí kampusu.")).toBeVisible();
  expect(submitted).toContain('name="universityId"'); expect(submitted).toContain("vut"); expect(submitted).toContain('name="facultyId"'); expect(submitted).toContain("vut-fekt"); expect(postRequests).toBe(1);
  await expect(dialog).toHaveCount(0, { timeout: 3_000 });
});

test("mobilní navigace má přesně pět požadovaných položek a aktivní komunitu", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390"); await page.goto("/komunita"); const nav = page.getByRole("navigation", { name: "Mobilní navigace" });
  await expect(nav.getByRole("link")).toHaveCount(5); await expect(nav.getByRole("link").allTextContents()).resolves.toEqual(["Přehled", "Termíny", "Místa", "Komunita", "Brigády"]);
  await expect(nav.getByRole("link", { name: "Komunita" })).toHaveAttribute("aria-current", "page");
});

test("veřejné API nevrací falešná data a chráněná moderace odmítne anonymní přístup", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440"); const feed = await request.get("/api/community/posts?city=brno&page=1&sort=newest"); expect(feed.status()).toBe(200); const payload = await feed.json(); expect(payload.items).toEqual([]); expect(JSON.stringify(payload)).not.toContain("email");
  const admin = await request.patch("/api/admin/community", { data: { targetType: "settings", targetId: "brno", action: "set_threshold", threshold: 3 } }); expect(admin.status()).toBe(401);
});

test("chatovací dock ustoupí funkčnímu editoru komentářů", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  const conversationId = "e1111111-1111-4111-8111-111111111111"; const postId = "e4444444-4444-4444-8444-444444444444"; const commentId = "e5555555-5555-4555-8555-555555555555";
  const author = { username: "audit_student", displayName: "Audit", verifiedEmail: true, legacy: false };
  const post = { id: postId, nickname: "Audit", author, category: "Studium", body: "Kde se nejlépe učí?", universityId: "vut", facultyId: "vut-fekt", helpfulCount: 0, commentCount: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), owned: true, viewerHelpful: false };
  let comments: Array<Record<string, unknown>> = [];
  await page.route("**/api/chat/**", async (route) => { const url = new URL(route.request().url()); if (url.pathname.endsWith("/bootstrap")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ authenticated: true, available: true, unreadCount: 0 }) }); if (url.pathname.endsWith("/messages")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [], nextCursor: null }) }); return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ conversation: { id: conversationId, status: "active", canSend: true, canAccept: false, archived: false, mutedUntil: null, other: { id: "other", username: "jana", displayName: "Jana" }, context: { type: "profile", title: "Profil Jany", href: "/profil/jana", active: true }, unreadCount: 0, updatedAt: new Date().toISOString() } }) }); });
  await page.route("**/api/community/**", async (route) => { const url = new URL(route.request().url()); const method = route.request().method(); if (url.pathname === "/api/community/posts" && method === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [{ ...post, commentCount: comments.length }], viewer: { loggedIn: true, nickname: "Audit", profileComplete: true }, nextPage: null }) }); if (url.pathname === "/api/community/reactions" && method === "POST") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ active: true, helpfulCount: 1 }) }); if (url.pathname.endsWith(`/posts/${postId}/comments`) && method === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: comments, nextPage: null }) }); if (url.pathname.endsWith(`/posts/${postId}/comments`) && method === "POST") { const body = route.request().postDataJSON(); const item = { id: commentId, body: body.body, author, nickname: "Audit", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), helpfulCount: 0, viewerHelpful: false, isBest: false, owned: true }; comments = [item]; return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ item }) }); } if (url.pathname.endsWith(`/comments/${commentId}`) && method === "PATCH") { const body = route.request().postDataJSON(); comments = comments.map((item) => ({ ...item, body: body.body, updatedAt: new Date().toISOString() })); return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ item: comments[0] }) }); } if (url.pathname.endsWith(`/comments/${commentId}`) && method === "DELETE") { comments = []; return route.fulfill({ status: 204, body: "" }); } return route.fulfill({ status: 404, contentType: "application/json", body: "{}" }); });
  await page.goto("/komunita");
  await page.locator("html[data-chat-dock-ready='true']").waitFor();
  await page.evaluate((id) => window.dispatchEvent(new CustomEvent("studenthub-open-chat", { detail: { id } })), conversationId);
  await expect(page.locator(".chat-dock")).toBeVisible();
  await page.getByRole("button", { name: "Užitečné" }).first().click();
  await expect(page.getByRole("button", { name: "Užitečné" }).first()).toContainText("1");
  await page.getByRole("button", { name: "Komentáře" }).click();
  const editor = page.getByPlaceholder("Napište užitečnou odpověď…");
  await editor.fill("Doporučuji knihovnu v centru.");
  await expect(page.locator(".chat-dock,.chat-dock-minimized")).toHaveCount(0);
  await page.getByRole("button", { name: "Odpovědět" }).click();
  await expect(page.getByText("Doporučuji knihovnu v centru.")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept("Aktualizovaný komentář."));
  await page.getByRole("button", { name: "Upravit" }).last().click();
  await expect(page.getByText("Aktualizovaný komentář.")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Odstranit" }).last().click();
  await expect(page.getByText("Aktualizovaný komentář.")).toHaveCount(0);
  await page.getByRole("button", { name: "Komentáře" }).click();
  await expect(page.locator(".chat-dock-minimized")).toHaveCount(1);
});
