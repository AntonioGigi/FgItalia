import type { Config } from '@netlify/functions';
import { errore, json, variabile } from '../lib/ambiente';
import { creaGettone, gettoneDaRichiesta, gettoneValido, passwordCorretta } from '../lib/accesso';
import { emailAggiornamentoRichiesta, emailAggiornamentoStato, emailFatturaDisponibile, inviaEmail } from '../lib/email';
import { archivioFatture, elencoOrdini, leggiOrdine, salvaOrdine, STATI, type StatoOrdine } from '../lib/ordini';
import { elencoRichieste, leggiRichiesta, salvaRichiesta, STATI_ASSISTENZA, type StatoAssistenza } from '../lib/pratiche';

/** Le funzioni Netlify accettano richieste fino a 6 MB: il PDF in base64 pesa un terzo in più */
const FATTURA_MASSIMA = 4 * 1024 * 1024;

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Pannello ordini di FGItalia: accesso, elenco, dettaglio e cambio di stato */
export default async (req: Request) => {
  if (req.method !== 'POST') return errore('Metodo non consentito', 405);
  const password = variabile('ADMIN_PASSWORD');

  let corpo: Record<string, unknown>;
  try {
    corpo = await req.json();
  } catch {
    return errore('Richiesta non valida');
  }

  if (corpo.azione === 'accedi') {
    if (!passwordCorretta(corpo.password, password)) {
      await pausa(1500); // rallenta i tentativi a caso
      return errore('Password errata', 401);
    }
    return json({ gettone: creaGettone(password) });
  }

  if (!gettoneValido(gettoneDaRichiesta(req), password)) return errore('Accesso scaduto: inserisci di nuovo la password', 401);

  switch (corpo.azione) {
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
