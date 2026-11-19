import type { Config } from '@netlify/functions';
import { errore } from '../lib/ambiente';
import { clienteDaRichiesta, numeriOrdini, numeroPraticaValido } from '../lib/clienti';
import { pdfPreventivo, pdfRiepilogo } from '../lib/documenti';
import { archivioFatture, leggiOrdine } from '../lib/ordini';
import { rispostaPdf } from '../lib/pdf';
import { archivioPreventivi, type Preventivo } from '../lib/pratiche';

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
    return rispostaPdf(await pdfPreventivo(p, new URL(req.url).origin), `Preventivo-${numero}.pdf`, scarica);
  }

  if (tipo === 'fattura' || tipo === 'riepilogo') {
    const ordine = (await numeriOrdini(cliente.id)).includes(numero) ? await leggiOrdine(numero) : null;
    if (!ordine) return errore('Ordine non trovato', 404);
    if (tipo === 'riepilogo') return rispostaPdf(await pdfRiepilogo(ordine, new URL(req.url).origin), `Ordine-${numero}.pdf`, scarica);
    const file = ordine.fattura ? ((await archivioFatture().get(numero, { type: 'arrayBuffer' })) as ArrayBuffer | null) : null;
    if (!file || !ordine.fattura) return errore('La fattura di questo ordine non è ancora disponibile', 404);
    return rispostaPdf(new Uint8Array(file), ordine.fattura.nome, scarica);
  }

  return errore('Documento sconosciuto', 400);
};

export const config: Config = { path: '/api/account/documento' };
