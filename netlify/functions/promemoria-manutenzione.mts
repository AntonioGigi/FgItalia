import type { Config } from '@netlify/functions';
import { leggiSchede } from '../lib/catalogo';
import { dispositiviDaRicordare, elencoClienti, oggiIso, ordiniCliente, prossimaManutenzione, salvaCliente, sincronizzaDispositivi } from '../lib/clienti';
import { emailPromemoriaManutenzione, inviaEmail } from '../lib/email';

/**
 * Ogni mattina controlla le apparecchiature dei clienti e manda un promemoria
 * 30 giorni prima della scadenza della manutenzione (una sola volta per scadenza).
 */
export default async () => {
  const oggi = oggiIso();
  const schede = await leggiSchede();
  let inviati = 0;

  for (const cliente of await elencoClienti()) {
    try {
      let cambiato = sincronizzaDispositivi(cliente, await ordiniCliente(cliente), schede);
      const daRicordare = dispositiviDaRicordare(cliente, oggi);
      if (daRicordare.length) {
        await inviaEmail({ email: cliente.email, nome: cliente.nome }, emailPromemoriaManutenzione(cliente, daRicordare, oggi));
        for (const d of daRicordare) d.avvisato = prossimaManutenzione(d);
        cambiato = true;
        inviati++;
      }
      if (cambiato) await salvaCliente(cliente);
    } catch (e) {
      console.error(`Promemoria non inviato al cliente ${cliente.id}`, e);
    }
  }
  console.log(`Promemoria manutenzione inviati: ${inviati}`);
  return new Response(JSON.stringify({ inviati }), { headers: { 'Content-Type': 'application/json' } });
};

// ogni giorno alle 7:00 UTC (8 o 9 in Italia)
export const config: Config = { schedule: '0 7 * * *' };
