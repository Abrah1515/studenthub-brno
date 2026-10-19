import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
const base = 'https://studenthubapp.cz', results = [];
const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const [width, height] of [[390, 844], [768, 1024], [1440, 900]]) {
    const context = await browser.newContext({ viewport: { width, height } });
    await context.addInitScript(() => {
      localStorage.setItem('studenthub-consent', JSON.stringify({ analytics: false, marketing: false }));
      localStorage.setItem('studenthub-tutorial-state', JSON.stringify({ tutorialVersion: 3, introConfirmed: true, status: 'completed' }));
      localStorage.setItem('studenthub-preference-v4', JSON.stringify({ version: 4, cityId: 'brno', completed: true }));
    });
    const page = await context.newPage(); const errors = [];
    page.on('pageerror', () => errors.push('unhandled_browser_error'));
    for (const path of ['/', '/brno', '/praha', '/olomouc', '/ostrava', '/brno/kalendar?view=community', '/praha/brigady', '/olomouc/brigady', '/ostrava/brigady']) {
      const response = await page.goto(base + path, { waitUntil: 'networkidle' });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (path.includes('kalendar')) await page.reload({ waitUntil: 'networkidle' });
      const state = response.status() === 200 && overflow <= 1 && !errors.length ? 'PASS' : 'FAIL';
      results.push({ name: path, width, state, http: response.status(), overflow, errors: [...errors] }); errors.length = 0;
    }
    for (const theme of ['light', 'dark']) {
      await page.goto(base + '/brno', { waitUntil: 'networkidle' });
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      await mkdir('artifacts/release-2026-10-19', { recursive: true });
      await page.screenshot({ path: `artifacts/release-2026-10-19/production-${width}-${theme}.png`, fullPage: true });
    }
    if (width === 1440) {
      for (const path of ['/api/admin/data', '/api/admin/users', '/api/admin/chat', '/api/account/content', '/api/chat/conversations']) {
        const result = await page.evaluate(async path => { const r = await fetch(path); return { http: r.status, json: r.headers.get('content-type')?.includes('application/json') }; }, path);
        results.push({ name: path, ...result, state: [401, 403].includes(result.http) && result.json ? 'PASS' : 'FAIL' });
      }
      const r = await context.request.get('https://www.studenthubapp.cz/brno?q=qa', { maxRedirects: 0 });
      results.push({ name: 'www redirect', http: r.status(), location: r.headers().location, state: r.status() === 308 && r.headers().location === base + '/brno?q=qa' ? 'PASS' : 'FAIL' });
      for (const path of ['/robots.txt', '/sitemap.xml', '/manifest.webmanifest', '/sw.js', '/offline.html']) {
        const r = await context.request.get(base + path);
        results.push({ name: path, http: r.status(), state: r.status() === 200 ? 'PASS' : 'FAIL' });
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
  await mkdir('artifacts/release-2026-10-19', { recursive: true });
  await writeFile('artifacts/release-2026-10-19/public.json', JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  console.log(JSON.stringify({ pass: results.filter(r => r.state === 'PASS').length, fail: results.filter(r => r.state === 'FAIL') }));
  if (results.some(r => r.state === 'FAIL')) process.exitCode = 1;
}
