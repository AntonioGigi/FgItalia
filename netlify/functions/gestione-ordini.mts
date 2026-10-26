import type { Config } from '@netlify/functions';
import { errore, json, variabile } from '../lib/ambiente';
import { creaGettone, gettoneDaRichiesta, gettoneValido, passwordCorretta } from '../lib/accesso';
import { emailAggiornamentoStato, inviaEmail } from '../lib/email';
import { elencoOrdini, leggiOrdine, salvaOrdine, STATI, type StatoOrdine } from '../lib/ordini';

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

    default:
      return errore('Azione sconosciuta');
  }
};

export const config: Config = { path: '/api/gestione-ordini' };
