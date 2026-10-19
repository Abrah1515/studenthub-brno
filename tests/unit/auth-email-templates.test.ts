import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';

it.each(['confirmation', 'recovery'])('keeps %s branded, Czech, self-contained and on Supabase verification', async name => {
  const html = await readFile(`supabase/templates/${name}.html`, 'utf8');
  expect(html).toContain('<html lang="cs">');
  expect(html).toContain('StudentHub');
  expect(html).toContain('href="{{ .ConfirmationURL }}"');
  expect(html).toContain('href="{{ .SiteURL }}"');
  expect(html).toContain('mailto:studenthubbrno@gmail.com');
  expect(html).not.toMatch(/localhost|<script|<form|onerror=|sk-[a-z0-9]|sb_secret_/i);
  expect((html.match(/\.ConfirmationURL/g) || []).length).toBe(1);
});
