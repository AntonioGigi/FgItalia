import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://www.fgitalia.it',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
});
