/**
 * Dati del simulatore Winback BACK4 (pagina prodotto), sul modello dell'interfaccia BACK4 2.0.
 * Correnti, frequenze e accessori vengono dalla scheda tecnica ufficiale
 * (public/uploads/schede/BACK4.pdf) e dalla brochure Winback sulle profondità d'azione.
 * È una DIMOSTRAZIONE: non sostituisce il software del dispositivo né i protocolli Academy.
 */

export type IdCorrente = 'cet' | 'ret' | 'tens' | 'ems' | 'mix';
/** strati dei tessuti, dal più superficiale al più profondo (come nella brochure Winback) */
export type Strato = 'cute' | 'nervi' | 'molli' | 'duri';
export type Livello = 'low' | 'medium' | 'high';

export interface Modalita {
  id: string;
  nome: string;
  /** frequenze erogate in questa modalità (più di una = alternate) */
  frequenze: string[];
  strati: Strato[];
  descrizione: string;
}

export interface Corrente {
  id: IdCorrente;
  nome: string;
  colore: string;
  /** colore più scuro per il fondo "liquido" della colonna */
  scuro: string;
  tipo: 'tecar' | 'stimolazione';
  /** le due vie indipendenti del dispositivo: 1 = TECAR, 2 = stimolazioni */
  via: 1 | 2;
  descrizione: string;
  modalita: Modalita[];
  /** seconda riga della colonna (Low / Medium / High) */
  livelli?: boolean;
  /** frequenze da scegliere a parte (cerchi del Hi-TENS, Hz del MIX) */
  frequenzeScelta?: string[];
}

export const LIVELLI: { id: Livello; nome: string }[] = [
  { id: 'low', nome: 'Low' },
  { id: 'medium', nome: 'Medium' },
  { id: 'high', nome: 'High' },
];

export const STRATI: { id: Strato; nome: string; dettaglio: string }[] = [
  { id: 'cute', nome: 'Tessuti cutanei e sottocutanei', dettaglio: 'pelle, fascia, cicatrici' },
  { id: 'nervi', nome: 'Sistema nervoso', dettaglio: 'controllo del dolore' },
  { id: 'molli', nome: 'Tessuti molli', dettaglio: 'muscolo, fascia, sistema linfatico e vascolare' },
  { id: 'duri', nome: 'Tessuti duri', dettaglio: 'osso, legamenti, tendini, articolazioni' },
];

export const CORRENTI: Corrente[] = [
  {
    id: 'cet',
    nome: 'CET',
    colore: '#f2733a',
    scuro: '#5a2414',
    tipo: 'tecar',
    via: 1,
    livelli: true,
    descrizione: 'TECAR capacitiva: elettrodo isolato, azione sui tessuti ricchi d’acqua (muscoli, sistema linfatico).',
    modalita: [
      { id: 'soft', nome: 'Soft', frequenze: ['500 kHz'], strati: ['cute'], descrizione: 'Azione superficiale su pelle e fascia.' },
      { id: 'deep', nome: 'Deep', frequenze: ['300 kHz'], strati: ['molli'], descrizione: 'Azione profonda su muscoli e tessuti molli.' },
      { id: 'dynamic', nome: 'Dynamic', frequenze: ['300 kHz', '500 kHz'], strati: ['cute', 'molli'], descrizione: 'Alterna 300 e 500 kHz.' },
    ],
  },
  {
    id: 'ret',
    nome: 'RET',
    colore: '#4f46e5',
    scuro: '#1e1b6b',
    tipo: 'tecar',
    via: 1,
    livelli: true,
    descrizione: 'TECAR resistiva: elettrodo metallico, azione sui tessuti più resistenti (tendini, legamenti, articolazioni).',
    modalita: [
      { id: 'soft', nome: 'Soft', frequenze: ['500 kHz'], strati: ['molli', 'duri'], descrizione: 'Tessuti molli e duri.' },
      { id: 'deep', nome: 'Deep', frequenze: ['300 kHz'], strati: ['duri'], descrizione: 'Concentrata su ossa, legamenti e articolazioni.' },
      { id: 'dynamic', nome: 'Dynamic', frequenze: ['300 kHz', '500 kHz'], strati: ['molli', 'duri'], descrizione: 'Alterna 300 e 500 kHz.' },
    ],
  },
  {
    id: 'tens',
    nome: 'Hi-TENS',
    colore: '#2dd4bf',
    scuro: '#0f3d3a',
    tipo: 'stimolazione',
    via: 2,
    frequenzeScelta: ['25 Hz', '5 Hz', '2 Hz'],
    descrizione: 'Stimolazione antalgica ad alta tensione sul sistema nervoso (2, 5 e 25 Hz).',
    modalita: [
      { id: 'static', nome: 'Static', frequenze: [], strati: ['cute', 'nervi'], descrizione: 'Frequenza fissa scelta sullo schermo.' },
      { id: 'dynamic', nome: 'Dynamic', frequenze: ['2 Hz', '5 Hz', '25 Hz'], strati: ['cute', 'nervi'], descrizione: 'Le frequenze si alternano.' },
    ],
  },
  {
    id: 'ems',
    nome: 'Hi-EMS',
    colore: '#4f8ff7',
    scuro: '#15305e',
    tipo: 'stimolazione',
    via: 2,
    descrizione: 'Stimolazione muscolare ad alta frequenza (1500 e 4000 Hz): tono, drenaggio, rilassamento.',
    modalita: [
      { id: 'radial', nome: 'Radial', frequenze: ['1500 Hz'], strati: ['molli'], descrizione: 'Contrazione diffusa sulla zona.' },
      { id: 'focal', nome: 'Focal', frequenze: ['4000 Hz'], strati: ['molli'], descrizione: 'Contrazione concentrata sotto l’elettrodo.' },
      { id: 'drain', nome: 'Drain', frequenze: ['1500 Hz'], strati: ['molli'], descrizione: 'Effetto pompa per il drenaggio.' },
      { id: 'dynamic', nome: 'Dynamic', frequenze: ['1500 Hz', '4000 Hz'], strati: ['molli'], descrizione: 'Alterna 1500 e 4000 Hz.' },
    ],
  },
  {
    id: 'mix',
    nome: 'MIX',
    colore: '#4ade80',
    scuro: '#14432a',
    tipo: 'tecar',
    via: 1,
    livelli: true,
    frequenzeScelta: ['5 Hz', '25 Hz', '2 Hz'],
    descrizione: 'Multifrequenza a 1000 kHz, pulsata: pelle, fascia e cicatrici.',
    modalita: [{ id: 'pulse', nome: 'Pulse', frequenze: ['1000 kHz'], strati: ['cute'], descrizione: 'Erogazione pulsata superficiale.' }],
  },
];

export const corrente = (id: IdCorrente) => CORRENTI.find((c) => c.id === id)!;
export const modalita = (id: IdCorrente, m: string) => corrente(id).modalita.find((x) => x.id === m) ?? corrente(id).modalita[0];

/** Stato di un canale nella modalità Expert */
export interface Canale {
  attivo: boolean;
  modalita: string;
  /** potenza in percentuale, 0-100 */
  intensita: number;
  /** durata in secondi */
  durata: number;
  livello?: Livello;
  /** Hi-TENS e MIX: frequenza scelta */
  frequenza?: string;
}

export const INTENSITA_MAX = 100;
export const DURATA_MAX = 30 * 60;
export const PASSO_DURATA = 30;

export const limita = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(v)));
export const tempo = (secondi: number) => {
  const s = Math.max(0, Math.round(secondi));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/** Frequenze effettive del canale (quella scelta per Hi-TENS statico e MIX) */
export function frequenzeCanale(id: IdCorrente, k: Canale): string[] {
  const m = modalita(id, k.modalita);
  if (id === 'tens') return m.id === 'static' ? [k.frequenza ?? '25 Hz'] : m.frequenze;
  if (id === 'mix') return [...m.frequenze, k.frequenza ?? '5 Hz'];
  return m.frequenze;
}

/**
 * Durata della seduta. BACK4 ha due vie indipendenti: sulla via 1 le correnti TECAR
 * (CET, RET, MIX) si susseguono, sulla via 2 le stimolazioni (Hi-TENS, Hi-EMS); le due vie
 * lavorano in parallelo, quindi conta la più lunga.
 */
export function durataSeduta(canali: Partial<Record<IdCorrente, Canale>>) {
  const vie = [0, 0];
  for (const c of CORRENTI) if (canali[c.id]?.attivo) vie[c.via - 1] += canali[c.id]!.durata;
  return Math.max(...vie);
}

/** Quale canale sta lavorando su ciascuna via dopo `trascorsi` secondi (in ordine da sinistra) */
export function inErogazione(canali: Partial<Record<IdCorrente, Canale>>, trascorsi: number): { via1?: IdCorrente; via2?: IdCorrente; restanti: Record<IdCorrente, number> } {
  const restanti = { cet: 0, ret: 0, tens: 0, ems: 0, mix: 0 } as Record<IdCorrente, number>;
  const esito: { via1?: IdCorrente; via2?: IdCorrente; restanti: Record<IdCorrente, number> } = { restanti };
  for (const via of [1, 2] as const) {
    let t = trascorsi;
    for (const c of CORRENTI.filter((x) => x.via === via)) {
      const k = canali[c.id];
      if (!k?.attivo) continue;
      const usato = Math.min(k.durata, Math.max(0, t));
      restanti[c.id] = k.durata - usato;
      if (restanti[c.id] > 0 && !esito[`via${via}`]) esito[`via${via}`] = c.id;
      t -= k.durata;
    }
  }
  return esito;
}

/** Quanto ogni strato è raggiunto dai canali indicati (0-1, in base alla potenza) */
export function profondita(canali: Partial<Record<IdCorrente, Canale>>, soloIn?: IdCorrente[]): Record<Strato, { livello: number; colori: string[] }> {
  const esito = Object.fromEntries(STRATI.map((s) => [s.id, { livello: 0, colori: [] as string[] }])) as Record<
    Strato,
    { livello: number; colori: string[] }
  >;
  for (const c of CORRENTI) {
    const canale = canali[c.id];
    if (!canale?.attivo || canale.intensita <= 0 || (soloIn && !soloIn.includes(c.id))) continue;
    for (const s of modalita(c.id, canale.modalita).strati) {
      esito[s].livello = Math.max(esito[s].livello, canale.intensita / INTENSITA_MAX);
      esito[s].colori.push(c.colore);
    }
  }
  return esito;
}

// ——— accessori e configurazioni ———

export type IdConfigurazione = 'piastra' | 'due-tx' | 'tx-ritorno' | 'bracciali' | 'delta' | 'catena';

export const CONFIGURAZIONI: { id: IdConfigurazione; nome: string; descrizione: string; piastra: boolean; tx: number }[] = [
  { id: 'piastra', nome: 'Manipolo + piastra', piastra: true, tx: 1, descrizione: 'Configurazione classica: il manipolo TX eroga, la piastra di ritorno chiude il circuito.' },
  { id: 'due-tx', nome: 'Due TX senza piastra', piastra: false, tx: 2, descrizione: 'La corrente passa tra i due manipoli: azione globale, ideale per iniziare il trattamento.' },
  { id: 'tx-ritorno', nome: 'Un TX fa da piastra', piastra: false, tx: 2, descrizione: 'Un manipolo resta fermo e fa da ritorno, l’altro eroga e si muove sulla zona.' },
  { id: 'bracciali', nome: 'Bracciali RET', piastra: true, tx: 0, descrizione: 'I bracciali RET al polso: le mani del terapista diventano l’elettrodo durante la terapia manuale.' },
  { id: 'delta', nome: '3 zone DELTA', piastra: true, tx: 2, descrizione: 'In parallelo: aumenta l’intensità, non la tensione. Concentra la diatermia.' },
  { id: 'catena', nome: '3 zone CHAIN SERIES', piastra: true, tx: 2, descrizione: 'A catena: aumenta la tensione, non l’intensità. Accumula la diatermia.' },
];

// ——— modalità Academy (esempi dimostrativi) ———

export const ZONE = [
  { id: 'cervicale', nome: 'Cervicale', y: 18, x: 50 },
  { id: 'spalla', nome: 'Spalla', y: 24, x: 33 },
  { id: 'gomito', nome: 'Gomito', y: 40, x: 24 },
  { id: 'polso', nome: 'Polso e mano', y: 51, x: 23 },
  { id: 'dorsale', nome: 'Dorsale', y: 32, x: 50 },
  { id: 'lombare', nome: 'Lombare', y: 46, x: 50 },
  { id: 'anca', nome: 'Anca', y: 56, x: 40 },
  { id: 'coscia', nome: 'Coscia', y: 66, x: 42.5 },
  { id: 'ginocchio', nome: 'Ginocchio', y: 81, x: 43 },
  { id: 'caviglia', nome: 'Caviglia e piede', y: 100, x: 43.5 },
] as const;
export type IdZona = (typeof ZONE)[number]['id'];

export const FASI = [
  { id: 'acuta', nome: 'Fase acuta', descrizione: 'Dolore e infiammazione recenti: drenaggio e controllo del dolore.' },
  { id: 'subacuta', nome: 'Fase subacuta', descrizione: 'Riparazione dei tessuti: circolazione e mobilità.' },
  { id: 'cronica', nome: 'Fase cronica', descrizione: 'Dolore persistente e rigidità: azione profonda.' },
] as const;
export type IdFase = (typeof FASI)[number]['id'];

const ARTICOLARI: IdZona[] = ['spalla', 'gomito', 'polso', 'ginocchio', 'caviglia', 'anca'];

/**
 * Programma di ESEMPIO per la demo, costruito con le correnti della scheda tecnica.
 * I protocolli veri sono nella libreria Academy del dispositivo e vanno scelti dal professionista.
 */
export function programmaEsempio(zona: IdZona, fase: IdFase): Record<IdCorrente, Canale> {
  const articolare = ARTICOLARI.includes(zona);
  const spento = (modalita: string, extra: Partial<Canale> = {}): Canale => ({ attivo: false, modalita, intensita: 0, durata: 150, ...extra });
  const canali: Record<IdCorrente, Canale> = {
    cet: spento('soft', { livello: 'low' }),
    ret: spento('deep', { livello: 'medium' }),
    tens: spento('static', { frequenza: '25 Hz' }),
    ems: spento('radial'),
    mix: spento('pulse', { livello: 'medium', frequenza: '5 Hz' }),
  };
  if (fase === 'acuta') {
    Object.assign(canali.cet, { attivo: true, modalita: 'soft', livello: 'low', intensita: 40, durata: 180 });
    Object.assign(canali.tens, { attivo: true, modalita: 'static', frequenza: '25 Hz', intensita: 45, durata: 180 });
    Object.assign(canali.ems, { attivo: true, modalita: 'drain', intensita: 35, durata: 120 });
  } else if (fase === 'subacuta') {
    Object.assign(canali.cet, { attivo: true, modalita: 'dynamic', livello: 'medium', intensita: 60, durata: 150 });
    Object.assign(canali.ret, { attivo: true, modalita: articolare ? 'dynamic' : 'soft', livello: 'medium', intensita: 50, durata: 150 });
    Object.assign(canali.tens, { attivo: true, modalita: 'static', frequenza: '5 Hz', intensita: 40, durata: 150 });
    Object.assign(canali.ems, { attivo: true, modalita: 'radial', intensita: 50, durata: 150 });
  } else {
    Object.assign(canali.cet, { attivo: true, modalita: 'deep', livello: 'high', intensita: 70, durata: 150 });
    Object.assign(canali.ret, { attivo: true, modalita: 'deep', livello: 'high', intensita: 80, durata: 180 });
    Object.assign(canali.tens, { attivo: true, modalita: 'static', frequenza: '2 Hz', intensita: 45, durata: 150 });
    Object.assign(canali.mix, { attivo: !articolare, intensita: 50, durata: 120 });
  }
  return canali;
}
