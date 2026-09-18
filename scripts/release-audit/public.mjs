import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { artifactRoot } from "./environment.mjs";

const base = process.env.AUDIT_BASE_URL || "https://studenthubapp.cz";
const report = { at: new Date().toISOString(), base, http: [], browser: [] };
await mkdir(artifactRoot, { recursive: true });
const hostLabel = new URL(base).hostname.replace(/[^a-z0-9.-]/g, "_");
const save = () => writeFile(join(artifactRoot, `public-${hostLabel}.json`), JSON.stringify(report, null, 2));
const paths = ["/", "/brno", "/brno/kalendar", "/brno/mista", "/brno/komunita", "/brno/partak", "/brno/chat", "/brno/hlidac", "/brno/brigady", "/brno/burza", "/brno/bydleni", "/brno/nastaveni", "/o-projektu", "/kontakt", "/soukromi", "/cookies", "/podminky", "/admin/prihlaseni", "/ucet/prihlaseni"];
const redirects = ["/kalendar?university=muni&faculty=muni-fi", "/mista?q=knihovna", "/chat", "/pomoc", "/navrhnout-obsah", "/brno/nabidky", "/admin", "/praha", "/ostrava", "/olomouc", "/neexistujici-mesto-qa", "/brno/neexistujici-stranka-qa", "/robots.txt", "/sitemap.xml", "/manifest.webmanifest", "/sw.js", "/offline.html"];
for (const path of [...paths, ...redirects, "https://www.studenthubapp.cz/brno?q=qa", "https://studenthub-brno.vercel.app/kalendar?university=muni"]) {
  const url = path.startsWith("https:") ? path : base + path;
  try {
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(30000) });
    const html = await response.text();
    const row = { path, http: response.status, location: response.headers.get("location"), mime: response.headers.get("content-type"), hsts: response.headers.get("strict-transport-security"), noindex: response.headers.get("x-robots-tag"), csp: Boolean(response.headers.get("content-security-policy")), title: html.match(/<title>([^<]*)<\/title>/)?.[1], canonical: html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/)?.[1], serverHeading: /<h1[\s>]/.test(html) };
    report.http.push(row);
    const protectedLogin = row.location?.includes("vercel.com/sso-api");
    if (protectedLogin) row.location = "https://vercel.com/sso-api (query redacted)";
    console.log(JSON.stringify({ path, http: row.http, location: row.location }));
    if (protectedLogin || /WEDOS.protection|Security verification|Just a moment|Vercel Security Checkpoint/i.test(html)) {
      row.state = "BLOCKED";
      row.reason = "Ochranná stránka místo aplikace; další automatické kontroly tohoto hostu zastaveny.";
      await save();
      process.exitCode = 2;
      break;
    }
  } catch (error) { report.http.push({ path, error: error.name }); }
  await save();
}
if (process.exitCode) process.exit(process.exitCode);
const protectedPaths = ["/api/admin/data", "/api/admin/users", "/api/admin/profiles", "/api/admin/chat", "/api/admin/community", "/api/admin/housing", "/api/admin/marketplace", "/api/admin/place-moderation", "/api/admin/profile-permissions", "/api/admin/export", "/api/account/content", "/api/chat/conversations", "/api/housing/mine", "/api/cron/sync-sources", "/api/cron/check-links", "/api/cron/housing-maintenance"];
for (const path of protectedPaths) {
  try {
    const response = await fetch(base + path, { redirect: "manual", signal: AbortSignal.timeout(30000) });
    report.http.push({ path, http: response.status, expected: "401/403", state: [401,403].includes(response.status) ? "PASS" : "FAIL" });
    await response.body?.cancel();
  } catch (error) { report.http.push({ path, error: error.name }); }
  await save();
}
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const [width,height] of [[320,568],[360,800],[390,844],[412,915],[768,1024],[1024,768],[1440,900],[1920,1080]]) {
    for (const theme of ["light", "dark"]) {
      const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme, locale: "cs-CZ" });
      await context.addInitScript(({theme}) => {
        localStorage.setItem("studenthub-theme", theme);
        localStorage.setItem("studenthub-consent", JSON.stringify({ analytics: false, marketing: false }));
        localStorage.setItem("studenthub-preference-v4", JSON.stringify({ version:4,cityId:"brno",universityId:null,facultyId:null,studyYear:null,studyYearCycleStart:null,completed:true }));
        localStorage.setItem("studenthub-tutorial-state", JSON.stringify({ tutorialVersion:3,introConfirmed:true,status:"completed",lastCompletedStep:"complete" }));
      }, {theme});
      const page = await context.newPage();
      let errors = [];
      page.on("pageerror", (e) => errors.push({type:"pageerror",message:e.message.slice(0,250)}));
      page.on("response", (r) => { if(r.status()>=400 && new URL(r.url()).origin===base) errors.push({type:"http",path:new URL(r.url()).pathname,status:r.status()}); });
      const selectedPaths = [390,768,1440].includes(width) ? paths : ["/", "/brno", "/brno/mista", "/brno/nastaveni", "/brno/chat"];
      for (const path of selectedPaths) {
        errors = [];
        try {
          const response = await page.goto(base + path, { waitUntil:"domcontentloaded",timeout:45000 });
          await page.locator("h1").first().waitFor({timeout:20000});
          await page.evaluate(() => document.fonts.ready);
          const metrics = await page.evaluate(() => ({
            overflow: Math.max(0,document.documentElement.scrollWidth-innerWidth),
            title:document.title,
            theme:document.documentElement.dataset.theme,
            lang:document.documentElement.lang,
            dialogs:document.querySelectorAll('[role="dialog"][aria-modal="true"]').length,
            images:[...document.images].filter(i=>i.getBoundingClientRect().width>0 && i.complete && i.naturalWidth===0).map(i=>new URL(i.src).pathname),
            headings:[...document.querySelectorAll("h1")].map(h=>h.textContent),
            canonical:document.querySelector('link[rel="canonical"]')?.getAttribute("href"),
            analytics:performance.getEntriesByType("resource").filter(e=>e.name.includes("/api/analytics/")).length,
          }));
          const screenshot=`public-${width}-${theme}-${path.replaceAll("/","_")||"root"}.png`;
          await page.screenshot({path:join(artifactRoot,screenshot)});
          report.browser.push({path,width,height,theme,http:response.status(),...metrics,errors:[...errors],screenshot});
        } catch (error) { report.browser.push({path,width,height,theme,error:error.message.slice(0,300)}); }
        await save();
        console.log(JSON.stringify(report.browser.at(-1)));
      }
      if(width<=860) {
        await page.goto(base+"/brno/mista",{waitUntil:"domcontentloaded",timeout:45000});
        await page.locator('html[data-chat-dock-ready="true"]').waitFor();
        const button=page.getByRole("button",{name:"Otevřít nabídku"});
        await button.click();
        const menu=page.getByRole("dialog",{name:"Mobilní nabídka"});
        await menu.waitFor();
        await page.screenshot({path:join(artifactRoot,`menu-${width}-${theme}.png`)});
        await menu.getByRole("link",{name:"Kontakt",exact:true}).click();
        await page.waitForURL("**/kontakt");
        report.browser.push({path:"menu → Kontakt",width,height,theme,menuClosed:await page.locator(".mobile-menu-panel").count()===0});
        await save();
      }
      await context.close();
    }
  }
} finally { await browser.close(); await save(); }
console.log(JSON.stringify({http:report.http.length,browser:report.browser.length,failures:report.browser.filter(r=>r.error||r.overflow>0||r.errors?.length).length}));
