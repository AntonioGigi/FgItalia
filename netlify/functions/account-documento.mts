import type { Config } from '@netlify/functions';
import { sito } from '../../src/lib/sito';
import { errore } from '../lib/ambiente';
import { clienteDaRichiesta, numeriOrdini, numeroPraticaValido, type DatiFatturazione } from '../lib/clienti';
import { archivioFatture, leggiOrdine, STATI, type Ordine } from '../lib/ordini';
import { creaPdf, rispostaPdf } from '../lib/pdf';
import { archivioPreventivi, type Preventivo } from '../lib/pratiche';

const data = (iso: string) => new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso));

const intestatario = (nome: string, email: string, f: DatiFatturazione & { nome?: string; codiceSdiPec?: string }) =>
  [
    f.ragioneSociale || nome,
    f.ragioneSociale && f.ragioneSociale !== nome ? `Alla c.a. di ${nome}` : undefined,
    f.via,
    [f.cap, f.citta, f.provincia && `(${f.provincia})`].filter(Boolean).join(' ') || undefined,
    f.partitaIva && `P.IVA ${f.partitaIva}`,
    f.codiceFiscale && `C.F. ${f.codiceFiscale}`,
    f.codiceSdi ? `Codice SDI ${f.codiceSdi}` : f.pec ? `PEC ${f.pec}` : f.codiceSdiPec && `SDI/PEC ${f.codiceSdiPec}`,
    email,
  ].filter((r): r is string => !!r);

function pdfPreventivo(p: Preventivo) {
  return creaPdf({
    titolo: 'Preventivo',
    numero: p.numero,
    data: data(p.creato),
    dettagli: [`Valido fino al ${data(`${p.validoFino}T12:00:00`)}`],
    intestatario: intestatario(p.cliente.nome, p.cliente.email, p.cliente.fatturazione),
    colonnaPrezzo: 'Prezzo unit. netto',
    righe: [
      ...p.righe.map((r) => ({ descrizione: r.titolo, codice: r.codice, quantita: r.quantita, unitarioCent: r.nettoCent, totaleCent: r.totaleNettoCent })),
      ...(p.spedizioneNettoCent
        ? [{ descrizione: 'Spedizione con corriere', quantita: 1, unitarioCent: p.spedizioneNettoCent, totaleCent: p.spedizioneNettoCent }]
        : []),
    ],
    totali: [
      { etichetta: 'Imponibile', cent: p.imponibileCent },
      { etichetta: 'IVA 22%', cent: p.ivaCent },
      { etichetta: 'Totale', cent: p.totaleCent, forte: true },
    ],
    note: [
      ...(p.spedizioneNettoCent ? [] : ['Spedizione gratuita in tutta Italia.']),
      ...(p.note ? [`Note: ${p.note}`] : []),
      `Prezzi in euro. Offerta valida fino al ${data(`${p.validoFino}T12:00:00`)} salvo esaurimento scorte. Per confermare l’ordine puoi acquistare dal sito, rispondere a ${sito.email}${sito.telefono ? ` o chiamare il ${sito.telefono}` : ''} indicando il numero del preventivo.`,
      'Il preventivo può essere presentato per richieste di finanziamento o leasing. I prodotti sono destinati a operatori del settore sanitario.',
    ],
  });
}

function pdfRiepilogo(o: Ordine) {
  const f = o.fatturazione;
  return creaPdf({
    titolo: 'Riepilogo ordine',
    numero: o.numero,
    data: data(o.creato),
    dettagli: [`Stato: ${STATI[o.stato]}`, o.pagato ? 'Pagato online' : 'In attesa di pagamento'],
    intestatario: intestatario(f.nome || o.cliente.nome, o.cliente.email, f),
    colonnaPrezzo: 'Prezzo unit. IVA incl.',
    righe: [
      ...o.righe.map((r) => ({ descrizione: r.titolo, quantita: r.quantita, unitarioCent: r.unitarioCent, totaleCent: r.totaleCent })),
      ...(o.totali.spedizioneCent
        ? [{ descrizione: 'Spedizione con corriere', quantita: 1, unitarioCent: o.totali.spedizioneCent, totaleCent: o.totali.spedizioneCent }]
        : []),
    ],
    totali: [{ etichetta: 'Totale IVA inclusa', cent: o.totali.totaleCent, forte: true }],
    note: ['Documento di riepilogo, non valido ai fini fiscali. La fattura elettronica viene emessa tramite il Sistema di Interscambio.'],
  });
}

/**
 * Download dei documenti dell'area clienti: fattura caricata da FGItalia,
 * riepilogo dell'ordine e preventivi. Solo per il cliente che ne è titolare.
 */
export default async (req: Request) => {
  const cliente = await clienteDaRichiesta(req);
  if (!cliente) return Response.redirect(new URL('/account/', req.url), 302);
  const parametri = new URL(req.url).searchParams;
  const tipo = parametri.get('tipo');
  const numero = (parametri.get('n') ?? '').toUpperCase();
  const scarica = parametri.has('scarica');

  if (tipo === 'preventivo') {
    if (!numeroPraticaValido('PV', numero) || !cliente.preventivi.includes(numero)) return errore('Preventivo non trovato', 404);
    const p = (await archivioPreventivi().get(numero, { type: 'json' })) as Preventivo | null;
    if (!p) return errore('Preventivo non trovato', 404);
    return rispostaPdf(await pdfPreventivo(p), `Preventivo-${numero}.pdf`, scarica);
  }

  if (tipo === 'fattura' || tipo === 'riepilogo') {
    const ordine = (await numeriOrdini(cliente.id)).includes(numero) ? await leggiOrdine(numero) : null;
    if (!ordine) return errore('Ordine non trovato', 404);
    if (tipo === 'riepilogo') return rispostaPdf(await pdfRiepilogo(ordine), `Ordine-${numero}.pdf`, scarica);
    const file = ordine.fattura ? ((await archivioFatture().get(numero, { type: 'arrayBuffer' })) as ArrayBuffer | null) : null;
    if (!file || !ordine.fattura) return errore('La fattura di questo ordine non è ancora disponibile', 404);
    return rispostaPdf(new Uint8Array(file), ordine.fattura.nome, scarica);
  }

  return errore('Documento sconosciuto', 400);
};

export const config: Config = { path: '/api/account/documento' };
