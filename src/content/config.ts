import { defineCollection, z } from 'astro:content';
import { file } from 'astro/loaders';
import { parse as parseYaml } from 'yaml';

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
    featuredRank: z.number().int().optional(),
    // true = hidden from the live site (still visible with `npm run dev`)
    draft: z.boolean().default(false)
  })
});

// ---- Data files in src/data/*.yaml ----
// Lists keep their order from the file; you never need to write an `id`.
const yamlList = (path: string) =>
  file(path, {
    parser: (text) => {
      const doc = parseYaml(text);
      const items = Array.isArray(doc) ? doc : [doc];
      return items.map((item, i) => ({ id: String(i).padStart(3, '0'), ...item }));
    }
  });

// Lines that start with "TODO" are notes to self and never shown on the site.
const points = z
  .array(z.string())
  .default([])
  .transform((list) => list.filter((p) => !/^\s*TODO/i.test(p)));

const profile = defineCollection({
  loader: yamlList('src/data/profile.yaml'),
  schema: z.object({
    name: z.string(),
    headline: z.string(),
    intro: z.string(),
    focus: z.string().optional(),
    availability: z.string().optional(),
    email: z.string().email(),
    github: z.string().url(),
    linkedin: z.string().url(),
    resume: z.string().optional(),
    transcript: z.string().optional(),
    highlights: z
      .array(
        z.object({
          title: z.string(),
          body: z.string().optional(),
          points,
          // "steps" numbers the points (01, 02, ...) instead of bullets
          style: z.enum(['list', 'steps']).default('list')
        })
      )
      .default([]),
    // Big-number facts in the About page header
    facts: z.array(z.object({ value: z.coerce.string(), label: z.string() })).default([])
  })
});

const achievements = defineCollection({
  loader: yamlList('src/data/achievements.yaml'),
  schema: z.object({
    title: z.string(),
    year: z.coerce.string(),
    detail: z.string().optional()
  })
});

const experience = defineCollection({
  loader: yamlList('src/data/experience.yaml'),
  schema: z.object({
    org: z.string(),
    logo: z.string().optional(),
    logoDark: z.boolean().default(false),
    location: z.string().optional(),
    dates: z.string(),
    current: z.boolean().default(false),
    summary: z.string().optional(),
    roles: z
      .array(
        z.object({
          title: z.string(),
          dates: z.string().optional(),
          award: z.string().optional(),
          points,
          tags: z.array(z.string()).default([])
        })
      )
      .default([])
  })
});

const education = defineCollection({
  loader: yamlList('src/data/education.yaml'),
  schema: z.object({
    org: z.string(),
    logo: z.string().optional(),
    logoDark: z.boolean().default(false),
    degree: z.string(),
    detail: z.string().optional(),
    dates: z.string(),
    current: z.boolean().default(false),
    lines: z.array(z.string()).default([]),
    sections: z
      .array(z.object({ label: z.string(), collapsed: z.boolean().default(false), points }))
      .default([])
  })
});

const skills = defineCollection({
  loader: yamlList('src/data/skills.yaml'),
  schema: z.object({
    group: z.string(),
    items: z.array(z.object({ name: z.string(), icon: z.string().optional() }))
  })
});

const journey = defineCollection({
  loader: yamlList('src/data/journey.yaml'),
  schema: z.object({
    years: z.string(),
    title: z.string(),
    focus: z.array(z.string()).default([]),
    also: z.array(z.string()).default([]),
    text: z.string(),
    projects: z.array(z.string()).default([]),
    models: z
      .array(
        z.object({
          src: z.string(),
          label: z.string().optional(),
          explode: z.boolean().default(false),
          tilt: z.number().default(20),
          // node-name prefix of parts that spin while the model is shown (e.g. "rotor_")
          spin: z.string().optional()
        })
      )
      .default([])
  })
});

// Which sections each page shows, in order (src/data/layout.yaml).
const sectionList = z
  .array(
    // A bare name ("- skills") is short for { section: skills }.
    z.preprocess(
      (v) => (typeof v === 'string' ? { section: v } : v),
      z.object({ section: z.string(), title: z.string().optional(), link: z.string().optional() })
    )
  )
  .default([]);

const layout = defineCollection({
  loader: yamlList('src/data/layout.yaml'),
  schema: z.object({ home: sectionList, about: sectionList })
});

export const collections = { blog, projects, profile, achievements, experience, education, skills, journey, layout };
