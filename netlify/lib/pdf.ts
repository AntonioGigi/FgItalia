import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import { euro } from '../../src/lib/negozio';
import { sito } from '../../src/lib/sito';
import { urlSito } from './ambiente';

/**
 * Documenti PDF dell'area clienti (preventivi e riepiloghi d'ordine), creati al momento
 * con pdf-lib. I caratteri standard dei PDF coprono l'italiano e il simbolo dell'euro.
 */
export interface RigaDocumento {
  descrizione: string;
  codice?: string;
  quantita: number;
  unitarioCent: number;
  totaleCent: number;
}

export interface DatiDocumento {
  titolo: string;
  numero: string;
  data: string;
  /** righe in cima a destra sotto numero e data, es. "Valido fino al …" */
  dettagli?: string[];
  intestatario: string[];
  colonnaPrezzo: string;
  righe: RigaDocumento[];
  totali: { etichetta: string; cent: number; forte?: boolean }[];
  note?: string[];
}

const BLU = rgb(8 / 255, 22 / 255, 63 / 255);
const GRIGIO = rgb(0.42, 0.48, 0.53);
const LINEA = rgb(0.886, 0.91, 0.925);
const GIALLO = rgb(248 / 255, 200 / 255, 0);
const MARGINE = 50;
const LARGHEZZA = 595.28;
const ALTEZZA = 841.89;

// Caratteri disponibili nei font standard (WinAnsi): Latin-1 più i simboli tipografici più comuni
const EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
export const pulito = (testo: unknown) =>
  [...String(testo ?? '')]
    .map((c) => {
      const codice = c.codePointAt(0)!;
      if (c === '\n' || c === '\t') return ' ';
      if ((codice >= 0x20 && codice < 0x7f) || (codice >= 0xa0 && codice <= 0xff) || EXTRA.has(c)) return c;
      return '?';
    })
    .join('');

function aCapo(testo: string, font: PDFFont, dimensione: number, larghezza: number): string[] {
  const righe: string[] = [];
  let riga = '';
  for (const parola of pulito(testo).split(' ')) {
    const prova = riga ? `${riga} ${parola}` : parola;
    if (font.widthOfTextAtSize(prova, dimensione) <= larghezza || !riga) riga = prova;
    else {
      righe.push(riga);
      riga = parola;
    }
  }
  if (riga) righe.push(riga);
  return righe.length ? righe : [''];
}

async function caricaLogo(pdf: PDFDocument): Promise<PDFImage | undefined> {
  if (!sito.logo) return undefined;
  try {
    const risposta = await fetch(`${urlSito()}${sito.logo}`);
    if (!risposta.ok) return undefined;
    const byte = new Uint8Array(await risposta.arrayBuffer());
    return /\.png$/i.test(sito.logo) ? await pdf.embedPng(byte) : await pdf.embedJpg(byte);
  } catch {
    return undefined; // senza logo il documento resta valido
  }
}

export async function creaPdf(d: DatiDocumento): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${d.titolo} ${d.numero}`);
  pdf.setAuthor(sito.ragione_sociale);
  pdf.setCreator(sito.nome_breve);
  const normale = await pdf.embedFont(StandardFonts.Helvetica);
  const grassetto = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await caricaLogo(pdf);

  let pagina!: PDFPage;
  let y = 0;
  const scrivi = (testo: string, x: number, yy: number, opzioni: { font?: PDFFont; dimensione?: number; colore?: typeof BLU; destra?: boolean } = {}) => {
    const font = opzioni.font ?? normale;
    const dimensione = opzioni.dimensione ?? 9.5;
    const t = pulito(testo);
    const larghezza = font.widthOfTextAtSize(t, dimensione);
    pagina.drawText(t, { x: opzioni.destra ? x - larghezza : x, y: yy, size: dimensione, font, color: opzioni.colore ?? BLU });
  };

  const colonne = { quantita: 370, prezzo: 455, totale: LARGHEZZA - MARGINE };
  const intestazioneTabella = () => {
    pagina.drawRectangle({ x: MARGINE, y: y - 6, width: LARGHEZZA - 2 * MARGINE, height: 20, color: rgb(0.957, 0.969, 0.996) });
    scrivi('Descrizione', MARGINE + 6, y, { font: grassetto, dimensione: 8.5 });
    scrivi('Q.tà', colonne.quantita, y, { font: grassetto, dimensione: 8.5, destra: true });
    scrivi(d.colonnaPrezzo, colonne.prezzo, y, { font: grassetto, dimensione: 8.5, destra: true });
    scrivi('Totale', colonne.totale - 6, y, { font: grassetto, dimensione: 8.5, destra: true });
    y -= 22;
  };

  const nuovaPagina = (prima: boolean) => {
    pagina = pdf.addPage([LARGHEZZA, ALTEZZA]);
    pagina.drawRectangle({ x: 0, y: ALTEZZA - 6, width: LARGHEZZA, height: 6, color: GIALLO });
    y = ALTEZZA - MARGINE;
    if (logo) {
      const scala = Math.min(150 / logo.width, 46 / logo.height);
      pagina.drawImage(logo, { x: MARGINE, y: y - logo.height * scala + 8, width: logo.width * scala, height: logo.height * scala });
    } else scrivi(sito.ragione_sociale, MARGINE, y - 10, { font: grassetto, dimensione: 14 });

    const azienda = [
      sito.ragione_sociale,
      `${sito.indirizzo} – ${sito.cap} ${sito.citta} (${sito.provincia})`,
      `P.IVA ${sito.piva}`,
      [sito.telefono && `Tel. ${sito.telefono}`, sito.email].filter(Boolean).join(' · '),
      urlSito().replace(/^https?:\/\//, ''),
    ];
    azienda.forEach((r, i) =>
      scrivi(r, LARGHEZZA - MARGINE, y - i * 11, { font: i ? normale : grassetto, dimensione: i ? 8 : 9, colore: i ? GRIGIO : BLU, destra: true }),
    );
    y -= 80;
    if (!prima) {
      scrivi(`${d.titolo} ${d.numero} (segue)`, MARGINE, y, { font: grassetto, dimensione: 10 });
      y -= 24;
      intestazioneTabella();
    }
  };

  nuovaPagina(true);

  // titolo, numero e intestatario
  scrivi(d.titolo, MARGINE, y, { font: grassetto, dimensione: 20 });
  const destra = [`N. ${d.numero}`, `Data: ${d.data}`, ...(d.dettagli ?? [])];
  destra.forEach((r, i) => scrivi(r, LARGHEZZA - MARGINE, y - i * 13 + 4, { font: i ? normale : grassetto, dimensione: i ? 9 : 11, destra: true }));
  y -= Math.max(36, destra.length * 13 + 12);

  const altezzaBox = 22 + d.intestatario.length * 12;
  pagina.drawRectangle({ x: MARGINE, y: y - altezzaBox + 12, width: 280, height: altezzaBox, borderColor: LINEA, borderWidth: 1 });
  scrivi('INTESTATO A', MARGINE + 10, y, { font: grassetto, dimensione: 7.5, colore: GRIGIO });
  d.intestatario.forEach((r, i) => scrivi(r, MARGINE + 10, y - 14 - i * 12, { font: i ? normale : grassetto, dimensione: 9.5 }));
  y -= altezzaBox + 18;

  intestazioneTabella();
  for (const r of d.righe) {
    const descrizione = aCapo(r.descrizione, normale, 9.5, colonne.quantita - MARGINE - 50);
    const altezza = descrizione.length * 12 + (r.codice ? 11 : 0) + 8;
    if (y - altezza < 150) nuovaPagina(false);
    descrizione.forEach((t, i) => scrivi(t, MARGINE + 6, y - i * 12));
    if (r.codice) scrivi(`Cod. ${r.codice}`, MARGINE + 6, y - descrizione.length * 12, { dimensione: 8, colore: GRIGIO });
    scrivi(String(r.quantita), colonne.quantita, y, { destra: true });
    scrivi(euro(r.unitarioCent), colonne.prezzo, y, { destra: true });
    scrivi(euro(r.totaleCent), colonne.totale - 6, y, { destra: true });
    y -= altezza;
    pagina.drawLine({ start: { x: MARGINE, y: y + 8 }, end: { x: LARGHEZZA - MARGINE, y: y + 8 }, thickness: 0.6, color: LINEA });
  }

  if (y - d.totali.length * 16 - 40 < 110) nuovaPagina(false);
  y -= 8;
  for (const t of d.totali) {
    const font = t.forte ? grassetto : normale;
    const dimensione = t.forte ? 12 : 9.5;
    scrivi(t.etichetta, colonne.prezzo, y, { font, dimensione, destra: true });
    scrivi(euro(t.cent), colonne.totale - 6, y, { font, dimensione, destra: true });
    y -= t.forte ? 20 : 15;
  }

  if (d.note?.length) {
    y -= 14;
    for (const nota of d.note) {
      for (const riga of aCapo(nota, normale, 8.5, LARGHEZZA - 2 * MARGINE)) {
        if (y < 70) nuovaPagina(false);
        scrivi(riga, MARGINE, y, { dimensione: 8.5, colore: GRIGIO });
        y -= 11;
      }
      y -= 4;
    }
  }

  const pagine = pdf.getPages();
  pagine.forEach((p, i) => {
    pagina = p;
    scrivi(`${sito.ragione_sociale} · P.IVA ${sito.piva}`, MARGINE, 30, { dimensione: 7.5, colore: GRIGIO });
    scrivi(`Pagina ${i + 1} di ${pagine.length}`, LARGHEZZA - MARGINE, 30, { dimensione: 7.5, colore: GRIGIO, destra: true });
  });

  return pdf.save();
}

export const rispostaPdf = (byte: Uint8Array, nomeFile: string, scarica = false) =>
  new Response(byte as Uint8Array<ArrayBuffer>, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${scarica ? 'attachment' : 'inline'}; filename="${nomeFile.replace(/[^\w.-]/g, '_')}"`,
      'Cache-Control': 'private, no-store',
    },
  });
