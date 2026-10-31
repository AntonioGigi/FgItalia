import type { Config, Context } from '@netlify/functions';
import { errore, json, variabile, variabileFacoltativa } from '../lib/ambiente';
import { gettoneDaRichiesta, gettoneValido } from '../lib/accesso';
import { ipRichiesta, MINUTI, superaLimite } from '../lib/limiti';

/**
 * Accesso al pannello dei contenuti (/admin/, Decap CMS) con la stessa password
 * (e verifica in due passaggi) del pannello ordini, al posto dell'account GitHub.
 * Chi ha un gettone valido del pannello ordini riceve il token GitHub con cui Decap
 * salva prodotti e pagine nel repository: un token "fine-grained" limitato a questo
 * repository e ai soli contenuti, salvato su Netlify in GITHUB_CMS_TOKEN.
 */
export default async (req: Request, context?: Context) => {
  if (req.method !== 'POST') return errore('Metodo non consentito', 405);
  if (await superaLimite(`cms-ip:${ipRichiesta(req, context)}`, 30, 15 * MINUTI))
    return errore('Troppe richieste ravvicinate: riprova tra qualche minuto.', 429);
  if (!gettoneValido(gettoneDaRichiesta(req), variabile('ADMIN_PASSWORD'))) return errore('Accesso scaduto: inserisci di nuovo la password', 401);

  const token = variabileFacoltativa('GITHUB_CMS_TOKEN');
  if (!token)
    return errore('Il pannello dei contenuti non è ancora collegato a GitHub: manca la variabile GITHUB_CMS_TOKEN su Netlify.', 503);
  return json({ token });
};

export const config: Config = { path: '/api/cms-token' };
