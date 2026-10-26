import type { Config } from '@netlify/functions';
import { errore, json, urlSito } from '../lib/ambiente';
import { leggiCatalogo, leggiSchede } from '../lib/catalogo';
import {
  clienteDaEmail,
  clienteDaLinkReimposta,
  clienteDaRichiesta,
  cifraPassword,
  collegaOrdiniPrecedenti,
  cookieSessione,
  cookieUscita,
  creaLinkReimposta,
  creaSessione,
  dataValida,
  eliminaCliente,
  emailValida,
  idCliente,
  indiceOrdini,
  normalizzaEmail,
  nuovoNumero,
  oggiIso,
  ordiniCliente,
  passwordAccettabile,
  salvaCliente,
  sincronizzaDispositivi,
  verificaPassword,
  vistaAccount,
  type Cliente,
  type DatiFatturazione,
} from '../lib/clienti';
import {
  emailBenvenuto,
  emailConfermaRichiesta,
  emailNegozio,
  emailNuovaRichiestaNegozio,
  emailNuovoPreventivoNegozio,
  emailReimpostaPassword,
  inviaEmail,
  linkStato,
} from '../lib/email';
import type { Indirizzo } from '../lib/ordini';
import {
  TIPI_ASSISTENZA,
  archivioPreventivi,
  creaPreventivo,
  leggiRichiesta,
  salvaRichiesta,
  type Preventivo,
  type RichiestaAssistenza,
  type TipoAssistenza,
} from '../lib/pratiche';

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Testo pulito e di lunghezza ragionevole, oppure undefined se vuoto */
const testo = (v: unknown, massimo = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, massimo) : undefined);

/** Un'email non partita non deve far fallire l'operazione del cliente */
async function notifica(invio: () => Promise<void>) {
  try {
    await invio();
  } catch (e) {
    console.error('Email non inviata', e);
  }
}

const conCookie = (risposta: Response, cookie: string) => {
  risposta.headers.append('Set-Cookie', cookie);
  return risposta;
};

function leggiFatturazione(v: unknown): DatiFatturazione {
  const d = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return {
    ragioneSociale: testo(d.ragioneSociale),
    partitaIva: testo(d.partitaIva, 20)?.replace(/\s/g, '').toUpperCase(),
    codiceFiscale: testo(d.codiceFiscale, 20)?.replace(/\s/g, '').toUpperCase(),
    codiceSdi: testo(d.codiceSdi, 7)?.toUpperCase(),
    pec: testo(d.pec),
    via: testo(d.via),
    cap: testo(d.cap, 10),
    citta: testo(d.citta, 80),
    provincia: testo(d.provincia, 4)?.toUpperCase(),
  };
}

function leggiIndirizzo(v: unknown): Indirizzo {
  const d = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return {
    nome: testo(d.nome),
    via: testo(d.via),
    via2: testo(d.via2),
    cap: testo(d.cap, 10),
    citta: testo(d.citta, 80),
    provincia: testo(d.provincia, 4)?.toUpperCase(),
  };
}

function controllaFatturazione(f: DatiFatturazione): string | undefined {
  if (f.partitaIva && !/^(IT)?\d{11}$/.test(f.partitaIva)) return 'La partita IVA deve avere 11 cifre.';
  if (f.codiceFiscale && !/^([A-Z0-9]{16}|\d{11})$/.test(f.codiceFiscale)) return 'Il codice fiscale non sembra corretto.';
  if (f.codiceSdi && !/^[A-Z0-9]{6,7}$/.test(f.codiceSdi)) return 'Il codice SDI ha 7 caratteri (6 per la pubblica amministrazione).';
  if (f.pec && !emailValida(f.pec.toLowerCase())) return 'L’indirizzo PEC non sembra corretto.';
  return undefined;
}

/** Tutto quello che serve alla pagina "Il mio account" */
async function profilo(c: Cliente, req: Request) {
  const ordini = await ordiniCliente(c);
  try {
    if (sincronizzaDispositivi(c, ordini, await leggiSchede(req))) await salvaCliente(c);
  } catch (e) {
    console.error('Dispositivi non aggiornati', e);
  }
  const [preventivi, assistenza] = await Promise.all([
    Promise.all(c.preventivi.map((n) => archivioPreventivi().get(n, { type: 'json' }) as Promise<Preventivo | null>)),
    Promise.all(c.assistenza.map(leggiRichiesta)),
  ]);
  return {
    account: vistaAccount(c),
    ordini: ordini.map((o) => ({
      numero: o.numero,
      creato: o.creato,
      stato: o.stato,
      pagato: o.pagato,
      righe: o.righe,
      totali: o.totali,
      consegna: o.consegna,
      fattura: !!o.fattura,
      link: linkStato(o),
    })),
    preventivi: preventivi
      .filter((p): p is Preventivo => !!p)
      .map((p) => ({ numero: p.numero, creato: p.creato, validoFino: p.validoFino, totaleCent: p.totaleCent, righe: p.righe }))
      .reverse(),
    assistenza: assistenza.filter((r): r is RichiestaAssistenza => !!r).reverse(),
  };
}

/**
 * Area clienti: registrazione, accesso, dati di fatturazione, dispositivi,
 * preventivi e richieste di assistenza. La sessione è un cookie firmato (HttpOnly).
 */
export default async (req: Request) => {
  try {
    return await gestisci(req);
  } catch (e) {
    // un errore imprevisto diventa un messaggio leggibile (e finisce nei log di Netlify)
    console.error('Area clienti: errore', e);
    const messaggio = e instanceof Error ? e.message : String(e);
    if (messaggio.includes('SESSION_SECRET'))
      return errore('Area clienti non ancora configurata: manca la variabile SESSION_SECRET su Netlify.', 500);
    return errore(`Non è stato possibile completare l’operazione (${messaggio.slice(0, 120)}). Riprova o contattaci.`, 500);
  }
};

async function gestisci(req: Request): Promise<Response> {
  if (req.method !== 'POST') return errore('Metodo non consentito', 405);
  // contro le richieste da altri siti: solo JSON e solo dalla stessa origine
  if (!(req.headers.get('content-type') ?? '').includes('application/json')) return errore('Richiesta non valida');
  const origine = req.headers.get('origin');
  if (origine && origine !== new URL(req.url).origin && origine !== urlSito()) return errore('Origine non consentita', 403);

  let corpo: Record<string, unknown>;
  try {
    corpo = await req.json();
  } catch {
    return errore('Richiesta non valida');
  }

  switch (corpo.azione) {
    case 'registra': {
      const email = normalizzaEmail(corpo.email);
      const nome = testo(corpo.nome, 120);
      const professione = testo(corpo.professione, 80);
      if (!nome) return errore('Scrivi nome e cognome.');
      if (!emailValida(email)) return errore('L’indirizzo email non è valido.');
      if (!passwordAccettabile(corpo.password)) return errore('La password deve avere almeno 8 caratteri.');
      if (!professione) return errore('Indica la tua professione.');
      if (corpo.professionista !== true) return errore('L’area clienti è riservata agli operatori del settore: conferma la dichiarazione.');
      if (await clienteDaEmail(email)) return errore('Esiste già un account con questa email: accedi o recupera la password.', 409);

      const adesso = new Date().toISOString();
      const cliente: Cliente = {
        id: idCliente(email),
        email,
        nome,
        telefono: testo(corpo.telefono, 30),
        professione,
        dichiarazioneProfessionista: adesso,
        creato: adesso,
        passwordHash: await cifraPassword(corpo.password),
        versione: 1,
        fatturazione: {},
        spedizione: {},
        dispositivi: [],
        avvisiManutenzione: true,
        assistenza: [],
        preventivi: [],
      };
      await salvaCliente(cliente);
      await collegaOrdiniPrecedenti(cliente);
      await notifica(() => inviaEmail({ email, nome }, emailBenvenuto(cliente)));
      return conCookie(json({ nome }), cookieSessione(creaSessione(cliente)));
    }

    case 'accedi': {
      const cliente = await clienteDaEmail(normalizzaEmail(corpo.email));
      if (!cliente || !(await verificaPassword(corpo.password, cliente.passwordHash))) {
        await pausa(1200); // rallenta i tentativi a caso
        return errore('Email o password non corrette.', 401);
      }
      return conCookie(json({ nome: cliente.nome }), cookieSessione(creaSessione(cliente)));
    }

    case 'esci':
      return conCookie(json({ uscito: true }), cookieUscita());

    case 'password-dimenticata': {
      const cliente = await clienteDaEmail(normalizzaEmail(corpo.email));
      if (cliente) {
        const link = `${urlSito()}/account/reimposta/?t=${encodeURIComponent(creaLinkReimposta(cliente))}`;
        await notifica(() => inviaEmail({ email: cliente.email, nome: cliente.nome }, emailReimpostaPassword(cliente, link)));
      } else await pausa(400);
      // stessa risposta in ogni caso: non riveliamo quali email hanno un account
      return json({ inviata: true });
    }

    case 'reimposta': {
      const cliente = await clienteDaLinkReimposta(corpo.gettone);
      if (!cliente) return errore('Il link è scaduto o è già stato usato: chiedine uno nuovo.', 400);
      if (!passwordAccettabile(corpo.password)) return errore('La password deve avere almeno 8 caratteri.');
      cliente.passwordHash = await cifraPassword(corpo.password);
      cliente.versione += 1;
      await salvaCliente(cliente);
      return conCookie(json({ nome: cliente.nome }), cookieSessione(creaSessione(cliente)));
    }
  }

  // ——— da qui serve l'accesso ———
  const cliente = await clienteDaRichiesta(req);
  if (!cliente) return conCookie(errore('Accedi per continuare.', 401), cookieUscita());

  switch (corpo.azione) {
    case 'profilo':
      return json(await profilo(cliente, req));

    case 'salva-dati': {
      const nome = testo(corpo.nome, 120);
      if (!nome) return errore('Scrivi nome e cognome.');
      const fatturazione = leggiFatturazione(corpo.fatturazione);
      const problema = controllaFatturazione(fatturazione);
      if (problema) return errore(problema);
      cliente.nome = nome;
      cliente.telefono = testo(corpo.telefono, 30);
      cliente.professione = testo(corpo.professione, 80) ?? cliente.professione;
      // con una nuova partita IVA si ricrea il cliente Stripe, che la tiene salvata
      if (fatturazione.partitaIva !== cliente.fatturazione.partitaIva) delete cliente.stripe;
      cliente.fatturazione = fatturazione;
      cliente.spedizione = leggiIndirizzo(corpo.spedizione);
      cliente.avvisiManutenzione = corpo.avvisiManutenzione !== false;
      await salvaCliente(cliente);
      return json({ account: vistaAccount(cliente) });
    }

    case 'cambia-password': {
      if (!(await verificaPassword(corpo.attuale, cliente.passwordHash))) {
        await pausa(800);
        return errore('La password attuale non è corretta.', 403);
      }
      if (!passwordAccettabile(corpo.nuova)) return errore('La nuova password deve avere almeno 8 caratteri.');
      cliente.passwordHash = await cifraPassword(corpo.nuova);
      cliente.versione += 1; // esce dagli altri dispositivi
      await salvaCliente(cliente);
      return conCookie(json({ cambiata: true }), cookieSessione(creaSessione(cliente)));
    }

    case 'elimina-account': {
      if (!(await verificaPassword(corpo.password, cliente.passwordHash))) {
        await pausa(800);
        return errore('La password non è corretta.', 403);
      }
      // gli ordini restano archiviati per gli obblighi fiscali; si cancellano account e collegamenti
      await eliminaCliente(cliente);
      await indiceOrdini().delete(cliente.id);
      return conCookie(json({ eliminato: true }), cookieUscita());
    }

    case 'dispositivo': {
      const d = (corpo.dispositivo ?? {}) as Record<string, unknown>;
      const esistente = typeof d.id === 'string' ? cliente.dispositivi.find((x) => x.id === d.id) : undefined;
      const mesi = Math.round(Number(d.intervalloMesi));
      if (!Number.isFinite(mesi) || mesi < 1 || mesi > 120) return errore('Indica ogni quanti mesi va fatta la manutenzione (da 1 a 120).');
      if (d.ultimaManutenzione && !dataValida(d.ultimaManutenzione)) return errore('Data dell’ultima manutenzione non valida.');
      if (d.ultimaManutenzione && (d.ultimaManutenzione as string) > oggiIso()) return errore('L’ultima manutenzione non può essere nel futuro.');

      if (esistente) {
        esistente.matricola = testo(d.matricola, 60);
        esistente.ultimaManutenzione = testo(d.ultimaManutenzione, 10);
        esistente.intervalloMesi = mesi;
      } else {
        // apparecchiatura acquistata prima del sito o altrove
        const titolo = testo(d.titolo, 120);
        if (!titolo) return errore('Scrivi il nome del dispositivo.');
        if (!dataValida(d.acquistato)) return errore('Indica la data di acquisto.');
        if (cliente.dispositivi.length >= 100) return errore('Hai raggiunto il numero massimo di dispositivi.');
        cliente.dispositivi.push({
          id: nuovoNumero('manuale').toLowerCase(),
          prodottoId: testo(d.prodottoId, 120),
          titolo,
          acquistato: d.acquistato,
          matricola: testo(d.matricola, 60),
          ultimaManutenzione: testo(d.ultimaManutenzione, 10),
          intervalloMesi: mesi,
        });
      }
      await salvaCliente(cliente);
      return json({ account: vistaAccount(cliente) });
    }

    case 'rimuovi-dispositivo': {
      const prima = cliente.dispositivi.length;
      cliente.dispositivi = cliente.dispositivi.filter((d) => !(d.id === corpo.id && d.id.startsWith('manuale-')));
      if (cliente.dispositivi.length === prima) return errore('Si possono togliere solo i dispositivi aggiunti a mano.');
      await salvaCliente(cliente);
      return json({ account: vistaAccount(cliente) });
    }

    case 'assistenza': {
      const tipo = corpo.tipo as TipoAssistenza;
      if (!(tipo in TIPI_ASSISTENZA)) return errore('Scegli il tipo di richiesta.');
      const descrizione = testo(corpo.descrizione, 3000);
      if (!descrizione || descrizione.length < 10) return errore('Descrivi il problema in qualche parola.');
      const aperte = (await Promise.all(cliente.assistenza.slice(-20).map(leggiRichiesta))).filter((r) => r && r.stato !== 'chiusa');
      if (aperte.length >= 10) return errore('Hai già molte richieste aperte: ti contatteremo a breve.', 429);

      const dispositivo = typeof corpo.dispositivo === 'string' ? cliente.dispositivi.find((d) => d.id === corpo.dispositivo) : undefined;
      const adesso = new Date().toISOString();
      const richiesta: RichiestaAssistenza = {
        numero: nuovoNumero('AS'),
        creato: adesso,
        aggiornato: adesso,
        cliente: { id: cliente.id, nome: cliente.nome, email: cliente.email, telefono: cliente.telefono, professione: cliente.professione },
        ...(dispositivo && {
          dispositivo: { titolo: dispositivo.titolo, matricola: dispositivo.matricola, ordine: dispositivo.ordine, acquistato: dispositivo.acquistato },
        }),
        tipo,
        fermo: corpo.fermo === true,
        descrizione,
        stato: 'aperta',
        storico: [{ stato: 'aperta', data: adesso, autore: 'cliente' }],
      };
      await salvaRichiesta(richiesta);
      cliente.assistenza.push(richiesta.numero);
      await salvaCliente(cliente);
      await notifica(() =>
        inviaEmail({ email: emailNegozio() }, emailNuovaRichiestaNegozio(richiesta), [], { email: cliente.email, nome: cliente.nome }),
      );
      await notifica(() => inviaEmail({ email: cliente.email, nome: cliente.nome }, emailConfermaRichiesta(richiesta)));
      return json({ richiesta });
    }

    case 'rispondi-assistenza': {
      const richiesta = typeof corpo.numero === 'string' && cliente.assistenza.includes(corpo.numero) ? await leggiRichiesta(corpo.numero) : null;
      if (!richiesta) return errore('Richiesta non trovata', 404);
      const nota = testo(corpo.nota, 3000);
      if (!nota) return errore('Scrivi un messaggio.');
      const adesso = new Date().toISOString();
      richiesta.stato = richiesta.stato === 'chiusa' || richiesta.stato === 'in_attesa_cliente' ? 'aperta' : richiesta.stato;
      richiesta.aggiornato = adesso;
      richiesta.storico.push({ stato: richiesta.stato, data: adesso, nota, autore: 'cliente' });
      await salvaRichiesta(richiesta);
      await notifica(() =>
        inviaEmail(
          { email: emailNegozio() },
          { oggetto: `Assistenza ${richiesta.numero}: nuovo messaggio da ${cliente.nome}`, html: emailNuovaRichiestaNegozio({ ...richiesta, descrizione: nota }).html },
          [],
          { email: cliente.email, nome: cliente.nome },
        ),
      );
      return json({ richiesta });
    }

    case 'preventivo': {
      if (cliente.preventivi.length >= 200) cliente.preventivi = cliente.preventivi.slice(-150);
      const [catalogo, schede] = await Promise.all([leggiCatalogo(req), leggiSchede(req)]);
      const codici = Object.fromEntries(Object.entries(schede).map(([id, s]) => [id, s.codice]));
      const preventivo = creaPreventivo(
        nuovoNumero('PV'),
        Array.isArray(corpo.carrello) ? corpo.carrello : [],
        catalogo,
        cliente,
        codici,
        testo(corpo.note, 500),
      );
      if (!preventivo) return errore('Il carrello è vuoto o i prodotti non hanno un prezzo pubblicato.');
      await archivioPreventivi().setJSON(preventivo.numero, preventivo);
      cliente.preventivi.push(preventivo.numero);
      await salvaCliente(cliente);
      await notifica(() =>
        inviaEmail({ email: emailNegozio() }, emailNuovoPreventivoNegozio(preventivo), [], { email: cliente.email, nome: cliente.nome }),
      );
      return json({ numero: preventivo.numero });
    }

    default:
      return errore('Azione sconosciuta');
  }
}

export const config: Config = { path: '/api/account' };
