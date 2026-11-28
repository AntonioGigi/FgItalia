/**
 * Dati del simulatore Winback BACK4 (pagina prodotto). Correnti, frequenze, modalità e
 * accessori vengono dalla scheda tecnica ufficiale (public/uploads/schede/BACK4.pdf) e dalla
 * brochure Winback sulle profondità d'azione. È una DIMOSTRAZIONE: non sostituisce il software
 * del dispositivo, né i protocolli della libreria Academy.
 */

export type IdCorrente = 'cet' | 'ret' | 'tens' | 'ems' | 'mix';
/** strati dei tessuti, dal più superficiale al più profondo (come nella brochure Winback) */
export type Strato = 'cute' | 'nervi' | 'molli' | 'duri';

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
  tipo: 'tecar' | 'stimolazione';
  descrizione: string;
  modalita: Modalita[];
}

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
    colore: '#f97316',
    tipo: 'tecar',
    descrizione: 'TECAR capacitiva: elettrodo isolato, azione sui tessuti ricchi d’acqua (muscoli, sistema linfatico).',
    modalita: [
      { id: 'soft', nome: 'Soft', frequenze: ['500 kHz'], strati: ['cute'], descrizione: 'Azione superficiale su pelle e fascia.' },
      { id: 'deep', nome: 'Deep', frequenze: ['300 kHz'], strati: ['molli'], descrizione: 'Azione profonda su muscoli e tessuti molli.' },
      {
        id: 'dynamic',
        nome: 'Dynamic',
        frequenze: ['300 kHz', '500 kHz'],
        strati: ['cute', 'molli'],
        descrizione: 'Alterna 300 e 500 kHz: dalla superficie ai tessuti molli.',
      },
    ],
  },
  {
    id: 'ret',
    nome: 'RET',
    colore: '#3b6fe0',
    tipo: 'tecar',
    descrizione: 'TECAR resistiva: elettrodo metallico, azione sui tessuti più resistenti (tendini, legamenti, articolazioni).',
    modalita: [
      { id: 'med', nome: 'Med', frequenze: ['500 kHz'], strati: ['molli', 'duri'], descrizione: 'Azione su tessuti molli e duri.' },
      {
        id: 'dyn',
        nome: 'Dyn',
        frequenze: ['300 kHz', '500 kHz'],
        strati: ['molli', 'duri'],
        descrizione: 'Alterna 300 e 500 kHz per tutta la profondità.',
      },
      { id: 'focal', nome: 'Focal', frequenze: ['300 kHz'], strati: ['duri'], descrizione: 'Concentrata su ossa, legamenti e articolazioni.' },
    ],
  },
  {
    id: 'tens',
    nome: 'Hi-TENS',
    colore: '#14b8a6',
    tipo: 'stimolazione',
    descrizione: 'Stimolazione antalgica ad alta tensione sul sistema nervoso.',
    modalita: [
      { id: 'acute', nome: 'Acute', frequenze: ['25 Hz'], strati: ['cute', 'nervi'], descrizione: 'Per il dolore acuto.' },
      { id: 'chronic', nome: 'Chronic', frequenze: ['2 Hz'], strati: ['nervi'], descrizione: 'Per il dolore cronico.' },
      { id: 'manual', nome: 'Manual', frequenze: ['2 Hz', '5 Hz', '25 Hz'], strati: ['cute', 'nervi'], descrizione: 'Frequenza scelta dal terapista.' },
    ],
  },
  {
    id: 'ems',
    nome: 'Hi-EMS',
    colore: '#60a5fa',
    tipo: 'stimolazione',
    descrizione: 'Stimolazione muscolare ad alta frequenza: tono, drenaggio, rilassamento.',
    modalita: [
      { id: 'focal', nome: 'Focal', frequenze: ['4000 Hz'], strati: ['molli'], descrizione: 'Contrazione concentrata sotto l’elettrodo.' },
      { id: 'radial', nome: 'Radial', frequenze: ['1500 Hz'], strati: ['molli'], descrizione: 'Contrazione diffusa sulla zona.' },
      { id: 'drain', nome: 'Drain', frequenze: ['1500 Hz'], strati: ['molli'], descrizione: 'Effetto pompa per il drenaggio.' },
      { id: 'dynamic', nome: 'Dynamic', frequenze: ['1500 Hz', '4000 Hz'], strati: ['molli'], descrizione: 'Alterna 1500 e 4000 Hz.' },
    ],
  },
  {
    id: 'mix',
    nome: 'MIX',
    colore: '#22c55e',
    tipo: 'tecar',
    descrizione: 'Multifrequenza a 1000 kHz per pelle, fascia e cicatrici.',
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
  /** solo Hi-TENS Manual: frequenza scelta */
  frequenza?: string;
}

export const INTENSITA_MAX = 100;
export const DURATA_MAX = 30 * 60;
export const PASSO_DURATA = 10;

export const limita = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(v)));
export const tempo = (secondi: number) => {
  const s = Math.max(0, Math.round(secondi));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/** Durata della seduta: i canali lavorano in parallelo sulle due vie, conta il più lungo */
export const durataSeduta = (canali: Partial<Record<IdCorrente, Canale>>) =>
  Math.max(0, ...Object.values(canali).map((c) => (c?.attivo ? c.durata : 0)));

/** Quanto ogni strato è raggiunto dai canali attivi (0-1, in base alla potenza) */
export function profondita(canali: Partial<Record<IdCorrente, Canale>>): Record<Strato, { livello: number; colori: string[] }> {
  const esito = Object.fromEntries(STRATI.map((s) => [s.id, { livello: 0, colori: [] as string[] }])) as Record<
    Strato,
    { livello: number; colori: string[] }
  >;
  for (const c of CORRENTI) {
    const canale = canali[c.id];
    if (!canale?.attivo || canale.intensita <= 0) continue;
    for (const s of modalita(c.id, canale.modalita).strati) {
      esito[s].livello = Math.max(esito[s].livello, canale.intensita / INTENSITA_MAX);
      esito[s].colori.push(c.colore);
    }
  }
  return esito;
}

// ——— accessori e configurazioni ———

export type IdConfigurazione = 'piastra' | 'due-tx' | 'tx-ritorno' | 'bracciali' | 'delta' | 'catena';

export const CONFIGURAZIONI: { id: IdConfigurazione; nome: string; descrizione: string }[] = [
  {
    id: 'piastra',
    nome: 'Manipolo + piastra di ritorno',
    descrizione: 'Configurazione classica: il manipolo TX eroga, la piastra di ritorno chiude il circuito.',
  },
  {
    id: 'due-tx',
    nome: 'Due manipoli TX, senza piastra',
    descrizione: 'La corrente passa tra i due manipoli: azione globale, ideale per iniziare il trattamento.',
  },
  {
    id: 'tx-ritorno',
    nome: 'Un manipolo fa da piastra',
    descrizione: 'Un manipolo TX resta fermo e fa da ritorno, l’altro eroga e si muove sulla zona da trattare.',
  },
  {
    id: 'bracciali',
    nome: 'Bracciali RET',
    descrizione: 'I due bracciali RET al polso: le mani del terapista diventano l’elettrodo durante la terapia manuale.',
  },
  {
    id: 'delta',
    nome: 'Tre zone – DELTA',
    descrizione: 'Configurazione in parallelo: aumenta l’intensità, non la tensione. Concentra la diatermia.',
  },
  {
    id: 'catena',
    nome: 'Tre zone – CHAIN SERIES',
    descrizione: 'Configurazione a catena: aumenta la tensione, non l’intensità. Accumula la diatermia.',
  },
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
  { id: 'acuta', nome: 'Fase acuta', descrizione: 'Dolore e infiammazione recenti: priorità a drenaggio e controllo del dolore.' },
  { id: 'subacuta', nome: 'Fase subacuta', descrizione: 'Riparazione dei tessuti: circolazione e recupero della mobilità.' },
  { id: 'cronica', nome: 'Fase cronica', descrizione: 'Dolore persistente e rigidità: azione profonda e ripresa funzionale.' },
] as const;
export type IdFase = (typeof FASI)[number]['id'];

/** zone dove prevalgono articolazioni e tendini (RET in primo piano) */
const ARTICOLARI: IdZona[] = ['spalla', 'gomito', 'polso', 'ginocchio', 'caviglia', 'anca'];

/**
 * Programma di ESEMPIO per la demo, costruito con le correnti della scheda tecnica.
 * I protocolli veri sono nella libreria Academy del dispositivo e vanno scelti dal professionista.
 */
export function programmaEsempio(zona: IdZona, fase: IdFase): Partial<Record<IdCorrente, Canale>> {
  const articolare = ARTICOLARI.includes(zona);
  const spento = (modalita: string): Canale => ({ attivo: false, modalita, intensita: 0, durata: 0 });
  const canali: Record<IdCorrente, Canale> = {
    cet: spento('soft'),
    ret: spento('med'),
    tens: spento('acute'),
    ems: spento('drain'),
    mix: spento('pulse'),
  };
  if (fase === 'acuta') {
    canali.cet = { attivo: true, modalita: 'soft', intensita: 30, durata: 180 };
    canali.tens = { attivo: true, modalita: 'acute', intensita: 40, durata: 240 };
    canali.ems = { attivo: true, modalita: 'drain', intensita: 25, durata: 180 };
  } else if (fase === 'subacuta') {
    canali.cet = { attivo: true, modalita: 'dynamic', intensita: 50, durata: 240 };
    canali.ret = { attivo: true, modalita: articolare ? 'dyn' : 'med', intensita: 40, durata: 180 };
    canali.tens = { attivo: true, modalita: 'manual', intensita: 35, durata: 180, frequenza: '5 Hz' };
  } else {
    canali.cet = { attivo: true, modalita: 'deep', intensita: 60, durata: 240 };
    canali.ret = { attivo: true, modalita: articolare ? 'focal' : 'dyn', intensita: 70, durata: 300 };
    canali.tens = { attivo: true, modalita: 'chronic', intensita: 40, durata: 240 };
    canali.mix = { attivo: !articolare, modalita: 'pulse', intensita: 40, durata: 120 };
  }
  return canali;
}
