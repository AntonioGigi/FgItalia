/** Variabili d'ambiente configurate su Netlify (vedi README) */
export function variabile(nome: string): string {
  const valore = process.env[nome];
  if (!valore) throw new Error(`Variabile d'ambiente mancante: ${nome}`);
  return valore;
}

export const variabileFacoltativa = (nome: string): string | undefined => process.env[nome] || undefined;

/** Indirizzo pubblico del sito (Netlify imposta URL in produzione) */
export const urlSito = (): string => (process.env.URL ?? 'https://www.fgitalia.it').replace(/\/$/, '');

export function json(dati: unknown, stato = 200): Response {
  return new Response(JSON.stringify(dati), {
    status: stato,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export const errore = (messaggio: string, stato = 400) => json({ errore: messaggio }, stato);
