import { describe, expect, it, vi } from 'vitest';

const chiamate: string[] = [];
vi.stubGlobal('fetch', async (url: string) => {
  chiamate.push(url);
  if (url.endsWith('/api/cambi-programmati.json')) return new Response(JSON.stringify(['2026-11-27', '2026-12-01']));
  return new Response('ok', { status: 201 });
});
Object.assign(process.env, { URL: 'https://www.fgitalia.it', NETLIFY_BUILD_HOOK: 'https://api.netlify.com/build_hooks/prova' });
const { default: aggiorna } = await import('../netlify/functions/aggiorna-sito.mts');

describe('ripubblicazione notturna', () => {
  it('ripubblica solo nei giorni in cui una promozione inizia o finisce', async () => {
    await aggiorna(new Date('2026-11-25T23:05:00Z')); // 26 novembre in Italia
    expect(chiamate.some((u) => u.includes('build_hooks'))).toBe(false);
    await aggiorna(new Date('2026-11-26T23:05:00Z')); // 27 novembre in Italia
    expect(chiamate.filter((u) => u.includes('build_hooks'))).toHaveLength(1);
  });
});
