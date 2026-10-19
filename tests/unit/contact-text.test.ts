import { expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { containsPersonalContact } from '@/lib/community';
import { withoutIsoDates } from '@/lib/contact-text';
it.each(['Výuka začíná 2026-10-18.', 'QA-2026-10-18-abcdef', 'Termín 2024-02-29'])('does not mistake a valid date for a phone: %s', value => {
  expect(containsPersonalContact(value)).toBe(false);
});
it.each(['Telefon +420 777 123 456', '2026-10-18-1', 'Neplatné datum 2026-02-30', '2026-13-10', 'Kontakt test@example.test, termín 2026-10-18'])('still rejects actual or ambiguous contact: %s', value => {
  expect(containsPersonalContact(value)).toBe(true);
});
it('preserves phone next to date', () => {
  expect(withoutIsoDates('2026-10-18: +420 777123456')).toContain('+420 777123456');
  expect(containsPersonalContact('2026-10-18: +420 777123456')).toBe(true);
});
