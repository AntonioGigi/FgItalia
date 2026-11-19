import type { Config, Context } from '@netlify/functions';
import { urlSito } from '../lib/ambiente';
import { emailNegozio, escape, inviaEmail, pagina } from '../lib/email';
import { ipRichiesta, ORE, superaLimite } from '../lib/limiti';
import { archivioMessaggi, nuovoIdMessaggio, type Messaggio } from '../lib/messaggi';

const MODULI = {
  preventivo: {
    titolo: 'Richiesta di preventivo',
    campi: { struttura: 'Studio / struttura', categoria: 'Categoria', prodotto: 'Prodotto' },
    testo: 'messaggio',
  },
  corsi: {
    titolo: 'Iscrizione a un corso',
    campi: { corso: 'Corso', professione: 'Professione' },
    testo: undefined,
  },
} as const;

const vai = (percorso: string) => new Response(null, { status: 303, headers: { Location: `${urlSito()}${percorso}` } });

/**
 * Riceve i moduli "Richiedi un preventivo" e "Iscriviti a un corso": salva il messaggio
 * nel pannello (scheda Messaggi), avvisa FGItalia per email (rispondendo si scrive
 * direttamente al cliente) e porta il visitatore alla pagina di ringraziamento.
 */
export default async (req: Request, context?: Context) => {
  if (req.method !== 'POST') return new Response('Metodo non consentito', { status: 405 });
  const dati = await req.formData().catch(() => null);
  if (!dati) return vai('/contatti/');

  const tipo = String(dati.get('form-name') ?? '') as keyof typeof MODULI;
  const modulo = MODULI[tipo];
  if (!modulo) return vai('/contatti/');
  const ritorno = tipo === 'corsi' ? '/corsi/#iscrizione' : '/contatti/#preventivo';

  // campo nascosto anti-spam: le persone non lo vedono, i robot sì
  if (dati.get('sito-web')) return vai('/grazie/');
  if (await superaLimite(`messaggio-ip:${ipRichiesta(req, context)}`, 10, ORE)) return new Response('Troppi messaggi da questa connessione: riprova fra un’ora oppure chiamaci o scrivici su WhatsApp.', {
      status: 429,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });

  const campo = (nome: string, massimo = 300) => String(dati.get(nome) ?? '').trim().slice(0, massimo);
  const email = campo('email', 200).toLowerCase();
  const nome = campo('nome', 120);
  const testo = modulo.testo ? campo(modulo.testo, 5000) : '';
  if (!nome || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || (modulo.testo && !testo) || dati.get('privacy') !== 'on') return vai(ritorno);

  const messaggio: Messaggio = {
    id: nuovoIdMessaggio(),
    tipo,
    ricevuto: new Date().toISOString(),
    nome,
    email,
    telefono: campo('telefono', 40) || undefined,
    dettagli: Object.entries(modulo.campi)
      .map(([chiave, etichetta]) => ({ etichetta, valore: campo(chiave) }))
      .filter((d) => d.valore),
    testo: testo || undefined,
    letto: false,
    archiviato: false,
  };
  await archivioMessaggi().setJSON(messaggio.id, messaggio);

  try {
    const righe = [
      `<strong>Nome:</strong> ${escape(nome)}`,
      `<strong>Email:</strong> <a href="mailto:${escape(email)}">${escape(email)}</a>`,
      messaggio.telefono && `<strong>Telefono:</strong> <a href="tel:${escape(messaggio.telefono.replace(/[^\d+]/g, ''))}">${escape(messaggio.telefono)}</a>`,
      ...messaggio.dettagli.map((d) => `<strong>${escape(d.etichetta)}:</strong> ${escape(d.valore)}`),
    ].filter(Boolean);
    await inviaEmail(
      { email: emailNegozio() },
      {
        oggetto: `${modulo.titolo} da ${nome}`,
        html: pagina(
          modulo.titolo,
          `<p>${righe.join('<br>')}</p>${testo ? `<p style="padding:14px 16px;background:#f4f7fa;border-radius:10px">${escape(testo).replace(/\n/g, '<br>')}</p>` : ''}
<p>Rispondi a questa email per scrivere direttamente a ${escape(nome)}. Trovi il messaggio anche nel <a href="${urlSito()}/gestione-ordini/#messaggi">pannello, scheda Messaggi</a>.</p>`,
        ),
      },
      [],
      { email, nome },
    );
  } catch (e) {
    // il messaggio è comunque salvato nel pannello
    console.error('Email di avviso del messaggio non inviata', e);
  }
  return vai('/grazie/');
};

export const config: Config = { path: '/api/messaggio' };
