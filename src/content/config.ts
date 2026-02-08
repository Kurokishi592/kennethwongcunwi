import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    tags: z.array(z.string()).default([])
  })
});

const projects = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    subtitle: z.string(),
    date: z.string().optional(),
    tags: z.array(z.string()).default([]),
    thumbnail: z.string().optional(),
    repo: z
      .object({
        url: z.string().url(),
        label: z.string().optional()
      })
      .optional(),
    documents: z
      .array(
        z.object({
          title: z.string(),
          url: z.string(),
          subtitle: z.string().optional(),
          thumbnail: z.string().optional()
        })
      )
      .default([]),
    featured: z.boolean().default(false),
    featuredRank: z.number().int().optional()
  })
});

export const collections = { blog, projects };
