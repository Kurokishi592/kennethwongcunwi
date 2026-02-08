import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import remarkCallout from 'remark-callout';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

export default defineConfig({
  site: 'https://kennethwongcunwi.com',
  output: 'static',
  markdown: {
    remarkPlugins: [remarkCallout, remarkMath],
    rehypePlugins: [rehypeKatex]
  },
  integrations: [
    mdx({
      remarkPlugins: [remarkCallout, remarkMath],
      rehypePlugins: [rehypeKatex]
    })
  ]
});
