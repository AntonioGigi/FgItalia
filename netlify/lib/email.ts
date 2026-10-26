import { euro } from '../../src/lib/negozio';
import { sito } from '../../src/lib/sito';
import { variabile, variabileFacoltativa, urlSito } from './ambiente';
import { STATI, type Ordine } from './ordini';

/**
 * Email inviate con Brevo (piano gratuito: 300 email al giorno).
 * Servono BREVO_API_KEY e EMAIL_MITTENTE (un indirizzo verificato su Brevo).
 */
const API = 'https://api.brevo.com/v3';

export const escape = (testo: unknown) =>
  String(testo ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

async function chiamaBrevo(percorso: string, corpo: unknown): Promise<Record<string, unknown>> {
  const risposta = await fetch(`${API}${percorso}`, {
    method: 'POST',
    headers: { 'api-key': variabile('BREVO_API_KEY'), 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(corpo),
  });
  const testo = await risposta.text();
  if (!risposta.ok) throw new Error(`Brevo ${percorso} → ${risposta.status}: ${testo}`);
  return testo ? JSON.parse(testo) : {};
}

const mittente = () => ({ name: sito.nome_breve, email: variabile('EMAIL_MITTENTE') });

export interface Messaggio {
  oggetto: string;
  html: string;
}

export async function inviaEmail(destinatario: { email: string; nome?: string }, { oggetto, html }: Messaggio) {
  await chiamaBrevo('/smtp/email', {
    sender: mittente(),
    to: [{ email: destinatario.email, ...(destinatario.nome && { name: destinatario.nome }) }],
    replyTo: { email: sito.email || variabile('EMAIL_MITTENTE'), name: sito.nome_breve },
    subject: oggetto,
    htmlContent: html,
  });
}

/** Indirizzo a cui arrivano le notifiche dei nuovi ordini (di default l'email del sito) */
export const emailNegozio = () => variabileFacoltativa('EMAIL_NOTIFICHE') ?? sito.email;

export async function aggiungiIscritto(email: string, nome: string | undefined) {
  const contatto = { email, listIds: [Number(variabile('BREVO_LISTA_ID'))], updateEnabled: true };
  if (!nome) return void (await chiamaBrevo('/contacts', contatto));
  try {
    await chiamaBrevo('/contacts', { ...contatto, attributes: { FIRSTNAME: nome } });
  } catch {
    // l'attributo del nome cambia fra account Brevo: se manca, salvo solo l'email
    await chiamaBrevo('/contacts', contatto);
  }
}

/** Crea e invia subito una campagna email a tutta la lista degli iscritti agli avvisi */
export async function inviaCampagna(nome: string, oggetto: string, html: string) {
  const campagna = await chiamaBrevo('/emailCampaigns', {
    name: nome,
    subject: oggetto,
    sender: mittente(),
    htmlContent: html,
    recipients: { listIds: [Number(variabile('BREVO_LISTA_ID'))] },
  });
  await chiamaBrevo(`/emailCampaigns/${campagna.id}/sendNow`, {});
}

// ——— Modelli ———

export function pagina(titolo: string, contenuto: string): string {
  return `<!doctype html><html lang="it"><body style="margin:0;background:#f4f7fe;font-family:Arial,Helvetica,sans-serif;color:#14212b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="padding:20px 28px;border-bottom:4px solid #f8c800"><img src="${urlSito()}${sito.logo || '/apple-touch-icon.png'}" alt="${escape(sito.nome_breve)}" height="44" style="display:block;height:44px"></td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 16px;font-size:22px;color:#08163f">${escape(titolo)}</h1>
${contenuto}
</td></tr>
<tr><td style="padding:18px 28px;background:#08163f;color:#c9d3da;font-size:12px;line-height:1.6">
${escape(sito.ragione_sociale)} · ${escape(sito.indirizzo)}, ${escape(sito.cap)} ${escape(sito.citta)} (${escape(sito.provincia)}) · P.IVA ${escape(sito.piva)}<br>
${sito.telefono ? `Tel. ${escape(sito.telefono)} · ` : ''}${escape(sito.email)} · <a href="${urlSito()}" style="color:#f8c800">${escape(urlSito().replace(/^https?:\/\//, ''))}</a>
</td></tr></table></td></tr></table></body></html>`;
}

const pulsante = (testo: string, link: string) =>
  `<p style="margin:24px 0"><a href="${escape(link)}" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#f8c800;color:#08163f;font-weight:bold;text-decoration:none">${escape(testo)}</a></p>`;

const indirizzo = (i: Ordine['spedizione']) =>
  [i.nome, i.via, i.via2, [i.cap, i.citta, i.provincia && `(${i.provincia})`].filter(Boolean).join(' ')]
    .filter(Boolean)
    .map(escape)
    .join('<br>');

function riepilogo(o: Ordine): string {
  const righe = o.righe
    .map(
      (r) => `<tr><td style="padding:8px 0;border-bottom:1px solid #e2e8ec">${r.quantita} × ${escape(r.titolo)}</td>
<td align="right" style="padding:8px 0;border-bottom:1px solid #e2e8ec;white-space:nowrap">${euro(r.totaleCent)}</td></tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">${righe}
<tr><td style="padding:8px 0">Spedizione</td><td align="right">${o.totali.spedizioneCent ? euro(o.totali.spedizioneCent) : 'Gratuita'}</td></tr>
<tr><td style="padding:8px 0;font-weight:bold">Totale (IVA inclusa)</td><td align="right" style="font-weight:bold">${euro(o.totali.totaleCent)}</td></tr></table>`;
}

export const linkStato = (o: Ordine) => `${urlSito()}/ordine/?n=${encodeURIComponent(o.numero)}&t=${encodeURIComponent(o.token)}`;

export function emailConfermaCliente(o: Ordine) {
  const pagato = o.pagato
    ? 'Abbiamo ricevuto il tuo ordine e il pagamento. Ti scriveremo appena verrà spedito.'
    : 'Abbiamo ricevuto il tuo ordine: è in attesa della conferma del pagamento.';
  return {
    oggetto: `Ordine ${o.numero} ricevuto – ${sito.nome_breve}`,
    html: pagina(
      `Grazie per il tuo ordine, ${o.cliente.nome.split(' ')[0]}!`,
      `<p>${pagato}</p><p style="margin:0 0 8px"><strong>Numero ordine:</strong> ${escape(o.numero)}</p>${riepilogo(o)}
<p style="margin-top:20px"><strong>Spedizione a:</strong><br>${indirizzo(o.spedizione)}</p>
${pulsante('Segui il tuo ordine', linkStato(o))}
<p style="font-size:13px;color:#6b7b87">Per qualsiasi domanda rispondi a questa email${sito.whatsapp ? ` o scrivici su WhatsApp al ${escape(sito.whatsapp)}` : ''}.</p>`,
    ),
  };
}

export function emailNuovoOrdineNegozio(o: Ordine) {
  const f = o.fatturazione;
  const datiFattura = [
    f.partitaIva && `P.IVA: ${escape(f.partitaIva)}`,
    f.codiceFiscale && `Codice fiscale: ${escape(f.codiceFiscale)}`,
    f.codiceSdiPec && `SDI/PEC: ${escape(f.codiceSdiPec)}`,
  ]
    .filter(Boolean)
    .join('<br>');
  return {
    oggetto: `🛒 Nuovo ordine ${o.numero} – ${euro(o.totali.totaleCent)}${o.pagato ? '' : ' (pagamento in attesa)'}`,
    html: pagina(
      `Nuovo ordine ${o.numero}`,
      `<p><strong>${escape(o.cliente.nome)}</strong><br>${escape(o.cliente.email)}${o.cliente.telefono ? `<br>${escape(o.cliente.telefono)}` : ''}</p>
${riepilogo(o)}
<p style="margin-top:20px"><strong>Spedire a:</strong><br>${indirizzo(o.spedizione)}</p>
<p><strong>Fatturazione:</strong><br>${indirizzo(f)}${datiFattura ? `<br>${datiFattura}` : ''}</p>
${pulsante('Apri il pannello ordini', `${urlSito()}/gestione-ordini/#${encodeURIComponent(o.numero)}`)}`,
    ),
  };
}

export function emailAggiornamentoStato(o: Ordine, nota?: string) {
  const testi: Partial<Record<Ordine['stato'], string>> = {
    in_lavorazione: 'Stiamo preparando il tuo ordine.',
    spedito: 'Il tuo ordine è stato affidato al corriere.',
    consegnato: 'Il tuo ordine risulta consegnato. Grazie per aver scelto FGItalia!',
    annullato: 'Il tuo ordine è stato annullato. Se hai già pagato riceverai il rimborso sullo stesso metodo di pagamento.',
  };
  const c = o.consegna;
  const tracking =
    o.stato === 'spedito' && (c?.corriere || c?.tracking)
      ? `<p>${c?.corriere ? `<strong>Corriere:</strong> ${escape(c.corriere)}<br>` : ''}${c?.tracking ? `<strong>Codice di tracciamento:</strong> ${escape(c.tracking)}` : ''}</p>${c?.link && /^https?:\/\//i.test(c.link) ? pulsante('Traccia la spedizione', c.link) : ''}`
      : '';
  return {
    oggetto: `Ordine ${o.numero}: ${STATI[o.stato].toLowerCase()}`,
    html: pagina(
      `Ordine ${o.numero}: ${STATI[o.stato]}`,
      `<p>${testi[o.stato] ?? `Lo stato del tuo ordine è ora: ${STATI[o.stato]}.`}</p>${nota ? `<p style="padding:12px 16px;background:#f4f7fe;border-radius:10px">${escape(nota)}</p>` : ''}${tracking}${pulsante('Vedi il tuo ordine', linkStato(o))}`,
    ),
  };
}

export function emailNuovoCorso(corso: {
  titolo: string;
  data: string;
  orario?: string;
  luogo?: string;
  docente?: string;
  prezzo?: number;
  riassunto: string;
  immagine?: string;
}) {
  const data = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(`${corso.data}T12:00:00`),
  );
  const dettagli = [
    `<strong>Quando:</strong> ${escape(data)}${corso.orario ? `, ${escape(corso.orario)}` : ''}`,
    corso.luogo && `<strong>Dove:</strong> ${escape(corso.luogo)}`,
    corso.docente && `<strong>Docente:</strong> ${escape(corso.docente)}`,
    corso.prezzo && `<strong>Quota:</strong> ${euro(Math.round(corso.prezzo * 100))}`,
  ]
    .filter(Boolean)
    .join('<br>');
  return {
    oggetto: `Nuovo corso: ${corso.titolo}`,
    html: pagina(
      corso.titolo,
      `${corso.immagine ? `<img src="${urlSito()}${escape(corso.immagine)}" alt="" width="544" style="display:block;width:100%;border-radius:12px;margin-bottom:16px">` : ''}
<p>${escape(corso.riassunto)}</p><p>${dettagli}</p>${pulsante('Scopri il corso e iscriviti', `${urlSito()}/corsi/#iscrizione`)}
<p style="font-size:12px;color:#6b7b87">Ricevi questa email perché ti sei iscritto agli avvisi di ${escape(sito.nome_breve)}. <a href="{{ unsubscribe }}" style="color:#6b7b87">Non voglio più ricevere avvisi</a>.</p>`,
    ),
  };
}
