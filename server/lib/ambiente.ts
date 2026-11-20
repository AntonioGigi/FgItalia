/** Variabili d'ambiente configurate su Cloudflare (Worker → Settings → Variables and Secrets, vedi README) */
export function variabile(nome: string): string {
  const valore = process.env[nome];
  if (!valore) throw new Error(`Variabile d'ambiente mancante: ${nome}`);
  return valore;
}

export const variabileFacoltativa = (nome: string): string | undefined => process.env[nome] || undefined;

let origineRichiesta: string | undefined;
/** Il worker la imposta a ogni richiesta: serve finché la variabile URL non è impostata */
export const impostaOrigine = (origine: string) => void (origineRichiesta = origine);

/** Indirizzo pubblico del sito: la variabile URL, altrimenti l'indirizzo da cui arriva la richiesta */
export const urlSito = (): string => (process.env.URL || origineRichiesta || 'https://www.fgitalia.it').replace(/\/$/, '');

type LettoreSito = (richiesta: Request) => Promise<Response>;
let lettoreSito: LettoreSito | undefined;
/** Il worker collega qui i file pubblicati (binding ASSETS): si leggono senza passare da internet */
export const impostaLettoreSito = (f: LettoreSito) => void (lettoreSito = f);

/** Legge un file pubblicato dal sito (es. /api/catalogo.json) */
export function richiestaAlSito(percorso: string, opzioni?: RequestInit): Promise<Response> {
  const url = `${urlSito()}${percorso}`;
  return lettoreSito ? lettoreSito(new Request(url, opzioni)) : fetch(url, opzioni);
}

export function json(dati: unknown, stato = 200): Response {
  return new Response(JSON.stringify(dati), {
    status: stato,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export const errore = (messaggio: string, stato = 400) => json({ errore: messaggio }, stato);
