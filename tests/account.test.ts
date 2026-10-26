import { beforeEach, describe, expect, it, vi } from 'vitest';

// ——— finti servizi esterni: archivio Netlify Blobs, Stripe, Brevo e sito pubblicato ———
const archivi = new Map<string, Map<string, unknown>>();
vi.mock('@netlify/blobs', () => ({
  getStore: ({ name }: { name: string }) => {
    if (!archivi.has(name)) archivi.set(name, new Map());
    const a = archivi.get(name)!;
    return {
      get: async (k: string) => (a.has(k) ? structuredClone(a.get(k)) : null),
      set: async (k: string, v: unknown) => void a.set(k, v),
      setJSON: async (k: string, v: unknown) => void a.set(k, structuredClone(v)),
      delete: async (k: string) => void a.delete(k),
      list: async () => ({ blobs: [...a.keys()].map((key) => ({ key })) }),
    };
  },
}));

const sessioniCreate: Record<string, any>[] = [];
const clientiStripe: Record<string, any>[] = [];
let eventoWebhook: unknown;
vi.mock('../netlify/lib/stripe', () => ({
  stripe: () => ({
    customers: {
      create: async (d: Record<string, unknown>) => (clientiStripe.push(d), { id: `cus_${clientiStripe.length}` }),
      update: async (_id: string, d: Record<string, unknown>) => (clientiStripe.push(d), {}),
      createTaxId: async () => ({}),
    },
    checkout: {
      sessions: {
        create: async (p: Record<string, unknown>) => (sessioniCreate.push(p), { url: 'https://checkout.stripe.com/c/pay/prova' }),
        listLineItems: async () => ({
          data: [
            { description: 'Elettrodi', quantity: 4, amount_total: 4880, price: { unit_amount: 1220, product: { metadata: { id: 'elettrodi' } } } },
            { description: 'Genesy 600', quantity: 1, amount_total: 122000, price: { unit_amount: 122000, product: { metadata: { id: 'genesy' } } } },
          ],
        }),
      },
    },
    webhooks: { constructEventAsync: async () => eventoWebhook },
  }),
}));

const emailInviate: { percorso: string; corpo: Record<string, any> }[] = [];
const catalogo = {
  negozioAttivo: true,
  spedizione: { costo: 9.9, gratisDa: 150 },
  prodotti: {
    elettrodi: { titolo: 'Elettrodi', prezzo: 10, disponibilita: 'disponibile' },
    genesy: { titolo: 'Genesy 600', prezzo: 1000, disponibilita: 'disponibile' },
  },
};
const schede = {
  elettrodi: { titolo: 'Elettrodi', codice: 'EL-50', consumabile: true, documenti: [] },
  genesy: {
    titolo: 'Genesy 600',
    consumabile: false,
    manutenzioneMesi: 12,
    documenti: [{ titolo: 'Certificato CE', file: '/uploads/ce.pdf', tipo: 'certificato_ce' }],
  },
};
vi.stubGlobal('fetch', async (url: string, opzioni?: RequestInit) => {
  if (url.endsWith('/api/catalogo.json')) return new Response(JSON.stringify(catalogo));
  if (url.endsWith('/api/area-clienti.json')) return new Response(JSON.stringify(schede));
  if (url.startsWith('https://api.brevo.com/v3')) {
    emailInviate.push({ percorso: url.slice(24), corpo: JSON.parse(String(opzioni?.body)) });
    return new Response(JSON.stringify({ id: 7 }), { status: 201 });
  }
  throw new Error(`fetch inatteso: ${url}`); // anche il logo del PDF: il documento si crea lo stesso
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
  SESSION_SECRET: 'segreto-di-prova-abbastanza-lungo',
});

const { default: account } = await import('../netlify/functions/account.mts');
const { default: documento } = await import('../netlify/functions/account-documento.mts');
const { default: checkout } = await import('../netlify/functions/checkout.mts');
const { default: webhook } = await import('../netlify/functions/stripe-webhook.mts');
const { default: gestione } = await import('../netlify/functions/gestione-ordini.mts');
const { default: promemoria } = await import('../netlify/functions/promemoria-manutenzione.mts');
const { aggiungiMesi, creaSessione, leggiSessione, clienteDaEmail, salvaCliente } = await import('../netlify/lib/clienti');
const { pulito } = await import('../netlify/lib/pdf');

const json = (corpo: unknown, intestazioni: Record<string, string> = {}) => ({
  method: 'POST',
  body: JSON.stringify(corpo),
  headers: { 'content-type': 'application/json', ...intestazioni },
});
const chiama = (corpo: Record<string, unknown>, cookie = '', altro: Record<string, string> = {}) =>
  account(new Request('https://www.fgitalia.it/api/account', json(corpo, { ...(cookie && { cookie }), ...altro })));
const cookieDa = (r: Response) => (r.headers.get('set-cookie') ?? '').split(';')[0];

const nuovoCliente = { nome: 'Giulia Bianchi', email: 'Giulia@Studio.it', password: 'password-sicura', professione: 'Fisioterapista', professionista: true };

async function registra() {
  const r = await chiama({ azione: 'registra', ...nuovoCliente });
  expect(r.status).toBe(200);
  return cookieDa(r);
}

async function pannello() {
  const r = await gestione(new Request('https://x/api/gestione-ordini', json({ azione: 'accedi', password: 'una-password-lunga' })));
  const { gettone } = await r.json();
  return (corpo: Record<string, unknown>) =>
    gestione(new Request('https://x/api/gestione-ordini', json(corpo, { authorization: `Bearer ${gettone}` })));
}

async function ordinePagato(numero: string, metadati: Record<string, string> = {}, email = 'giulia@studio.it', creato?: string) {
  eventoWebhook = {
    type: 'checkout.session.completed',
    data: {
      object: {
        id: `cs_${numero}`,
        client_reference_id: numero,
        metadata: { numero, token: 'tok', ...metadati },
        payment_status: 'paid',
        amount_subtotal: 126880,
        amount_total: 126880,
        shipping_cost: { amount_total: 0 },
        customer_details: { name: 'Giulia Bianchi', email, address: { line1: 'Via Roma 1', city: 'Catania' } },
        custom_fields: [],
      },
    },
  };
  await webhook(new Request('https://x/api/stripe-webhook', { method: 'POST', body: '{}', headers: { 'stripe-signature': 'ok' } }));
  if (creato) {
    const ordini = archivi.get('ordini')!;
    ordini.set(numero, { ...(ordini.get(numero) as object), creato });
  }
}

beforeEach(() => {
  archivi.clear();
  sessioniCreate.length = 0;
  clientiStripe.length = 0;
  emailInviate.length = 0;
});

describe('registrazione e accesso', () => {
  it('crea l’account, manda il benvenuto e imposta un cookie di sessione sicuro', async () => {
    const r = await chiama({ azione: 'registra', ...nuovoCliente });
    expect(r.status).toBe(200);
    const cookie = r.headers.get('set-cookie')!;
    expect(cookie).toMatch(/^fg_account=.+; Path=\/api; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax$/);
    expect(emailInviate[0].corpo.to[0].email).toBe('giulia@studio.it');
    expect(emailInviate[0].corpo.subject).toContain('Benvenuto');

    // la password non è mai salvata in chiaro e non arriva al browser
    const salvato = JSON.stringify([...archivi.get('clienti')!.values()]);
    expect(salvato).not.toContain('password-sicura');
    const profilo = await (await chiama({ azione: 'profilo' }, cookieDa(r))).json();
    expect(profilo.account).not.toHaveProperty('passwordHash');
    expect(profilo.account.email).toBe('giulia@studio.it');
  });

  it('chiede la dichiarazione di professionista, una password lunga e un’email nuova', async () => {
    expect((await chiama({ azione: 'registra', ...nuovoCliente, professionista: false })).status).toBe(400);
    expect((await chiama({ azione: 'registra', ...nuovoCliente, password: 'corta' })).status).toBe(400);
    expect((await chiama({ azione: 'registra', ...nuovoCliente, email: 'non-email' })).status).toBe(400);
    await registra();
    expect((await chiama({ azione: 'registra', ...nuovoCliente, email: ' giulia@studio.IT ' })).status).toBe(409);
  });

  it('accesso con password giusta, rifiuto con password sbagliata', async () => {
    await registra();
    expect((await chiama({ azione: 'accedi', email: 'giulia@studio.it', password: 'sbagliata' })).status).toBe(401);
    const r = await chiama({ azione: 'accedi', email: 'GIULIA@studio.it', password: 'password-sicura' });
    expect(r.status).toBe(200);
    expect((await chiama({ azione: 'profilo' }, cookieDa(r))).status).toBe(200);
  }, 10_000);

  it('senza sessione valida le azioni riservate rispondono 401', async () => {
    const cookie = await registra();
    expect((await chiama({ azione: 'profilo' })).status).toBe(401);
    expect((await chiama({ azione: 'profilo' }, `${cookie.slice(0, -3)}abc`)).status).toBe(401);
    expect(leggiSessione('spazzatura')).toBeNull();
  });

  it('accetta solo JSON dallo stesso sito', async () => {
    const modulo = new Request('https://www.fgitalia.it/api/account', { method: 'POST', body: 'azione=profilo' });
    expect((await account(modulo)).status).toBe(400);
    expect((await chiama({ azione: 'profilo' }, '', { origin: 'https://malintenzionato.example' })).status).toBe(403);
  });

  it('la sessione scade dopo 30 giorni', async () => {
    await registra();
    const cliente = (await clienteDaEmail('giulia@studio.it'))!;
    const gettone = creaSessione(cliente, 0);
    expect(leggiSessione(gettone, 1000)).not.toBeNull();
    expect(leggiSessione(gettone, 31 * 86_400_000)).toBeNull();
  });

  it('cambiando password le altre sessioni smettono di funzionare', async () => {
    const vecchio = await registra();
    const r = await chiama({ azione: 'cambia-password', attuale: 'password-sicura', nuova: 'nuova-password-lunga' }, vecchio);
    expect(r.status).toBe(200);
    expect((await chiama({ azione: 'profilo' }, vecchio)).status).toBe(401);
    expect((await chiama({ azione: 'profilo' }, cookieDa(r))).status).toBe(200);
  });
});

describe('password dimenticata', () => {
  it('manda un link che vale una volta sola', async () => {
    await registra();
    emailInviate.length = 0;
    expect((await chiama({ azione: 'password-dimenticata', email: 'giulia@studio.it' })).status).toBe(200);
    const link = emailInviate[0].corpo.htmlContent.match(/reimposta\/\?t=([^"&]+)/)[1];
    const gettone = decodeURIComponent(link);

    const r = await chiama({ azione: 'reimposta', gettone, password: 'password-nuova' });
    expect(r.status).toBe(200);
    expect((await chiama({ azione: 'reimposta', gettone, password: 'altra-password' })).status).toBe(400);
    expect((await chiama({ azione: 'accedi', email: 'giulia@studio.it', password: 'password-nuova' })).status).toBe(200);
  });

  it('non rivela se un’email ha un account', async () => {
    const r = await chiama({ azione: 'password-dimenticata', email: 'nessuno@example.com' });
    expect(r.status).toBe(200);
    expect(emailInviate).toHaveLength(0);
  });
});

describe('ordini, fatture, dispositivi e documenti', () => {
  it('collega gli ordini, sincronizza le apparecchiature e fa scaricare la fattura solo al titolare', async () => {
    // un ordine fatto prima di registrarsi compare lo stesso
    await ordinePagato('FG-261020-AAAA');
    const cookie = await registra();
    let profilo = await (await chiama({ azione: 'profilo' }, cookie)).json();
    expect(profilo.ordini.map((o: { numero: string }) => o.numero)).toEqual(['FG-261020-AAAA']);
    expect(profilo.account.dispositivi).toHaveLength(1);
    expect(profilo.account.dispositivi[0]).toMatchObject({ prodottoId: 'genesy', intervalloMesi: 12, ordine: 'FG-261020-AAAA' });

    // la fattura non c'è ancora
    const fattura = () => documento(new Request('https://www.fgitalia.it/api/account/documento?tipo=fattura&n=FG-261020-AAAA', { headers: { cookie } }));
    expect((await fattura()).status).toBe(404);

    // FGItalia carica il PDF dal pannello: il cliente lo riceve in allegato e lo scarica
    const admin = await pannello();
    emailInviate.length = 0;
    const pdf = Buffer.from('%PDF-1.4 fattura di prova');
    expect((await admin({ azione: 'carica-fattura', numero: 'FG-261020-AAAA', contenuto: Buffer.from('non pdf').toString('base64') })).status).toBe(400);
    const caricata = await (await admin({ azione: 'carica-fattura', numero: 'FG-261020-AAAA', nome: 'FT 12/2026.pdf', contenuto: pdf.toString('base64') })).json();
    expect(caricata.emailInviata).toBe(true);
    expect(emailInviate[0].corpo.attachment[0]).toEqual({ name: 'FT 12_2026.pdf', content: pdf.toString('base64') });

    const r = await fattura();
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('application/pdf');
    expect(Buffer.from(await r.arrayBuffer()).toString()).toBe('%PDF-1.4 fattura di prova');
    profilo = await (await chiama({ azione: 'profilo' }, cookie)).json();
    expect(profilo.ordini[0].fattura).toBe(true);

    // il riepilogo d'ordine si genera al volo
    const riepilogo = await documento(new Request('https://www.fgitalia.it/api/account/documento?tipo=riepilogo&n=FG-261020-AAAA', { headers: { cookie } }));
    expect(Buffer.from(await riepilogo.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-');

    // un altro cliente non vede la fattura di Giulia
    const altro = cookieDa(await chiama({ azione: 'registra', ...nuovoCliente, email: 'altro@studio.it' }));
    const tentativo = await documento(new Request('https://www.fgitalia.it/api/account/documento?tipo=fattura&n=FG-261020-AAAA', { headers: { cookie: altro } }));
    expect(tentativo.status).toBe(404);
    // senza accesso si torna alla pagina di login
    expect((await documento(new Request('https://www.fgitalia.it/api/account/documento?tipo=fattura&n=FG-261020-AAAA'))).status).toBe(302);
  });

  it('un acquisto fatto da collegati arriva nell’account anche con un’altra email su Stripe', async () => {
    const cookie = await registra();
    const id = (await clienteDaEmail('giulia@studio.it'))!.id;
    await ordinePagato('FG-261021-BBBB', { cliente: id }, 'amministrazione@studio.it');
    const profilo = await (await chiama({ azione: 'profilo' }, cookie)).json();
    expect(profilo.ordini.map((o: { numero: string }) => o.numero)).toEqual(['FG-261021-BBBB']);
  });

  it('dispositivi aggiunti a mano: date valide e rimozione solo di quelli manuali', async () => {
    const cookie = await registra();
    expect((await chiama({ azione: 'dispositivo', dispositivo: { titolo: 'Laser', acquistato: 'ieri', intervalloMesi: 12 } }, cookie)).status).toBe(400);
    const { account: a } = await (await chiama({ azione: 'dispositivo', dispositivo: { titolo: 'Laser', acquistato: '2025-03-01', intervalloMesi: '6', matricola: 'SN1' } }, cookie)).json();
    expect(a.dispositivi[0]).toMatchObject({ titolo: 'Laser', matricola: 'SN1', prossima: '2025-09-01' });
    const id = a.dispositivi[0].id;
    const agg = await (await chiama({ azione: 'dispositivo', dispositivo: { id, ultimaManutenzione: '2025-10-10', intervalloMesi: 12 } }, cookie)).json();
    expect(agg.account.dispositivi[0].prossima).toBe('2026-10-10');
    expect((await chiama({ azione: 'rimuovi-dispositivo', id }, cookie)).status).toBe(200);
  });
});

describe('dati di fatturazione e pagamento già compilato', () => {
  it('controlla i dati e li passa a Stripe', async () => {
    const cookie = await registra();
    expect((await chiama({ azione: 'salva-dati', nome: 'Giulia Bianchi', fatturazione: { partitaIva: '123' } }, cookie)).status).toBe(400);
    const dati = {
      azione: 'salva-dati',
      nome: 'Giulia Bianchi',
      fatturazione: { ragioneSociale: 'Studio Bianchi', partitaIva: '01234567890', codiceSdi: 'm5uxcr1', via: 'Via Etnea 1', cap: '95100', citta: 'Catania', provincia: 'ct' },
      spedizione: {},
    };
    const salvati = await (await chiama(dati, cookie)).json();
    expect(salvati.account.fatturazione).toMatchObject({ codiceSdi: 'M5UXCR1', provincia: 'CT' });

    const r = await checkout(new Request('https://www.fgitalia.it/api/checkout', json({ carrello: [{ id: 'elettrodi', quantita: 1 }] }, { cookie })));
    expect(r.status).toBe(200);
    const s = sessioniCreate[0];
    expect(s.customer).toBe('cus_1');
    expect(s.customer_creation).toBeUndefined();
    expect(s.metadata.cliente).toMatch(/^[0-9a-f]{32}$/);
    expect(s.custom_fields[0].text).toEqual({ default_value: 'M5UXCR1' });
    expect(clientiStripe[0]).toMatchObject({ email: 'giulia@studio.it', name: 'Studio Bianchi', address: { line1: 'Via Etnea 1', country: 'IT' } });

    // il secondo pagamento riusa lo stesso cliente Stripe
    await checkout(new Request('https://www.fgitalia.it/api/checkout', json({ carrello: [{ id: 'elettrodi', quantita: 1 }] }, { cookie })));
    expect(sessioniCreate[1].customer).toBe('cus_1');
  });
});

describe('preventivi', () => {
  it('crea un preventivo con prezzi netti e totale uguale al carrello, scaricabile in PDF', async () => {
    const cookie = await registra();
    emailInviate.length = 0;
    const r = await chiama({ azione: 'preventivo', carrello: [{ id: 'genesy', quantita: 1 }, { id: 'elettrodi', quantita: 2 }] }, cookie);
    expect(r.status).toBe(200);
    const { numero } = await r.json();
    expect(numero).toMatch(/^PV-\d{6}-[A-Z2-9]{4}$/);

    const p = archivi.get('preventivi')!.get(numero) as any;
    expect(p.righe.map((x: any) => x.nettoCent)).toEqual([100000, 1000]);
    expect(p.totaleCent).toBe(124440); // 1.220,00 + 2 × 12,20, spedizione gratuita oltre 150 €
    expect(p.imponibileCent + p.ivaCent).toBe(p.totaleCent);
    expect(p.righe[1].codice).toBe('EL-50');
    expect(emailInviate[0].corpo.to[0].email).toBe('papa@example.com');
    expect(emailInviate[0].corpo.replyTo.email).toBe('giulia@studio.it');

    const pdf = await documento(new Request(`https://www.fgitalia.it/api/account/documento?tipo=preventivo&n=${numero}`, { headers: { cookie } }));
    expect(pdf.status).toBe(200);
    expect(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.headers.get('content-disposition')).toContain(`Preventivo-${numero}.pdf`);
  });

  it('serve l’accesso e un carrello con prezzi', async () => {
    expect((await chiama({ azione: 'preventivo', carrello: [{ id: 'genesy', quantita: 1 }] })).status).toBe(401);
    const cookie = await registra();
    expect((await chiama({ azione: 'preventivo', carrello: [] }, cookie)).status).toBe(400);
  });

  it('i PDF sopportano caratteri fuori dall’alfabeto dei font standard', () => {
    expect(pulito('Crema “arnica” – 100 mL € ✓ 中')).toBe('Crema “arnica” – 100 mL € ? ?');
  });
});

describe('assistenza', () => {
  it('la richiesta con studio fermo arriva come prioritaria e il cliente riceve le risposte', async () => {
    const cookie = await registra();
    const { account: a } = await (await chiama({ azione: 'dispositivo', dispositivo: { titolo: 'Tecar', acquistato: '2025-01-10', intervalloMesi: 12, matricola: 'T-9' } }, cookie)).json();
    emailInviate.length = 0;
    expect((await chiama({ azione: 'assistenza', tipo: 'guasto', descrizione: 'corta' }, cookie)).status).toBe(400);
    const r = await chiama({ azione: 'assistenza', tipo: 'guasto', fermo: true, dispositivo: a.dispositivi[0].id, descrizione: 'Non si accende più <da stamattina>' }, cookie);
    const { richiesta } = await r.json();
    expect(richiesta.dispositivo).toMatchObject({ titolo: 'Tecar', matricola: 'T-9' });
    expect(emailInviate[0].corpo.subject).toContain('PRIORITARIA');
    expect(emailInviate[0].corpo.htmlContent).toContain('&lt;da stamattina&gt;');
    expect(emailInviate[1].corpo.to[0].email).toBe('giulia@studio.it');

    const admin = await pannello();
    const elenco = await (await admin({ azione: 'assistenza-elenco' })).json();
    expect(elenco[0].numero).toBe(richiesta.numero);
    emailInviate.length = 0;
    await admin({ azione: 'assistenza-aggiorna', numero: richiesta.numero, stato: 'in_lavorazione', nota: 'Passa il tecnico domani alle 9' });
    expect(emailInviate[0].corpo.htmlContent).toContain('Passa il tecnico domani alle 9');

    const profilo = await (await chiama({ azione: 'profilo' }, cookie)).json();
    expect(profilo.assistenza[0].stato).toBe('in_lavorazione');
    const risposta = await chiama({ azione: 'rispondi-assistenza', numero: richiesta.numero, nota: 'Perfetto, grazie' }, cookie);
    expect((await risposta.json()).richiesta.storico).toHaveLength(3);
    // non si risponde alle richieste degli altri
    const altro = cookieDa(await chiama({ azione: 'registra', ...nuovoCliente, email: 'altro@studio.it' }));
    expect((await chiama({ azione: 'rispondi-assistenza', numero: richiesta.numero, nota: 'ciao' }, altro)).status).toBe(404);
  });
});

describe('promemoria di manutenzione', () => {
  it('avvisa una sola volta per scadenza e rispetta la scelta del cliente', async () => {
    const cookie = await registra();
    const oggi = new Date().toISOString().slice(0, 10);
    const tra20giorni = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);
    const [a, m, g] = tra20giorni.split('-').map(Number);
    const ultima = `${a - 1}-${String(m).padStart(2, '0')}-${String(Math.min(g, 28)).padStart(2, '0')}`;
    await chiama({ azione: 'dispositivo', dispositivo: { titolo: 'Laser', acquistato: ultima, intervalloMesi: 12 } }, cookie);
    expect(ultima <= oggi).toBe(true);
    emailInviate.length = 0;

    await promemoria();
    expect(emailInviate).toHaveLength(1);
    expect(emailInviate[0].corpo.subject).toContain('Laser');
    await promemoria();
    expect(emailInviate).toHaveLength(1);

    // con i promemoria spenti non parte nulla
    const c = (await clienteDaEmail('giulia@studio.it'))!;
    c.avvisiManutenzione = false;
    c.dispositivi[0].avvisato = undefined;
    await salvaCliente(c);
    await promemoria();
    expect(emailInviate).toHaveLength(1);
  });

  it('conta i mesi senza sforare a fine mese', () => {
    expect(aggiungiMesi('2026-01-31', 1)).toBe('2026-02-28');
    expect(aggiungiMesi('2024-01-31', 1)).toBe('2024-02-29');
    expect(aggiungiMesi('2025-10-10', 12)).toBe('2026-10-10');
  });
});

describe('eliminazione dell’account', () => {
  it('serve la password; gli ordini restano archiviati', async () => {
    await ordinePagato('FG-261022-CCCC');
    const cookie = await registra();
    expect((await chiama({ azione: 'elimina-account', password: 'no' }, cookie)).status).toBe(403);
    expect((await chiama({ azione: 'elimina-account', password: 'password-sicura' }, cookie)).status).toBe(200);
    expect(await clienteDaEmail('giulia@studio.it')).toBeNull();
    expect((await chiama({ azione: 'profilo' }, cookie)).status).toBe(401);
    expect(archivi.get('ordini')!.has('FG-261022-CCCC')).toBe(true);
  }, 10_000);
});

describe('errori imprevisti', () => {
  it('spiega cosa manca invece di un errore generico', async () => {
    const cookie = await registra();
    const segreto = process.env.SESSION_SECRET;
    delete process.env.SESSION_SECRET;
    try {
      const r = await chiama({ azione: 'preventivo', carrello: [{ id: 'genesy', quantita: 1 }] }, cookie);
      expect(r.status).toBe(500);
      expect((await r.json()).errore).toContain('SESSION_SECRET');
    } finally {
      process.env.SESSION_SECRET = segreto;
    }
  });

  it('legge il catalogo dall’indirizzo e con le credenziali della richiesta', async () => {
    const cookie = await registra();
    const chiesti: string[] = [];
    const intestazioni: Record<string, string>[] = [];
    const originale = globalThis.fetch;
    vi.stubGlobal('fetch', async (url: string, opzioni?: RequestInit) => {
      chiesti.push(url);
      intestazioni.push((opzioni?.headers ?? {}) as Record<string, string>);
      return originale(url, opzioni);
    });
    try {
      const r = await account(
        new Request(
          'https://anteprima.netlify.app/api/account',
          json({ azione: 'preventivo', carrello: [{ id: 'genesy', quantita: 1 }] }, { cookie, authorization: 'Basic cHJvdmE6cHJvdmE=' }),
        ),
      );
      expect(r.status).toBe(200);
      expect(chiesti).toContain('https://anteprima.netlify.app/api/catalogo.json');
      // sito protetto da password: cookie e credenziali del visitatore passano alla lettura del catalogo
      expect(intestazioni[0]).toMatchObject({ cookie, authorization: 'Basic cHJvdmE6cHJvdmE=' });
    } finally {
      vi.stubGlobal('fetch', originale);
    }
  });
});
