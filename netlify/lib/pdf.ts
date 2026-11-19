import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import { euro } from '../../src/lib/negozio';
import { sito } from '../../src/lib/sito';
import { urlSito } from './ambiente';
import { LOGO_PNG_BASE64, PERCORSO_LOGO_INCLUSO } from './logo';

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
  /** importo prima dello sconto, mostrato barrato */
  listinoTotaleCent?: number;
  /** sconto in percentuale */
  sconto?: number;
}

export interface DatiDocumento {
  titolo: string;
  numero: string;
  data: string;
  /** coppie etichetta/valore nel riquadro a destra del destinatario, es. "Valido fino al" */
  dettagli?: { etichetta: string; valore: string }[];
  intestatario: string[];
  colonnaPrezzo: string;
  righe: RigaDocumento[];
  /** riepilogo IVA in basso a sinistra, come nei preventivi */
  iva?: { aliquota: string; imponibileCent: number; impostaCent: number };
  totali: { etichetta: string; cent: number; forte?: boolean }[];
  note?: string[];
}

type Colore = ReturnType<typeof rgb>;
const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
// colori del logo: blu notte e oro
const BLU = hex('#1b3557');
const BLU_SCURO = hex('#0f2138');
const ORO = hex('#e0a030');
const ORO_CHIARO = hex('#fbeed3');
const TESTO = hex('#1f2a37');
const GRIGIO = hex('#6b7b87');
const LINEA = hex('#e2e8ec');
const FONDO = hex('#f4f7fa');
const BIANCO = rgb(1, 1, 1);
const MARGINE = 42;
const LARGHEZZA = 595.28;
const ALTEZZA = 841.89;
const DESTRA = LARGHEZZA - MARGINE;
const PIEDE = 64;

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

/** Il logo si legge dal sito che ha ricevuto la richiesta (anche le anteprime), altrimenti dal dominio principale */
async function caricaLogo(pdf: PDFDocument, origine?: string): Promise<PDFImage | undefined> {
  if (!sito.logo || sito.logo === PERCORSO_LOGO_INCLUSO) return pdf.embedPng(Buffer.from(LOGO_PNG_BASE64, 'base64'));
  for (const base of new Set([origine, urlSito()].filter((b): b is string => !!b))) {
    try {
      const risposta = await fetch(`${base}${sito.logo}`);
      if (!risposta.ok) continue;
      const byte = new Uint8Array(await risposta.arrayBuffer());
      return /\.png$/i.test(sito.logo) ? await pdf.embedPng(byte) : await pdf.embedJpg(byte);
    } catch {
      // provo l'indirizzo successivo; senza logo il documento resta valido
    }
  }
  // logo cambiato dal pannello ma non raggiungibile: meglio quello incluso che nessuno
  return pdf.embedPng(Buffer.from(LOGO_PNG_BASE64, 'base64'));
}

export async function creaPdf(d: DatiDocumento, origine?: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${d.titolo} ${d.numero}`);
  pdf.setAuthor(sito.ragione_sociale);
  pdf.setCreator(sito.nome_breve);
  const normale = await pdf.embedFont(StandardFonts.Helvetica);
  const grassetto = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await caricaLogo(pdf, origine);

  let pagina!: PDFPage;
  let y = 0;
  type Opzioni = { font?: PDFFont; dimensione?: number; colore?: Colore; allinea?: 'sinistra' | 'destra' | 'centro'; spaziatura?: number };
  const larghezzaTesto = (t: string, font: PDFFont, dimensione: number, spaziatura = 0) =>
    font.widthOfTextAtSize(t, dimensione) + spaziatura * Math.max(0, t.length - 1);
  const scrivi = (testo: string, x: number, yy: number, o: Opzioni = {}) => {
    const font = o.font ?? normale;
    const dimensione = o.dimensione ?? 9.5;
    const t = pulito(testo);
    const l = larghezzaTesto(t, font, dimensione, o.spaziatura);
    const xx = o.allinea === 'destra' ? x - l : o.allinea === 'centro' ? x - l / 2 : x;
    if (o.spaziatura) {
      // lettere spaziate per le etichette in maiuscolo
      let cx = xx;
      for (const c of t) {
        pagina.drawText(c, { x: cx, y: yy, size: dimensione, font, color: o.colore ?? TESTO });
        cx += font.widthOfTextAtSize(c, dimensione) + o.spaziatura;
      }
    } else pagina.drawText(t, { x: xx, y: yy, size: dimensione, font, color: o.colore ?? TESTO });
    return l;
  };
  const etichetta = (t: string, x: number, yy: number, o: Opzioni = {}) =>
    scrivi(t.toUpperCase(), x, yy, { font: grassetto, dimensione: 7, colore: GRIGIO, spaziatura: 0.8, ...o });
  /** rettangolo con gli angoli arrotondati; (x, y) è l'angolo in basso a sinistra */
  const riquadro = (x: number, yy: number, w: number, h: number, r: number, colore: Colore, bordo?: Colore) =>
    pagina.drawSvgPath(
      `M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r} V ${h - r} A ${r} ${r} 0 0 1 ${w - r} ${h} H ${r} A ${r} ${r} 0 0 1 0 ${h - r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`,
      { x, y: yy + h, color: colore, ...(bordo && { borderColor: bordo, borderWidth: 0.8 }) },
    );

  // colonne della tabella: lo sconto compare solo se almeno una riga è scontata
  const conSconto = d.righe.some((r) => r.sconto);
  const col = conSconto
    ? { quantita: 318, prezzo: 404, sconto: 448, importo: DESTRA - 10 }
    : { quantita: 360, prezzo: 450, sconto: 0, importo: DESTRA - 10 };
  const larghezzaDescrizione = col.quantita - 30 - (MARGINE + 12);

  const intestazioneTabella = () => {
    riquadro(MARGINE, y - 9, DESTRA - MARGINE, 24, 5, BLU);
    const o: Opzioni = { colore: BIANCO, dimensione: 7, spaziatura: 0.7 };
    etichetta('Descrizione', MARGINE + 12, y, o);
    etichetta('Q.tà', col.quantita, y, { ...o, allinea: 'centro' });
    etichetta(d.colonnaPrezzo, col.prezzo, y, { ...o, allinea: 'destra' });
    if (conSconto) etichetta('Sconto', col.sconto, y, { ...o, allinea: 'centro' });
    etichetta('Importo', col.importo, y, { ...o, allinea: 'destra' });
    y -= 24;
  };

  const nuovaPagina = (prima: boolean, conTabella = true) => {
    pagina = pdf.addPage([LARGHEZZA, ALTEZZA]);
    pagina.drawRectangle({ x: 0, y: ALTEZZA - 5, width: LARGHEZZA, height: 5, color: BLU });
    pagina.drawRectangle({ x: 0, y: ALTEZZA - 7, width: LARGHEZZA, height: 2, color: ORO });
    const alto = ALTEZZA - 30;
    if (prima) {
      if (logo) {
        const scala = Math.min(130 / logo.width, 86 / logo.height);
        pagina.drawImage(logo, { x: MARGINE - 4, y: alto - logo.height * scala, width: logo.width * scala, height: logo.height * scala });
      } else scrivi(sito.ragione_sociale, MARGINE, alto - 30, { font: grassetto, dimensione: 16, colore: BLU });

      const azienda = [
        `${sito.indirizzo} - ${sito.cap} ${sito.citta} (${sito.provincia})`,
        `P.IVA ${sito.piva}`,
        sito.telefono && `Tel. ${sito.telefono}`,
        sito.email,
        urlSito().replace(/^https?:\/\/(www\.)?/, 'www.'),
      ].filter((r): r is string => !!r);
      scrivi(sito.ragione_sociale.toUpperCase(), DESTRA, alto - 22, { font: grassetto, dimensione: 10, colore: BLU, allinea: 'destra' });
      azienda.forEach((r, i) => scrivi(r, DESTRA, alto - 36 - i * 11.5, { dimensione: 8.5, colore: GRIGIO, allinea: 'destra' }));
      y = alto - 122;
    } else {
      if (logo) {
        const scala = Math.min(70 / logo.width, 46 / logo.height);
        pagina.drawImage(logo, { x: MARGINE - 2, y: alto - logo.height * scala, width: logo.width * scala, height: logo.height * scala });
      }
      scrivi(`${d.titolo} n. ${d.numero}`, DESTRA, alto - 20, { font: grassetto, dimensione: 10, colore: BLU, allinea: 'destra' });
      scrivi('segue', DESTRA, alto - 33, { dimensione: 8.5, colore: GRIGIO, allinea: 'destra' });
      y = alto - 70;
      if (conTabella) intestazioneTabella();
    }
  };

  nuovaPagina(true);

  // titolo
  const lTitolo = scrivi(d.titolo.toUpperCase(), MARGINE, y, { font: grassetto, dimensione: 22, colore: BLU, spaziatura: 1.2 });
  pagina.drawRectangle({ x: MARGINE, y: y - 10, width: Math.min(lTitolo, 60), height: 3, color: ORO });
  scrivi(`n. `, MARGINE + lTitolo + 12, y, { dimensione: 12, colore: GRIGIO });
  const lN = normale.widthOfTextAtSize('n. ', 12);
  const lNumero = scrivi(d.numero, MARGINE + lTitolo + 12 + lN, y, { font: grassetto, dimensione: 12, colore: BLU });
  scrivi(`del ${d.data}`, MARGINE + lTitolo + 12 + lN + lNumero + 6, y, { dimensione: 12, colore: GRIGIO });
  y -= 34;

  // destinatario e dettagli, in due riquadri affiancati
  const larghezzaSinistra = 300;
  const righeIntestatario = d.intestatario.flatMap((r, i) => aCapo(r, i ? normale : grassetto, i ? 9 : 11, larghezzaSinistra - 28).map((t) => ({ t, i })));
  const dettagli = [{ etichetta: 'Data', valore: d.data }, ...(d.dettagli ?? [])];
  const altezzaBox = Math.max(32 + righeIntestatario.length * 12.5, 26 + dettagli.length * 26);
  riquadro(MARGINE, y - altezzaBox, larghezzaSinistra, altezzaBox, 8, FONDO);
  pagina.drawRectangle({ x: MARGINE, y: y - altezzaBox + 10, width: 3, height: altezzaBox - 20, color: ORO });
  etichetta('Destinatario', MARGINE + 16, y - 18);
  righeIntestatario.forEach(({ t, i }, n) =>
    scrivi(t, MARGINE + 16, y - 34 - n * 12.5 - (i ? 2 : 0), { font: i ? normale : grassetto, dimensione: i ? 9 : 11, colore: i ? TESTO : BLU }),
  );
  const xDettagli = MARGINE + larghezzaSinistra + 14;
  riquadro(xDettagli, y - altezzaBox, DESTRA - xDettagli, altezzaBox, 8, BIANCO, LINEA);
  dettagli.forEach((v, i) => {
    etichetta(v.etichetta, xDettagli + 16, y - 18 - i * 26);
    scrivi(v.valore, xDettagli + 16, y - 30 - i * 26, { font: grassetto, dimensione: 10, colore: BLU });
  });
  y -= altezzaBox + 22;

  // righe
  intestazioneTabella();
  d.righe.forEach((r, indice) => {
    const descrizione = aCapo(r.descrizione, grassetto, 9.5, larghezzaDescrizione);
    const altezzaTesto = descrizione.length * 12 + (r.codice ? 11 : 0);
    const altezza = Math.max(altezzaTesto, r.listinoTotaleCent ? 21 : 12) + 10;
    if (y - altezza < PIEDE + 20) nuovaPagina(false);
    if (indice % 2 === 0) riquadro(MARGINE, y - altezza + 8, DESTRA - MARGINE, altezza, 4, FONDO);
    const yy = y - 3;
    descrizione.forEach((t, i) => scrivi(t, MARGINE + 12, yy - i * 12, { font: grassetto, dimensione: 9.5, colore: BLU_SCURO }));
    if (r.codice) scrivi(`Cod. ${r.codice}`, MARGINE + 12, yy - descrizione.length * 12, { dimensione: 7.5, colore: GRIGIO });
    scrivi(String(r.quantita), col.quantita, yy, { allinea: 'centro' });
    scrivi(euro(r.unitarioCent), col.prezzo, yy, { allinea: 'destra' });
    if (conSconto && r.sconto) {
      const testo = `-${String(r.sconto).replace('.', ',')}%`;
      const l = grassetto.widthOfTextAtSize(testo, 8);
      riquadro(col.sconto - l / 2 - 6, yy - 4, l + 12, 14, 7, ORO_CHIARO);
      scrivi(testo, col.sconto, yy, { font: grassetto, dimensione: 8, colore: hex('#8a5a00'), allinea: 'centro' });
    }
    scrivi(euro(r.totaleCent), col.importo, yy, { font: grassetto, dimensione: 10, colore: BLU_SCURO, allinea: 'destra' });
    if (r.listinoTotaleCent) {
      const l = scrivi(euro(r.listinoTotaleCent), col.importo, yy - 11, { dimensione: 8, colore: GRIGIO, allinea: 'destra' });
      pagina.drawLine({ start: { x: col.importo - l, y: yy - 8.3 }, end: { x: col.importo, y: yy - 8.3 }, thickness: 0.7, color: GRIGIO });
    }
    y -= altezza;
  });

  // riepilogo IVA a sinistra, totali a destra
  const altezzaTotali = 26 + d.totali.filter((t) => !t.forte).length * 16 + 56;
  if (y - altezzaTotali - 20 < PIEDE + 10) nuovaPagina(false, false);
  y -= 14;
  pagina.drawLine({ start: { x: MARGINE, y }, end: { x: DESTRA, y }, thickness: 0.8, color: LINEA });
  y -= 22;
  const xTotali = 340;
  if (d.iva) {
    etichetta('Riepilogo IVA', MARGINE, y);
    const c = [MARGINE, MARGINE + 110, MARGINE + 200];
    etichetta('Aliquota', c[0], y - 18, { dimensione: 6.5 });
    etichetta('Imponibile', c[1], y - 18, { dimensione: 6.5, allinea: 'destra' });
    etichetta('Imposta', c[2], y - 18, { dimensione: 6.5, allinea: 'destra' });
    scrivi(d.iva.aliquota, c[0], y - 32);
    scrivi(euro(d.iva.imponibileCent), c[1], y - 32, { allinea: 'destra' });
    scrivi(euro(d.iva.impostaCent), c[2], y - 32, { allinea: 'destra' });
  }
  let yt = y;
  for (const t of d.totali.filter((t) => !t.forte)) {
    scrivi(t.etichetta, xTotali, yt, { colore: GRIGIO });
    scrivi(euro(t.cent), col.importo, yt, { allinea: 'destra' });
    yt -= 16;
  }
  const forte = d.totali.find((t) => t.forte);
  if (forte) {
    yt -= 8;
    riquadro(xTotali - 12, yt - 34, DESTRA - xTotali + 12, 46, 8, BLU);
    etichetta(forte.etichetta, xTotali, yt - 6, { colore: ORO, dimensione: 8 });
    scrivi(euro(forte.cent), col.importo, yt - 22, { font: grassetto, dimensione: 20, colore: BIANCO, allinea: 'destra' });
    yt -= 46;
  }
  y = Math.min(yt, y - 40) - 22;

  if (d.note?.length) {
    if (y < PIEDE + 40) nuovaPagina(false, false);
    etichetta('Note e condizioni', MARGINE, y);
    y -= 15;
    for (const nota of d.note) {
      for (const riga of aCapo(nota, normale, 8.5, DESTRA - MARGINE)) {
        if (y < PIEDE + 14) nuovaPagina(false, false);
        scrivi(riga, MARGINE, y, { dimensione: 8.5, colore: GRIGIO });
        y -= 11.5;
      }
      y -= 4;
    }
  }

  const pagine = pdf.getPages();
  pagine.forEach((p, i) => {
    pagina = p;
    pagina.drawLine({ start: { x: MARGINE, y: 46 }, end: { x: DESTRA, y: 46 }, thickness: 0.8, color: LINEA });
    pagina.drawRectangle({ x: MARGINE, y: 45.4, width: 40, height: 1.8, color: ORO });
    scrivi(sito.ragione_sociale, MARGINE, 30, { font: grassetto, dimensione: 7.5, colore: BLU });
    const lRagione = grassetto.widthOfTextAtSize(pulito(sito.ragione_sociale), 7.5);
    scrivi(`  ·  ${[sito.email, sito.telefono].filter(Boolean).join('  ·  ')}`, MARGINE + lRagione, 30, { dimensione: 7.5, colore: GRIGIO });
    scrivi(`${d.titolo} n. ${d.numero}  ·  ${i + 1} / ${pagine.length}`, DESTRA, 30, { dimensione: 7.5, colore: GRIGIO, allinea: 'destra' });
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
