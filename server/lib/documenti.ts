import { sito } from '../../src/lib/sito';
import type { DatiFatturazione } from './clienti';
import { STATI, type Ordine } from './ordini';
import { creaPdf } from './pdf';
import type { Preventivo } from './pratiche';

/** PDF dei preventivi e dei riepiloghi d'ordine, per l'area clienti e per il pannello */

export const dataBreve = (iso: string) =>
  new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Rome' }).format(new Date(iso));

const intestatario = (nome: string, email: string, f: DatiFatturazione & { nome?: string; codiceSdiPec?: string }, telefono?: string) =>
  [
    f.ragioneSociale || nome,
    f.ragioneSociale && f.ragioneSociale !== nome ? `Alla c.a. di ${nome}` : undefined,
    f.via,
    [f.cap, f.citta, f.provincia && `(${f.provincia})`].filter(Boolean).join(' ') || undefined,
    f.partitaIva && `P.IVA ${f.partitaIva}`,
    f.codiceFiscale && `C.F. ${f.codiceFiscale}`,
    f.codiceSdi ? `Codice SDI ${f.codiceSdi}` : f.pec ? `PEC ${f.pec}` : f.codiceSdiPec && `SDI/PEC ${f.codiceSdiPec}`,
    [email, telefono].filter(Boolean).join(' · ') || undefined,
  ].filter((r): r is string => !!r);

export function pdfPreventivo(p: Preventivo, origine?: string) {
  const scadenza = dataBreve(`${p.validoFino}T12:00:00`);
  const daFgitalia = p.autore === 'fgitalia';
  return creaPdf(
    {
      titolo: 'Preventivo',
      numero: p.numero,
      data: dataBreve(p.creato),
      dettagli: [{ etichetta: 'Valido fino al', valore: scadenza }],
      intestatario: intestatario(p.cliente.nome, p.cliente.email, p.cliente.fatturazione, p.cliente.telefono),
      colonnaPrezzo: 'Prezzo unit.',
      righe: [
        ...p.righe.map((r) => ({
          descrizione: r.titolo,
          codice: r.codice,
          quantita: r.quantita,
          unitarioCent: r.nettoCent,
          totaleCent: r.totaleNettoCent,
          ...(r.sconto && r.listinoCent && { sconto: r.sconto, listinoTotaleCent: r.listinoCent * r.quantita }),
        })),
        ...(p.spedizioneNettoCent
          ? [{ descrizione: 'Spedizione con corriere', quantita: 1, unitarioCent: p.spedizioneNettoCent, totaleCent: p.spedizioneNettoCent }]
          : []),
      ],
      iva: { aliquota: '22%', imponibileCent: p.imponibileCent, impostaCent: p.ivaCent },
      totali: [
        { etichetta: 'Imponibile', cent: p.imponibileCent },
        { etichetta: 'IVA 22%', cent: p.ivaCent },
        { etichetta: 'Totale IVA inclusa', cent: p.totaleCent, forte: true },
      ],
      note: [
        ...(p.note ? [daFgitalia ? p.note : `Note del cliente: ${p.note}`] : []),
        ...(p.spedizioneNettoCent ? [] : [daFgitalia ? 'Spedizione inclusa.' : 'Spedizione gratuita in tutta Italia.']),
        `Prezzi in euro, IVA esclusa salvo dove indicato. Offerta valida fino al ${scadenza} salvo esaurimento scorte. Per confermare l’ordine ${daFgitalia ? '' : 'puoi acquistare dal sito, '}rispondi a ${sito.email}${sito.telefono ? ` o chiama il ${sito.telefono}` : ''} indicando il numero del preventivo.`,
        'Il preventivo può essere presentato per richieste di finanziamento o leasing. I prodotti sono destinati a operatori del settore sanitario.',
      ],
    },
    origine,
  );
}

export function pdfRiepilogo(o: Ordine, origine?: string) {
  const f = o.fatturazione;
  return creaPdf(
    {
      titolo: 'Riepilogo ordine',
      numero: o.numero,
      data: dataBreve(o.creato),
      dettagli: [
        { etichetta: 'Stato', valore: STATI[o.stato] },
        { etichetta: 'Pagamento', valore: o.pagato ? 'Pagato online' : 'In attesa di pagamento' },
      ],
      intestatario: intestatario(f.nome || o.cliente.nome, o.cliente.email, f),
      colonnaPrezzo: 'Prezzo IVA incl.',
      righe: [
        ...o.righe.map((r) => ({ descrizione: r.titolo, quantita: r.quantita, unitarioCent: r.unitarioCent, totaleCent: r.totaleCent })),
        ...(o.totali.spedizioneCent
          ? [{ descrizione: 'Spedizione con corriere', quantita: 1, unitarioCent: o.totali.spedizioneCent, totaleCent: o.totali.spedizioneCent }]
          : []),
      ],
      totali: [{ etichetta: 'Totale IVA inclusa', cent: o.totali.totaleCent, forte: true }],
      note: ['Documento di riepilogo, non valido ai fini fiscali. La fattura elettronica viene emessa tramite il Sistema di Interscambio.'],
    },
    origine,
  );
}
