import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import remarkCallout from 'remark-callout';

export default defineConfig({
  site: 'https://kennethwongcunwi.com',
  output: 'static',
  markdown: {
    remarkPlugins: [remarkCallout]
  },
  integrations: [
    mdx({
      remarkPlugins: [remarkCallout]
    })
  ]
});
