import { beforeEach, describe, expect, it, vi } from 'vitest';

// ——— finti servizi esterni: archivio Netlify Blobs, Stripe, Brevo e sito pubblicato ———
const archivi = new Map<string, Map<string, unknown>>();
vi.mock('@netlify/blobs', () => ({
  getStore: ({ name }: { name: string }) => {
    if (!archivi.has(name)) archivi.set(name, new Map());
    const a = archivi.get(name)!;
    return {
      get: async (k: string) => a.get(k) ?? null,
      set: async (k: string, v: unknown) => void a.set(k, v),
      setJSON: async (k: string, v: unknown) => void a.set(k, structuredClone(v)),
      delete: async (k: string) => void a.delete(k),
      list: async () => ({ blobs: [...a.keys()].map((key) => ({ key })) }),
    };
  },
}));

const sessioniCreate: Record<string, unknown>[] = [];
let eventoWebhook: unknown;
vi.mock('../netlify/lib/stripe', () => ({
  stripe: () => ({
    checkout: {
      sessions: {
        create: async (p: Record<string, unknown>) => (sessioniCreate.push(p), { url: 'https://checkout.stripe.com/c/pay/prova' }),
        listLineItems: async () => ({
          data: [
            {
              description: 'Crema conduttrice',
              quantity: 2,
              amount_total: 3002,
              price: { unit_amount: 1501, product: { metadata: { id: 'crema' } } },
            },
          ],
        }),
      },
    },
    webhooks: {
      constructEventAsync: async (_corpo: string, firma: string) => {
        if (firma !== 'firma-buona') throw new Error('firma');
        return eventoWebhook;
      },
    },
  }),
}));

let corsiPubblicati: unknown[] = [];
const emailInviate: { percorso: string; corpo: Record<string, any> }[] = [];
const catalogo = {
  negozioAttivo: true,
  spedizione: { costo: 9.9, gratisDa: 150 },
  prodotti: {
    crema: { titolo: 'Crema conduttrice', prezzo: 12.3, disponibilita: 'disponibile', immagine: '/uploads/prodotti/crema.webp' },
    finita: { titolo: 'Finita', prezzo: 5, disponibilita: 'esaurito' },
  },
};
vi.stubGlobal('fetch', async (url: string, opzioni?: RequestInit) => {
  if (url.endsWith('/api/catalogo.json')) return new Response(JSON.stringify(catalogo));
  if (url.endsWith('/api/corsi.json')) return new Response(JSON.stringify(corsiPubblicati));
  if (url.startsWith('https://api.brevo.com/v3')) {
    emailInviate.push({ percorso: url.slice(24), corpo: JSON.parse(String(opzioni?.body)) });
    return new Response(JSON.stringify({ id: 7 }), { status: 201 });
  }
  throw new Error(`fetch inatteso: ${url}`);
});

Object.assign(process.env, {
  URL: 'https://www.fgitalia.it',
  STRIPE_SECRET_KEY: 'sk_test',
  STRIPE_WEBHOOK_SECRET: 'whsec',
  BREVO_API_KEY: 'brevo',
  BREVO_LISTA_ID: '3',
  EMAIL_MITTENTE: 'ordini@fgitalia.it',
  EMAIL_NOTIFICHE: 'papa@example.com',
  ADMIN_PASSWORD: 'una-password-lunga',
});

const { default: checkout } = await import('../netlify/functions/checkout.mts');
const { default: webhook } = await import('../netlify/functions/stripe-webhook.mts');
const { default: statoOrdine } = await import('../netlify/functions/ordine.mts');
const { default: gestione } = await import('../netlify/functions/gestione-ordini.mts');
const { default: iscrizione } = await import('../netlify/functions/iscrizione.mts');
const { default: dopoPubblicazione } = await import('../netlify/functions/deploy-succeeded.mts');
const { creaGettone, gettoneValido } = await import('../netlify/lib/accesso');
const { nuovoNumeroOrdine, numeroValido } = await import('../netlify/lib/ordini');

const post = (url: string, corpo: unknown, intestazioni: Record<string, string> = {}) =>
  new Request(url, { method: 'POST', body: JSON.stringify(corpo), headers: intestazioni });

beforeEach(() => {
  archivi.clear();
  sessioniCreate.length = 0;
  emailInviate.length = 0;
});

describe('checkout', () => {
  it('ricalcola i prezzi dal catalogo e ignora prodotti esauriti o prezzi inviati dal browser', async () => {
    const r = await checkout(
      post('https://x/api/checkout', {
        carrello: [
          { id: 'crema', quantita: 2, prezzo: 0.01 },
          { id: 'finita', quantita: 1 },
        ],
      }),
    );
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ url: 'https://checkout.stripe.com/c/pay/prova' });
    const s = sessioniCreate[0] as any;
    expect(s.line_items).toHaveLength(1);
    expect(s.line_items[0].price_data.unit_amount).toBe(1501);
    expect(s.line_items[0].quantity).toBe(2);
    expect(s.shipping_options[0].shipping_rate_data.fixed_amount.amount).toBe(990);
    expect(numeroValido(s.client_reference_id)).toBe(true);
    expect(s.success_url).toContain(`n=${s.client_reference_id}`);
  });

  it('rifiuta un carrello vuoto', async () => {
    const r = await checkout(post('https://x/api/checkout', { carrello: [{ id: 'finita', quantita: 1 }] }));
    expect(r.status).toBe(400);
    expect(sessioniCreate).toHaveLength(0);
  });
});

describe('webhook Stripe → ordine → stato per il cliente → pannello', () => {
  const numero = 'FG-261026-AB2C';
  const sessione = {
    id: 'cs_test_1',
    client_reference_id: numero,
    metadata: { numero, token: 'tok-segreto' },
    payment_status: 'paid',
    payment_intent: 'pi_1',
    amount_subtotal: 3002,
    amount_total: 3992,
    shipping_cost: { amount_total: 990 },
    customer_details: {
      name: 'Mario Rossi',
      email: 'Mario@Example.com',
      phone: '+39 333 1234567',
      address: { line1: 'Via Roma 1', city: 'Catania', postal_code: '95100', state: 'CT', country: 'IT' },
      tax_ids: [{ type: 'eu_vat', value: 'IT01234567890' }],
    },
    collected_information: {
      shipping_details: { name: 'Studio Rossi', address: { line1: 'Via Etnea 10', city: 'Catania', postal_code: '95100', state: 'CT', country: 'IT' } },
    },
    custom_fields: [{ key: 'sdi_pec', text: { value: 'M5UXCR1' } }],
  };

  it('rifiuta firme non valide', async () => {
    eventoWebhook = { type: 'checkout.session.completed', data: { object: sessione } };
    const r = await webhook(post('https://x/api/stripe-webhook', {}, { 'stripe-signature': 'falsa' }));
    expect(r.status).toBe(400);
  });

  it('flusso completo', async () => {
    eventoWebhook = { type: 'checkout.session.completed', data: { object: sessione } };
    const firma = { 'stripe-signature': 'firma-buona' };
    expect((await webhook(post('https://x/api/stripe-webhook', {}, firma))).status).toBe(200);

    // email a FGItalia e al cliente
    const destinatari = emailInviate.map((e) => e.corpo.to[0].email);
    expect(destinatari).toEqual(['papa@example.com', 'Mario@Example.com']);
    expect(emailInviate[0].corpo.subject).toContain(numero);
    expect(emailInviate[0].corpo.htmlContent).toContain('M5UXCR1');
    expect(emailInviate[0].corpo.htmlContent).toContain('IT01234567890');
    expect(emailInviate[1].corpo.htmlContent).toContain('t=tok-segreto');

    // Stripe può ripetere l'evento: niente ordini o email doppie
    await webhook(post('https://x/api/stripe-webhook', {}, firma));
    expect(emailInviate).toHaveLength(2);

    // il cliente vede lo stato col link o con numero + email (senza distinguere maiuscole)
    const conLink = await statoOrdine(new Request(`https://x/api/ordine?n=${numero}&t=tok-segreto`));
    expect((await conLink.json()).statoTesto).toBe('Ricevuto');
    expect((await statoOrdine(new Request(`https://x/api/ordine?n=${numero.toLowerCase()}&e=mario@example.com`))).status).toBe(200);
    expect((await statoOrdine(new Request(`https://x/api/ordine?n=${numero}&t=sbagliato`))).status).toBe(404);
    expect((await statoOrdine(new Request(`https://x/api/ordine?n=${numero}&e=altro@example.com`))).status).toBe(404);
    const vista = await (await statoOrdine(new Request(`https://x/api/ordine?n=${numero}&t=tok-segreto`))).json();
    expect(vista).not.toHaveProperty('cliente');
    expect(vista).not.toHaveProperty('token');

    // pannello: serve la password
    expect((await gestione(post('https://x/api/gestione-ordini', { azione: 'elenco' }))).status).toBe(401);
    const { gettone } = await (await gestione(post('https://x/api/gestione-ordini', { azione: 'accedi', password: 'una-password-lunga' }))).json();
    const auth = { authorization: `Bearer ${gettone}` };
    const elenco = await (await gestione(post('https://x/api/gestione-ordini', { azione: 'elenco' }, auth))).json();
    expect(elenco).toHaveLength(1);
    expect(elenco[0].spedizione.via).toBe('Via Etnea 10');
    expect(elenco[0].fatturazione.via).toBe('Via Roma 1');
    expect(elenco[0].righe[0]).toMatchObject({ id: 'crema', quantita: 2, totaleCent: 3002 });

    // spedito con tracking: il cliente riceve l'email e lo vede nella pagina
    emailInviate.length = 0;
    const agg = await gestione(
      post('https://x/api/gestione-ordini', { azione: 'aggiorna', numero, stato: 'spedito', corriere: 'BRT', tracking: '123456' }, auth),
    );
    expect((await agg.json()).emailInviata).toBe(true);
    expect(emailInviate[0].corpo.to[0].email).toBe('Mario@Example.com');
    expect(emailInviate[0].corpo.htmlContent).toContain('123456');

    // un link non http non finisce nell'email
    emailInviate.length = 0;
    await gestione(post('https://x/api/gestione-ordini', { azione: 'aggiorna', numero, stato: 'spedito', link: 'javascript:alert(1)' }, auth));
    expect(emailInviate[0].corpo.htmlContent).not.toContain('javascript:');
    const dopo = await (await statoOrdine(new Request(`https://x/api/ordine?n=${numero}&t=tok-segreto`))).json();
    expect(dopo.stato).toBe('spedito');
    expect(dopo.consegna).toEqual({});
    expect(dopo.storico.map((s: { stato: string }) => s.stato)).toEqual(['ricevuto', 'spedito', 'spedito']);
  });

  it('pagamenti differiti: prima in attesa, poi ricevuto', async () => {
    const differita = { ...sessione, payment_status: 'unpaid' };
    const firma = { 'stripe-signature': 'firma-buona' };
    eventoWebhook = { type: 'checkout.session.completed', data: { object: differita } };
    await webhook(post('https://x/api/stripe-webhook', {}, firma));
    let o = await (await statoOrdine(new Request(`https://x/api/ordine?n=${numero}&t=tok-segreto`))).json();
    expect(o.stato).toBe('in_attesa_pagamento');
    eventoWebhook = { type: 'checkout.session.async_payment_succeeded', data: { object: differita } };
    await webhook(post('https://x/api/stripe-webhook', {}, firma));
    o = await (await statoOrdine(new Request(`https://x/api/ordine?n=${numero}&t=tok-segreto`))).json();
    expect(o.stato).toBe('ricevuto');
    expect(o.pagato).toBe(true);
  });
});

describe('accesso al pannello', () => {
  it('password errata', async () => {
    const r = await gestione(post('https://x/api/gestione-ordini', { azione: 'accedi', password: 'no' }));
    expect(r.status).toBe(401);
  }, 5000);

  it('gettone scaduto o firmato con un’altra password', () => {
    const g = creaGettone('pw', 0);
    expect(gettoneValido(g, 'pw', 1000)).toBe(true);
    expect(gettoneValido(g, 'pw', 31 * 24 * 3600 * 1000)).toBe(false);
    expect(gettoneValido(g, 'altra', 1000)).toBe(false);
    expect(gettoneValido('spazzatura', 'pw')).toBe(false);
  });
});

describe('numero ordine', () => {
  it('formato', () => {
    const n = nuovoNumeroOrdine(new Date('2026-10-26T10:00:00Z'));
    expect(n).toMatch(/^FG-261026-[A-Z2-9]{4}$/);
    expect(numeroValido(n)).toBe(true);
    expect(numeroValido('../segreti')).toBe(false);
  });
});

describe('iscrizione agli avvisi', () => {
  const modulo = (campi: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campi)) f.set(k, v);
    return new Request('https://x/api/iscrizione', { method: 'POST', body: f });
  };

  it('aggiunge il contatto alla lista Brevo', async () => {
    const r = await iscrizione(modulo({ email: ' Anna@Example.com ', nome: 'Anna', privacy: 'on' }));
    expect(r.status).toBe(200);
    expect(emailInviate[0]).toMatchObject({ percorso: '/contacts', corpo: { email: 'anna@example.com', listIds: [3] } });
  });

  it('richiede consenso ed email valida, ignora i bot', async () => {
    expect((await iscrizione(modulo({ email: 'anna@example.com' }))).status).toBe(400);
    expect((await iscrizione(modulo({ email: 'non-email', privacy: 'on' }))).status).toBe(400);
    expect((await iscrizione(modulo({ email: 'bot@example.com', privacy: 'on', 'sito-web': 'x' }))).status).toBe(200);
    expect(emailInviate).toHaveLength(0);
  });
});

describe('avviso automatico dei nuovi corsi', () => {
  it('annuncia ogni corso una sola volta e rispetta la spunta "avvisa"', async () => {
    corsiPubblicati = [
      { id: 'kinesio', titolo: 'Kinesio <taping>', data: '2026-12-05', riassunto: 'Teoria e pratica', avvisaIscritti: true },
      { id: 'privato', titolo: 'Interno', data: '2026-12-10', riassunto: '-', avvisaIscritti: false },
    ];
    await dopoPubblicazione();
    expect(emailInviate.map((e) => e.percorso)).toEqual(['/emailCampaigns', '/emailCampaigns/7/sendNow']);
    const campagna = emailInviate[0].corpo;
    expect(campagna.recipients).toEqual({ listIds: [3] });
    expect(campagna.htmlContent).toContain('Kinesio &lt;taping&gt;');
    expect(campagna.htmlContent).toContain('{{ unsubscribe }}');
    expect(campagna.htmlContent).toContain('sabato 5 dicembre 2026');

    emailInviate.length = 0;
    await dopoPubblicazione();
    expect(emailInviate).toHaveLength(0);
  });
});
