/** Dati della richiesta passati a ogni funzione dal worker */
export interface Context {
  /** indirizzo IP del visitatore */
  ip?: string;
}

/** Dove risponde una funzione: un percorso (o più) per le richieste, oppure un orario per quelle programmate */
export interface Config {
  path?: string | string[];
  /** espressione cron in UTC, deve comparire anche in wrangler.jsonc → triggers.crons */
  schedule?: string;
}
