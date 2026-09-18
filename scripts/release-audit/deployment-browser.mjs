import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { artifactRoot } from "./environment.mjs";

const base = process.env.AUDIT_DEPLOYMENT_URL;
if (!base || !/^https:\/\/studenthub-brno-[a-z0-9-]+\.vercel\.app$/.test(base)) throw new Error("Exact project deployment URL required");
const jar = await readFile(join(artifactRoot, "vercel-access-private.txt"), "utf8");
const cookies = jar.split(/\r?\n/).filter(line => line && (!line.startsWith("#") || line.startsWith("#HttpOnly_"))).map(line => {
  const [domain, , path, secure, expires, name, value] = line.replace(/^#HttpOnly_/, "").split("\t");
  return { domain, path, secure: secure === "TRUE", expires: Number(expires) || -1, name, value, httpOnly: line.startsWith("#HttpOnly_"), sameSite: "Lax" };
});
if (!cookies.length) throw new Error("BLOCKED: Vercel authenticated browser cookie unavailable");
await mkdir(artifactRoot, { recursive: true });
const report = { base, at: new Date().toISOString(), cases: [] };
const browser = await chromium.launch({ channel: "chrome" });
try {
  for (const [width,height] of [[390,844],[768,1024],[1440,900]]) for (const theme of ["light","dark"]) {
    const context = await browser.newContext({ viewport:{width,height}, colorScheme:theme, locale:"cs-CZ" });
    await context.addCookies(cookies);
    await context.addInitScript(theme => {
      localStorage.setItem("studenthub-theme", theme);
      localStorage.setItem("studenthub-consent", JSON.stringify({analytics:false,marketing:false}));
      localStorage.setItem("studenthub-preference-v4", JSON.stringify({version:4,cityId:"brno",universityId:null,facultyId:null,studyYear:null,studyYearCycleStart:null,completed:true}));
      localStorage.setItem("studenthub-tutorial-state", JSON.stringify({tutorialVersion:3,introConfirmed:true,status:"completed",lastCompletedStep:"complete"}));
    }, theme);
    const page = await context.newPage();
    let errors=[];
    page.on("pageerror", () => errors.push("Uncaught browser exception"));
    for (const path of ["/brno","/brno/mista","/brno/nastaveni"]) {
      errors=[];
      const response=await page.goto(base+path,{waitUntil:"networkidle",timeout:45000});
      if (new URL(page.url()).hostname!==new URL(base).hostname || /Log in to Vercel|Security verification/.test(await page.title())) throw new Error("BLOCKED: application not accessible");
      const metrics=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth,headings:document.querySelectorAll("main h1").length,brokenImages:[...document.images].filter(i=>i.getBoundingClientRect().width>0 && i.complete && !i.naturalWidth).length,modals:document.querySelectorAll('[aria-modal="true"]').length}));
      const screenshot=`deployment-${width}-${theme}-${path.replaceAll("/","_")}.png`;
      await page.screenshot({path:join(artifactRoot,screenshot)});
      const pass=response?.status()===200 && metrics.overflow<=1 && metrics.headings>0 && metrics.brokenImages===0 && errors.length===0;
      report.cases.push({width,height,theme,path,http:response?.status(),...metrics,errors:[...errors],screenshot,state:pass?"PASS":"FAIL"});
      console.log(JSON.stringify(report.cases.at(-1)));
    }
    await context.close();
  }
} finally {
  await browser.close();
  await writeFile(join(artifactRoot,"deployment-browser.json"),JSON.stringify(report,null,2));
}
if(report.cases.some(c=>c.state!=="PASS")) process.exitCode=1;
