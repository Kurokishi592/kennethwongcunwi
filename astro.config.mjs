import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import remarkCallout from 'remark-callout';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeLazyImages from './src/lib/rehype-lazy-images.mjs';

export default defineConfig({
  site: 'https://kennethwongcunwi.com',
  output: 'static',
  markdown: {
    remarkPlugins: [remarkCallout, remarkMath],
    rehypePlugins: [rehypeKatex, rehypeLazyImages]
  },
  vite: {
    // three.js is ~180 KB gzipped but only loads when a 3D model scrolls into view.
    build: { chunkSizeWarningLimit: 800 }
  },
  integrations: [
    mdx({
      remarkPlugins: [remarkCallout, remarkMath],
      rehypePlugins: [rehypeKatex, rehypeLazyImages]
    })
  ]
});
