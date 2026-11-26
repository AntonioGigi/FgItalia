import { expect, it, vi } from 'vitest';

const inviate: { to: { email: string }[] }[] = [];
vi.stubGlobal('fetch', async (_url: string, opzioni?: RequestInit) => {
  inviate.push(JSON.parse(String(opzioni?.body)));
  return new Response(JSON.stringify({ messageId: '1' }), { status: 201 });
});
Object.assign(process.env, { BREVO_API_KEY: 'prova', EMAIL_MITTENTE: 'commerciale@fgitalia.it' });
const { emailNegozio, indirizzi, inviaEmail } = await import('../server/lib/email');

it('le notifiche possono arrivare a più indirizzi separati da virgola', async () => {
  expect(indirizzi('papa@virgilio.it, commerciale@fgitalia.it;papa@virgilio.it')).toEqual(['papa@virgilio.it', 'commerciale@fgitalia.it']);
  process.env.EMAIL_NOTIFICHE = 'papa@virgilio.it, commerciale@fgitalia.it';
  await inviaEmail({ email: emailNegozio() }, { oggetto: 'Nuovo ordine', html: '<p>ok</p>' });
  expect(inviate[0].to.map((d) => d.email)).toEqual(['papa@virgilio.it', 'commerciale@fgitalia.it']);
});
