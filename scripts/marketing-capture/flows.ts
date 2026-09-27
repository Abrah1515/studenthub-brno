import type { Page } from "@playwright/test";
import { assertCardsDoNotExposeContact, pause, smoothScrollBy, smoothScrollTo } from "./helpers.ts";
import type { FlowDefinition } from "./types.ts";

async function screenshotAfter(page: Page, screenshot: () => Promise<void>, delay = 700) {
  await pause(delay);
  await screenshot();
}

const intro: FlowDefinition = {
  id: "intro",
  order: 1,
  title: "Intro",
  route: "/brno",
  heading: /^StudentHub Brno$/,
  minDurationSeconds: 8,
  maxDurationSeconds: 12,
  async capture(page, context) {
    await screenshotAfter(page, context.screenshot, 900);
    await smoothScrollBy(page, 470, 1_700);
    await pause(1_000);
    await smoothScrollBy(page, 520, 1_600);
    await pause(1_000);
    await smoothScrollBy(page, 380, 1_300);
    await pause(900);
    return ["Domovská stránka a klíčové veřejné sekce zachycené bez přihlášení."];
  },
};

const brigady: FlowDefinition = {
  id: "brigady",
  order: 2,
  title: "Brigády",
  route: "/brno/brigady",
  heading: /^Brigády · Brno$/,
  minDurationSeconds: 8,
  maxDurationSeconds: 12,
  async capture(page, context) {
    await pause(800);
    const cards = page.locator(".job-list article.result-card");
    if (await cards.count()) {
      await smoothScrollTo(page, cards.first(), 1_600, 90);
      await screenshotAfter(page, context.screenshot, 800);
      await smoothScrollBy(page, 460, 1_400);
      await pause(800);
      await smoothScrollBy(page, 460, 1_400);
      await pause(900);
      return ["Detail nabídek vede na externí zdroj, proto capture zůstává uvnitř StudentHubu a externí CTA neotevírá."];
    }
    await context.screenshot();
    await smoothScrollBy(page, 500, 1_600);
    await pause(1_200);
    return ["V době capture nebyla dostupná žádná veřejná karta brigády."];
  },
};

const kalendar: FlowDefinition = {
  id: "kalendar",
  order: 3,
  title: "Kalendář",
  route: "/brno/kalendar",
  heading: /^Kalendář$/,
  minDurationSeconds: 8,
  maxDurationSeconds: 12,
  async capture(page, context) {
    const notes: string[] = [];
    await pause(600);
    const filterButton = page.locator("#hlavni-obsah").getByRole("button", { name: /^Filtry/ }).first();
    if (await filterButton.isVisible().catch(() => false)) {
      await filterButton.click();
      const dialog = page.getByRole("dialog", { name: "Filtry" });
      await dialog.waitFor({ state: "visible", timeout: 4_000 });
      const university = dialog.getByLabel("Univerzita", { exact: true });
      const firstUniversity = await university.locator("option:not([value=''])").first().getAttribute("value");
      if (firstUniversity) {
        await university.selectOption(firstUniversity);
        await pause(500);
        const faculty = dialog.getByLabel("Fakulta", { exact: true });
        const firstFaculty = await faculty.locator("option:not([value=''])").first().getAttribute("value").catch(() => null);
        if (firstFaculty) await faculty.selectOption(firstFaculty);
        notes.push("Škola a fakulta byly vybrány dynamicky z aktuálně dostupných veřejných možností.");
      }
      await pause(600);
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden", timeout: 4_000 }).catch(() => undefined);
    }

    const firstEvent = page.locator("#hlavni-obsah article").first();
    await smoothScrollTo(page, firstEvent, 1_300, 90);
    await screenshotAfter(page, context.screenshot, 800);
    await smoothScrollBy(page, 480, 1_400);
    await pause(900);
    await smoothScrollBy(page, 420, 1_300);
    await pause(900);
    return notes;
  },
};

const mista: FlowDefinition = {
  id: "mista",
  order: 4,
  title: "Místa",
  route: "/brno/mista",
  heading: /^Užitečná místa$/,
  minDurationSeconds: 8,
  maxDurationSeconds: 12,
  async capture(page, context) {
    await pause(700);
    const layout = page.locator(".places-layout");
    await smoothScrollTo(page, layout, 1_500, 80);
    await pause(700);
    const firstPlace = page.locator(".place-card-main").first();
    if (await firstPlace.isVisible().catch(() => false)) {
      await firstPlace.click();
      await page.locator(".place-card.selected .place-details").waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined);
      await screenshotAfter(page, context.screenshot, 1_100);
      await smoothScrollBy(page, 380, 1_300);
      await pause(900);
      await smoothScrollBy(page, 300, 1_100);
      await pause(900);
      return ["Otevřen byl první aktuálně dostupný interní detail místa; geolokace ani externí mapy se nepoužily."];
    }
    await context.screenshot();
    await smoothScrollBy(page, 500, 1_500);
    await pause(1_000);
    return ["V době capture nebyl dostupný veřejný detail místa."];
  },
};

const bydleni: FlowDefinition = {
  id: "bydleni",
  order: 5,
  title: "Bydlení",
  route: "/brno/bydleni",
  heading: /^Bydlení$/,
  minDurationSeconds: 6,
  maxDurationSeconds: 12,
  async capture(page, context) {
    const cards = page.locator(".housing-card");
    await assertCardsDoNotExposeContact(cards);
    await pause(700);
    if (await cards.count()) {
      await smoothScrollTo(page, cards.first(), 1_500, 90);
      await screenshotAfter(page, context.screenshot, 800);
      const link = cards.first().locator("a[href^='/brno/bydleni/']").first();
      if (await link.isVisible().catch(() => false)) {
        await link.click();
        await page.locator("main h1").waitFor({ state: "visible", timeout: 8_000 });
        await pause(1_300);
        await smoothScrollBy(page, 360, 1_200);
        await pause(900);
        await page.goBack({ waitUntil: "domcontentloaded" });
        await page.getByRole("heading", { name: "Bydlení", level: 1 }).waitFor({ state: "visible", timeout: 8_000 });
        await pause(700);
        return ["Otevřen byl veřejný interní detail nabídky; žádný kontakt ani formulář nebyl použit."];
      }
    }

    const wanted = page.getByRole("button", { name: "Hledám bydlení" });
    if (await wanted.isVisible().catch(() => false)) {
      await wanted.click();
      await pause(700);
    }
    await smoothScrollTo(page, page.locator(".housing-results"), 1_200, 90);
    await screenshotAfter(page, context.screenshot, 700);
    await smoothScrollBy(page, 320, 1_100);
    await pause(900);
    return ["Veřejný přehled byl v době capture prázdný; zachycen je pravdivý prázdný stav bez demo dat."];
  },
};

const partak: FlowDefinition = {
  id: "partak",
  order: 6,
  title: "Hledám parťáka",
  route: "/brno/partak",
  heading: /^Hledám parťáka$/,
  minDurationSeconds: 6,
  maxDurationSeconds: 12,
  async capture(page, context) {
    const cards = page.locator(".community-card");
    await assertCardsDoNotExposeContact(cards);
    await pause(700);
    if (await cards.count()) {
      await smoothScrollTo(page, cards.first(), 1_300, 90);
      await screenshotAfter(page, context.screenshot, 800);
      await smoothScrollBy(page, 420, 1_300);
      await pause(1_100);
      return ["Feed je veřejně čitelný; akce vyžadující účet nebyly použity."];
    }
    await smoothScrollTo(page, page.locator(".empty-state").first(), 1_200, 90);
    await screenshotAfter(page, context.screenshot, 700);
    await smoothScrollBy(page, 260, 1_000);
    await pause(1_100);
    return ["Veřejný feed byl v době capture prázdný; přihlášení je potřeba jen pro publikování a připojení."];
  },
};

const komunita: FlowDefinition = {
  id: "komunita",
  order: 7,
  title: "Komunita",
  route: "/brno/komunita",
  heading: /^Studentská komunita$/,
  minDurationSeconds: 6,
  maxDurationSeconds: 12,
  async capture(page, context) {
    const posts = page.locator(".community-post");
    await assertCardsDoNotExposeContact(posts);
    await pause(700);
    await smoothScrollTo(page, page.locator(".community-feed-shell"), 1_200, 80);
    if (await posts.count()) await smoothScrollTo(page, posts.first(), 900, 90);
    await screenshotAfter(page, context.screenshot, 900);
    await smoothScrollBy(page, 360, 1_300);
    await pause(1_100);
    await smoothScrollBy(page, 280, 1_000);
    await pause(900);
    return ["Zachycen byl pouze veřejný feed; reakce, komentáře, hlášení a publikování nebyly použity."];
  },
};

export const featureFlows: FlowDefinition[] = [intro, brigady, kalendar, mista, bydleni, partak, komunita];

export const overviewOrder = ["kalendar", "brigady", "mista", "bydleni", "komunita", "partak", "intro"] as const;
