// Versione Netlify della funzione server/funzioni/account-google.mts (archivio su Netlify Blobs: server/lib/archivio-netlify.ts)
import funzione from '../funzioni/account-google.mts';
import { preparaNetlify } from '../lib/archivio-netlify';
import { impostaOrigine } from '../lib/ambiente';

const f = funzione as unknown as (req: Request, context?: { ip?: string }) => Response | Promise<Response>;

export default (req: Request, context?: { ip?: string }) => {
  preparaNetlify();
  if (req.url.startsWith('http')) impostaOrigine(new URL(req.url).origin);
  return f(req, { ip: context?.ip });
};

// Netlify legge indirizzo e orario solo se sono scritti qui per esteso (uguali a server/funzioni/account-google.mts:
// lo controlla tests/netlify.test.ts)
export const config = { path: ['/api/account/google', '/api/account/google/ritorno'] };
