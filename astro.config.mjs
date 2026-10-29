import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://www.fgitalia.it',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  experimental: {
    // Content Security Policy: il browser esegue solo gli script del sito (impronta SHA-256),
    // così un eventuale codice iniettato non può leggere dati o sessioni dei clienti
    csp: {
      algorithm: 'SHA-256',
      directives: [
        "default-src 'self'",
        "img-src 'self' data: blob: https://*.cdninstagram.com https://*.fbcdn.net",
        "font-src 'self' data:",
        "connect-src 'self'",
        "form-action 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-src 'self' blob:",
        'upgrade-insecure-requests',
      ],
    },
  },
});
