import { describe, expect, it } from 'vitest';
import { getStore, impostaArchivio, type BucketR2 } from '../server/lib/archivio';

/** R2 finto in memoria, con le pagine di list() come quello vero */
function bucketFinto(perPagina = 1000) {
  const dati = new Map<string, string | ArrayBuffer>();
  const bucket: BucketR2 = {
    get: async (k) => {
      if (!dati.has(k)) return null;
      const v = dati.get(k)!;
      return {
        text: async () => (typeof v === 'string' ? v : new TextDecoder().decode(v)),
        arrayBuffer: async () => (typeof v === 'string' ? new TextEncoder().encode(v).buffer : v),
      };
    },
    put: async (k, v) => void dati.set(k, typeof v === 'string' || v instanceof ArrayBuffer ? v : (v.buffer as ArrayBuffer)),
    delete: async (k) => void dati.delete(k),
    list: async ({ prefix, cursor, limit = 1000 }) => {
      const chiavi = [...dati.keys()].filter((k) => k.startsWith(prefix)).sort();
      const inizio = Number(cursor ?? 0);
      const fine = inizio + Math.min(limit, perPagina);
      return { objects: chiavi.slice(inizio, fine).map((key) => ({ key })), truncated: fine < chiavi.length, cursor: String(fine) };
    },
  };
  return { bucket, dati };
}

describe('archivio dati su R2', () => {
  it('separa gli archivi, legge testo, JSON e file, elenca tutte le chiavi anche su più pagine', async () => {
    const { bucket, dati } = bucketFinto(2);
    impostaArchivio(bucket);
    const ordini = getStore({ name: 'ordini', consistency: 'strong' });
    const fatture = getStore({ name: 'fatture' });
    for (const n of ['A', 'B', 'C', 'D', 'E']) await ordini.setJSON(n, { numero: n });
    await fatture.set('A', new Uint8Array([37, 80, 68, 70]).buffer);
    await getStore({ name: 'corsi-annunciati' }).set('kinesio', '2026-11-20');

    expect([...dati.keys()]).toContain('ordini/C');
    expect(await ordini.get('C', { type: 'json' })).toEqual({ numero: 'C' });
    expect(await ordini.get('Z', { type: 'json' })).toBeNull();
    expect(new Uint8Array((await fatture.get('A', { type: 'arrayBuffer' }))!)).toEqual(new Uint8Array([37, 80, 68, 70]));
    expect(await getStore({ name: 'corsi-annunciati' }).get('kinesio')).toBe('2026-11-20');
    expect((await ordini.list()).blobs.map((b) => b.key)).toEqual(['A', 'B', 'C', 'D', 'E']);
    await ordini.delete('C');
    expect((await ordini.list()).blobs).toHaveLength(4);
    expect((await fatture.list()).blobs).toEqual([{ key: 'A' }]);
  });
});

describe('worker Cloudflare', async () => {
  const { default: worker, rotte, programmate } = await import('../server/worker');
  const fileChiesti: string[] = [];
  const env = {
    ASSETS: {
      fetch: async (r: Request) => {
        fileChiesti.push(new URL(r.url).pathname);
        return new Response(`file ${new URL(r.url).pathname}`);
      },
    },
    DATI: bucketFinto().bucket,
    ADMIN_PASSWORD: 'una-password-lunga',
  };

  it('collega ogni percorso /api/… alla sua funzione e ogni orario alle funzioni programmate', () => {
    expect([...rotte.keys()].sort()).toEqual(
      [
        '/api/account',
        '/api/account/documento',
        '/api/account/google',
        '/api/account/google/ritorno',
        '/api/checkout',
        '/api/cms-token',
        '/api/gestione-ordini',
        '/api/iscrizione',
        '/api/messaggio',
        '/api/ordine',
        '/api/stripe-webhook',
      ].sort(),
    );
    expect([...programmate.keys()].sort()).toEqual(['0 7 * * *', '17 * * * *']);
  });

  it('pagine e file generati da Astro arrivano dai file del sito', async () => {
    const r = await worker.fetch(new Request('https://fgitalia.it/api/catalogo.json'), env);
    expect(await r.text()).toBe('file /api/catalogo.json');
  });

  it('le funzioni ricevono l’IP di Cloudflare e le variabili del pannello', async () => {
    const r = await worker.fetch(
      new Request('https://fgitalia.it/api/gestione-ordini', {
        method: 'POST',
        body: JSON.stringify({ azione: 'accedi', password: 'una-password-lunga' }),
        headers: { 'cf-connecting-ip': '1.2.3.4' },
      }),
      env,
    );
    expect(r.status).toBe(200);
    expect(await r.json()).toHaveProperty('gettone');
  });
});
