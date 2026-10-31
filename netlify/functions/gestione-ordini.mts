import type { Config, Context } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import { errore, json, variabile } from '../lib/ambiente';
import { creaGettone, gettoneDaRichiesta, gettoneValido, passwordCorretta } from '../lib/accesso';
import { emailAggiornamentoRichiesta, emailAggiornamentoStato, emailFatturaDisponibile, emailNegozio, inviaEmail } from '../lib/email';
import { nuoviCodiciRecupero, prepara, verifica, type DueFattori } from '../lib/dueFattori';
import { azzera, bloccato, conta, ipRichiesta, MINUTI, ORE } from '../lib/limiti';
import { archivioFatture, elencoOrdini, leggiOrdine, salvaOrdine, STATI, type StatoOrdine } from '../lib/ordini';
import { elencoRichieste, leggiRichiesta, salvaRichiesta, STATI_ASSISTENZA, type StatoAssistenza } from '../lib/pratiche';

/** Le funzioni Netlify accettano richieste fino a 6 MB: il PDF in base64 pesa un terzo in più */
const FATTURA_MASSIMA = 4 * 1024 * 1024;

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Verifica in due passaggi del pannello: un solo segreto, salvato cifrato su Netlify Blobs */
const archivioSicurezza = () => getStore({ name: 'sicurezza', consistency: 'strong' });
const CHIAVE_2FA = 'pannello-due-fattori';
const leggi2fa = async () => (await archivioSicurezza().get(CHIAVE_2FA, { type: 'json' })) as DueFattori | null;
const salva2fa = (d: DueFattori) => archivioSicurezza().setJSON(CHIAVE_2FA, d);

/** Pannello ordini di FGItalia: accesso, elenco, dettaglio e cambio di stato */
export default async (req: Request, context?: Context) => {
  if (req.method !== 'POST') return errore('Metodo non consentito', 405);
  const password = variabile('ADMIN_PASSWORD');
  const ip = ipRichiesta(req, context);

  let corpo: Record<string, unknown>;
  try {
    corpo = await req.json();
  } catch {
    return errore('Richiesta non valida');
  }

  if (corpo.azione === 'accedi') {
    // 5 errori per connessione ogni 15 minuti, 30 in tutto ogni ora (anche da connessioni diverse)
    if (await bloccato(`admin-ip:${ip}`, 5))
      return errore('Troppi tentativi con la password sbagliata: per sicurezza l’accesso è bloccato per 15 minuti. Intanto controlla la password su Netlify (variabile ADMIN_PASSWORD).', 429);
    if (await bloccato('admin-tutti', 30))
      return errore('Troppi tentativi con la password sbagliata da più connessioni: per sicurezza l’accesso è bloccato per un’ora.', 429);
    if (!passwordCorretta(corpo.password, password)) {
      await Promise.all([conta(`admin-ip:${ip}`, 15 * MINUTI), conta('admin-tutti', ORE)]);
      await pausa(1500); // rallenta i tentativi a caso
      return errore('Password errata', 401);
    }
    await azzera(`admin-ip:${ip}`);
    const dueFattori = await leggi2fa();
    if (dueFattori?.attivo) {
      if (!corpo.codice) return json({ serveCodice: true });
      if (await bloccato('admin-codice', 5)) return errore('Troppi codici sbagliati: riprova tra 15 minuti.', 429);
      if (!verifica(dueFattori, corpo.codice)) {
        await conta('admin-codice', 15 * MINUTI);
        await pausa(1500);
        return errore('Codice non valido: controlla l’app o usa un codice di recupero.', 401);
      }
      await salva2fa(dueFattori);
      await azzera('admin-codice');
    }
    return json({ gettone: creaGettone(password) });
  }

  if (!gettoneValido(gettoneDaRichiesta(req), password)) return errore('Accesso scaduto: inserisci di nuovo la password', 401);

  switch (corpo.azione) {
    case 'sicurezza-stato': {
      const d = await leggi2fa();
      return json({ attiva: !!d?.attivo, codiciRimasti: d?.attivo ? d.recupero.length : 0 });
    }

    case 'sicurezza-prepara': {
      if ((await leggi2fa())?.attivo) return errore('La verifica in due passaggi è già attiva.');
      const p = await prepara('pannello ordini');
      await salva2fa(p.dati);
      return json({ qr: p.qr, chiave: p.chiaveManuale, link: p.link });
    }

    case 'sicurezza-attiva': {
      const d = await leggi2fa();
      if (!d || d.attivo) return errore('Prima genera il codice QR.');
      if (!verifica(d, corpo.codice)) return errore('Il codice non corrisponde: controlla che l’ora del telefono sia giusta e riprova.');
      const { codici, impronte } = nuoviCodiciRecupero();
      d.attivo = true;
      d.recupero = impronte;
      await salva2fa(d);
      return json({ attiva: true, codici });
    }

    case 'sicurezza-disattiva':
    case 'sicurezza-nuovi-codici': {
      const d = await leggi2fa();
      if (!d?.attivo) return errore('La verifica in due passaggi non è attiva.');
      if (await bloccato('admin-codice', 5)) return errore('Troppi codici sbagliati: riprova tra 15 minuti.', 429);
      if (!verifica(d, corpo.codice)) {
        await conta('admin-codice', 15 * MINUTI);
        return errore('Codice non valido.', 403);
      }
      if (corpo.azione === 'sicurezza-disattiva') {
        await archivioSicurezza().delete(CHIAVE_2FA);
        return json({ attiva: false });
      }
      const { codici, impronte } = nuoviCodiciRecupero();
      d.recupero = impronte;
      await salva2fa(d);
      return json({ attiva: true, codici });
    }

    case 'elenco':
      return json(await elencoOrdini());

    case 'aggiorna': {
      const ordine = await leggiOrdine(String(corpo.numero));
      if (!ordine) return errore('Ordine non trovato', 404);
      const stato = corpo.stato as StatoOrdine;
      if (!(stato in STATI)) return errore('Stato non valido');
      const testo = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 500) : undefined);
      const nota = testo(corpo.nota);

      ordine.stato = stato;
      if (stato === 'spedito') {
        const link = testo(corpo.link);
        ordine.consegna = {
          corriere: testo(corpo.corriere),
          tracking: testo(corpo.tracking),
          link: link && /^https?:\/\//i.test(link) ? link : undefined,
        };
      }
      ordine.storico.push({ stato, data: new Date().toISOString(), ...(nota && { nota }) });
      await salvaOrdine(ordine);

      let emailInviata = false;
      if (corpo.avvisaCliente !== false && ordine.cliente.email) {
        try {
          await inviaEmail({ email: ordine.cliente.email, nome: ordine.cliente.nome }, emailAggiornamentoStato(ordine, nota));
          emailInviata = true;
        } catch (e) {
          console.error('Email al cliente non inviata', e);
        }
      }
      return json({ ordine, emailInviata });
    }

    case 'carica-fattura': {
      const ordine = await leggiOrdine(String(corpo.numero));
      if (!ordine) return errore('Ordine non trovato', 404);
      const byte = typeof corpo.contenuto === 'string' ? Buffer.from(corpo.contenuto, 'base64') : Buffer.alloc(0);
      if (byte.subarray(0, 5).toString('latin1') !== '%PDF-') return errore('Il file deve essere un PDF.');
      if (byte.length > FATTURA_MASSIMA) return errore('Il PDF è troppo grande (massimo 4 MB).');
      const nome = (typeof corpo.nome === 'string' && corpo.nome.trim() ? corpo.nome.trim() : `Fattura-${ordine.numero}.pdf`)
        .replace(/[^\w.\- ]/g, '_')
        .slice(0, 100);
      await archivioFatture().set(ordine.numero, byte.buffer.slice(byte.byteOffset, byte.byteOffset + byte.length) as ArrayBuffer);
      ordine.fattura = { nome: /\.pdf$/i.test(nome) ? nome : `${nome}.pdf`, caricata: new Date().toISOString() };
      await salvaOrdine(ordine);

      let emailInviata = false;
      if (corpo.avvisaCliente !== false && ordine.cliente.email) {
        try {
          await inviaEmail({ email: ordine.cliente.email, nome: ordine.cliente.nome }, emailFatturaDisponibile(ordine), [
            { nome: ordine.fattura.nome, contenuto: byte.toString('base64') },
          ]);
          emailInviata = true;
        } catch (e) {
          console.error('Email con la fattura non inviata', e);
        }
      }
      return json({ ordine, emailInviata });
    }

    case 'togli-fattura': {
      const ordine = await leggiOrdine(String(corpo.numero));
      if (!ordine) return errore('Ordine non trovato', 404);
      await archivioFatture().delete(ordine.numero);
      delete ordine.fattura;
      await salvaOrdine(ordine);
      return json({ ordine });
    }

    case 'prova-email': {
      // per controllare la configurazione di Brevo: manda un'email di prova e riporta l'errore esatto
      const destinatario = emailNegozio();
      try {
        await inviaEmail({ email: destinatario }, { oggetto: 'Prova email dal sito', html: '<p>Se leggi questa email, l’invio dal sito funziona.</p>' });
        return json({ inviata: true, destinatario });
      } catch (e) {
        return json({ inviata: false, destinatario, errore: e instanceof Error ? e.message : String(e) });
      }
    }

    case 'assistenza-elenco':
      return json(await elencoRichieste());

    case 'assistenza-aggiorna': {
      const richiesta = await leggiRichiesta(String(corpo.numero));
      if (!richiesta) return errore('Richiesta non trovata', 404);
      const stato = corpo.stato as StatoAssistenza;
      if (!(stato in STATI_ASSISTENZA)) return errore('Stato non valido');
      const nota = typeof corpo.nota === 'string' && corpo.nota.trim() ? corpo.nota.trim().slice(0, 3000) : undefined;
      const adesso = new Date().toISOString();
      richiesta.stato = stato;
      richiesta.aggiornato = adesso;
      richiesta.storico.push({ stato, data: adesso, autore: 'fgitalia', ...(nota && { nota }) });
      await salvaRichiesta(richiesta);

      let emailInviata = false;
      if (corpo.avvisaCliente !== false) {
        try {
          await inviaEmail({ email: richiesta.cliente.email, nome: richiesta.cliente.nome }, emailAggiornamentoRichiesta(richiesta, nota));
          emailInviata = true;
        } catch (e) {
          console.error('Email al cliente non inviata', e);
        }
      }
      return json({ richiesta, emailInviata });
    }

    default:
      return errore('Azione sconosciuta');
  }
};

export const config: Config = { path: '/api/gestione-ordini' };
