// Versione Netlify della funzione server/funzioni/account-documento.mts (archivio su Netlify Blobs: server/lib/archivio-netlify.ts)
import funzione from '../funzioni/account-documento.mts';
import { preparaNetlify } from '../lib/archivio-netlify';

const f = funzione as unknown as (req: Request, context?: { ip?: string }) => Response | Promise<Response>;

export default (req: Request, context?: { ip?: string }) => {
  preparaNetlify();
  return f(req, { ip: context?.ip });
};

// Netlify legge indirizzo e orario solo se sono scritti qui per esteso (uguali a server/funzioni/account-documento.mts:
// lo controlla tests/netlify.test.ts)
export const config = { path: '/api/account/documento' };
