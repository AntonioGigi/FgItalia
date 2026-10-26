import { euro } from '../../src/lib/negozio';
import { sito } from '../../src/lib/sito';
import { variabile, variabileFacoltativa, urlSito } from './ambiente';
import { STATI, type Ordine } from './ordini';
import { prossimaManutenzione, type Cliente, type Dispositivo } from './clienti';
import { STATI_ASSISTENZA, TIPI_ASSISTENZA, type Preventivo, type RichiestaAssistenza } from './pratiche';

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

export interface Allegato {
  nome: string;
  /** contenuto del file in base64 */
  contenuto: string;
}

export async function inviaEmail(
  destinatario: { email: string; nome?: string },
  { oggetto, html }: Messaggio,
  allegati: Allegato[] = [],
  rispondiA?: { email: string; nome?: string },
) {
  await chiamaBrevo('/smtp/email', {
    sender: mittente(),
    to: [{ email: destinatario.email, ...(destinatario.nome && { name: destinatario.nome }) }],
    replyTo: rispondiA
      ? { email: rispondiA.email, ...(rispondiA.nome && { name: rispondiA.nome }) }
      : { email: sito.email || variabile('EMAIL_MITTENTE'), name: sito.nome_breve },
    subject: oggetto,
    htmlContent: html,
    ...(allegati.length && { attachment: allegati.map((a) => ({ name: a.nome, content: a.contenuto })) }),
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

// ——— Area clienti ———

const dataBreve = (iso: string) =>
  new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso.length === 10 ? `${iso}T12:00:00` : iso));
const nomeProprio = (nome: string) => escape(nome.trim().split(' ')[0] || nome);
const linkAccount = (sezione = '') => `${urlSito()}/account/${sezione ? `#${sezione}` : ''}`;

export function emailBenvenuto(c: Cliente) {
  return {
    oggetto: `Benvenuto nell’area clienti ${sito.nome_breve}`,
    html: pagina(
      `Benvenuto, ${nomeProprio(c.nome)}!`,
      `<p>Il tuo account è attivo. Nell’area clienti trovi:</p>
<ul style="padding-left:18px;line-height:1.7">
<li>lo storico degli ordini, con lo stato della spedizione e le fatture in PDF;</li>
<li>i manuali, le schede tecniche e i certificati CE dei dispositivi che hai acquistato;</li>
<li>il riordino rapido dei materiali di consumo;</li>
<li>i preventivi in PDF da scaricare dal carrello;</li>
<li>i promemoria per la manutenzione delle apparecchiature e l’assistenza tecnica prioritaria.</li>
</ul>
<p>Salva una volta i tuoi dati di fatturazione (partita IVA, codice SDI o PEC): li useremo per ogni ordine.</p>
${pulsante('Vai al tuo account', linkAccount('dati'))}`,
    ),
  };
}

export function emailReimpostaPassword(c: Cliente, link: string) {
  return {
    oggetto: `Nuova password per il tuo account ${sito.nome_breve}`,
    html: pagina(
      'Imposta una nuova password',
      `<p>Ciao ${nomeProprio(c.nome)}, abbiamo ricevuto una richiesta per cambiare la password del tuo account.</p>
${pulsante('Scegli la nuova password', link)}
<p style="font-size:13px;color:#6b7b87">Il link vale un’ora e si può usare una sola volta. Se non hai chiesto tu il cambio, ignora questa email: la password resta quella di prima.</p>`,
    ),
  };
}

export function emailFatturaDisponibile(o: Ordine) {
  return {
    oggetto: `Fattura dell’ordine ${o.numero} – ${sito.nome_breve}`,
    html: pagina(
      `Fattura dell’ordine ${o.numero}`,
      `<p>Ciao ${nomeProprio(o.cliente.nome)}, in allegato trovi la copia in PDF della fattura del tuo ordine. La fattura elettronica ti arriva anche tramite il Sistema di Interscambio (SDI o PEC).</p>
<p>Puoi scaricarla quando vuoi dalla tua area clienti, accedendo con questa email.</p>
${pulsante('Vai ai tuoi ordini', linkAccount('ordini'))}`,
    ),
  };
}

const schedaRichiesta = (r: RichiestaAssistenza) =>
  `<p style="padding:12px 16px;background:#f4f7fe;border-radius:10px;line-height:1.6"><strong>Pratica:</strong> ${escape(r.numero)}<br>
<strong>Tipo:</strong> ${escape(TIPI_ASSISTENZA[r.tipo])}${r.fermo ? ' · <strong style="color:#b42318">studio fermo</strong>' : ''}<br>
${r.dispositivo ? `<strong>Dispositivo:</strong> ${escape(r.dispositivo.titolo)}${r.dispositivo.matricola ? ` (matricola ${escape(r.dispositivo.matricola)})` : ''}<br>` : ''}
<strong>Descrizione:</strong> ${escape(r.descrizione).replace(/\n/g, '<br>')}</p>`;

export function emailNuovaRichiestaNegozio(r: RichiestaAssistenza) {
  return {
    oggetto: `${r.fermo ? '🔴 PRIORITARIA – ' : '🛠️ '}Assistenza ${r.numero}: ${r.dispositivo?.titolo ?? TIPI_ASSISTENZA[r.tipo]}`,
    html: pagina(
      `Nuova richiesta di assistenza ${r.numero}`,
      `<p><strong>${escape(r.cliente.nome)}</strong> · ${escape(r.cliente.professione)}<br>${escape(r.cliente.email)}${r.cliente.telefono ? `<br>${escape(r.cliente.telefono)}` : ''}</p>
${schedaRichiesta(r)}${pulsante('Apri le richieste di assistenza', `${urlSito()}/gestione-ordini/#assistenza`)}`,
    ),
  };
}

export function emailConfermaRichiesta(r: RichiestaAssistenza) {
  return {
    oggetto: `Richiesta di assistenza ${r.numero} ricevuta`,
    html: pagina(
      'Abbiamo ricevuto la tua richiesta',
      `<p>Ciao ${nomeProprio(r.cliente.nome)}, la tua richiesta è arrivata al nostro servizio tecnico${r.fermo ? ' con <strong>priorità alta</strong>, perché ci hai segnalato che lo studio è fermo' : ''}. Ti risponderemo il prima possibile.</p>
${schedaRichiesta(r)}${pulsante('Segui la richiesta', linkAccount('assistenza'))}`,
    ),
  };
}

export function emailAggiornamentoRichiesta(r: RichiestaAssistenza, nota?: string) {
  return {
    oggetto: `Assistenza ${r.numero}: ${STATI_ASSISTENZA[r.stato].toLowerCase()}`,
    html: pagina(
      `Assistenza ${r.numero}: ${STATI_ASSISTENZA[r.stato]}`,
      `${nota ? `<p style="padding:12px 16px;background:#f4f7fe;border-radius:10px">${escape(nota).replace(/\n/g, '<br>')}</p>` : `<p>Lo stato della tua richiesta è ora: ${escape(STATI_ASSISTENZA[r.stato])}.</p>`}
${pulsante('Vedi la richiesta', linkAccount('assistenza'))}`,
    ),
  };
}

export function emailNuovoPreventivoNegozio(p: Preventivo) {
  const f = p.cliente.fatturazione;
  return {
    oggetto: `📄 Preventivo ${p.numero} scaricato da ${p.cliente.nome} – ${euro(p.totaleCent)}`,
    html: pagina(
      `Preventivo ${p.numero}`,
      `<p>Un cliente ha scaricato un preventivo dal sito: può essere il momento giusto per un contatto.</p>
<p><strong>${escape(f.ragioneSociale || p.cliente.nome)}</strong><br>${escape(p.cliente.email)}${p.cliente.telefono ? `<br>${escape(p.cliente.telefono)}` : ''}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">
${p.righe.map((r) => `<tr><td style="padding:6px 0;border-bottom:1px solid #e2e8ec">${r.quantita} × ${escape(r.titolo)}</td><td align="right" style="border-bottom:1px solid #e2e8ec">${euro(r.totaleNettoCent)} + IVA</td></tr>`).join('')}
<tr><td style="padding:8px 0;font-weight:bold">Totale IVA inclusa</td><td align="right" style="font-weight:bold">${euro(p.totaleCent)}</td></tr></table>
${p.note ? `<p><strong>Note del cliente:</strong> ${escape(p.note)}</p>` : ''}`,
    ),
  };
}

export function emailPromemoriaManutenzione(c: Cliente, dispositivi: Dispositivo[], oggi: string) {
  const elenco = dispositivi
    .map((d) => {
      const scadenza = prossimaManutenzione(d);
      const scaduta = scadenza < oggi;
      return `<li style="margin-bottom:6px"><strong>${escape(d.titolo)}</strong>${d.matricola ? ` (matricola ${escape(d.matricola)})` : ''}: ${scaduta ? '<strong style="color:#b42318">scaduta il' : 'in scadenza il'} ${dataBreve(scadenza)}${scaduta ? '</strong>' : ''}</li>`;
    })
    .join('');
  return {
    oggetto: `Promemoria manutenzione: ${dispositivi.length === 1 ? dispositivi[0].titolo : `${dispositivi.length} apparecchiature`}`,
    html: pagina(
      'È ora della manutenzione',
      `<p>Ciao ${nomeProprio(c.nome)}, ti ricordiamo le prossime scadenze di manutenzione e verifica delle tue apparecchiature:</p>
<ul style="padding-left:18px;line-height:1.6">${elenco}</ul>
<p>Le verifiche periodiche mantengono i dispositivi sicuri ed efficaci e sono richieste in caso di ispezione. Prenota l’intervento con un clic: ti richiamiamo noi.</p>
${pulsante('Prenota la manutenzione', linkAccount('dispositivi'))}
<p style="font-size:12px;color:#6b7b87">Ricevi questo promemoria perché l’hai attivato nella tua area clienti. Puoi disattivarlo in qualsiasi momento da “I miei dati”.</p>`,
    ),
  };
}
