# Maintaining the site

You only ever edit **text files**: YAML for lists of facts, Markdown (`.mdx`) for project write-ups.
No HTML, CSS or JavaScript needed.

## How Astro works (the 1-minute version)

Astro reads your text files and turns them into plain web pages. Cloudflare hosts those pages and
rebuilds them every time you push to GitHub.

```
src/data/*.yaml            facts: jobs, awards, skills, landing page timeline   <- you edit
src/content/projects/*.mdx one file per project                                 <- you edit
public/                    files served as-is: images, PDFs, videos, 3D models  <- you add files
src/components/, pages/    the layout that arranges your text                   <- rarely touched
```

If you make a typo (e.g. a missing field), the build stops and tells you the file and the field.

## Day to day

```
npm run dev      # live preview at http://localhost:4321 - updates when you save
git add -A && git commit -m "..." && git push    # publish
```

## Where things live

| To change...                              | Edit                                  |
| ----------------------------------------- | ------------------------------------- |
| Name, one-liner, intro, links, About cards | `src/data/profile.yaml`              |
| Award row on the landing page             | `src/data/achievements.yaml`          |
| Jobs and roles (dropdowns)                | `src/data/experience.yaml`            |
| Education                                 | `src/data/education.yaml`             |
| Tech stack logos                          | `src/data/skills.yaml`                |
| Landing page timeline + 3D models         | `src/data/journey.yaml`               |
| A project                                 | `src/content/projects/<name>.mdx`     |
| Resume / transcript                       | replace `public/docs/resume.pdf` / `transcript.pdf` |

Each YAML file starts with notes explaining its fields. Two rules apply everywhere:

- A bullet that starts with `TODO` is never shown on the site. Use it for notes to yourself.
- In YAML, wrap text in quotes if it contains a colon, e.g. `- "GPA: 4.88 / 5.00"`.

## Add a project

1. Make a folder for its pictures: `public/assets/<project-name>/`.
2. Copy an existing file in `src/content/projects/` and rename it. The file name becomes the URL.
3. Fill in the top block:

```yaml
---
title: "My Project"
subtitle: "One line shown on the card."
date: "Jan 2026 – Mar 2026"
tags: ["Embedded", "PCB"]
thumbnail: "/assets/my-project/main.jpg"
featured: true        # show on the landing page
featuredRank: 2       # order among featured projects (lower = first)
draft: true           # hide from the live site until it's ready
---
```

4. Write the rest in Markdown. `## Headings` appear in the page's Contents menu automatically.

To put it on the landing-page timeline, add its file name (without `.mdx`) to a chapter's
`projects:` list in `src/data/journey.yaml`.

## Images, videos, PDFs

- **Images:** drop phone photos into `public/assets/...` as they are. Before every build they are
  shrunk automatically, and big PNG photos become `.jpg` (references in your files are updated).
  Run `npm run images` to do it straight away.
- **Videos:** upload to YouTube (unlisted is fine), then in a project file:

  ```mdx
  import YouTube from '../../components/YouTube.astro';

  <YouTube id="kuJl6z97Nus" title="Demo" />
  ```

  `id` is the part after `watch?v=` in the link. Add `start={95}` to start at 1:35.
- **Short silent clips** (under ~10 MB) can live in `public/`:
  `<Video src="/assets/x/clip.mp4" caption="..." />` (import it like YouTube above).
- **PDFs:** `<Pdf src="/assets/x/report.pdf" title="Report" />`, or list them under `documents:` in
  the project's top block to get download cards.

## 3D models

The landing page turns each chapter's model as you scroll. To add or replace one:

1. In SOLIDWORKS: File → Save As → `.glb`. Save it in `raw-assets/` (not uploaded; files there are
   too big for the web).
2. Shrink it:

   ```
   npm run model -- raw-assets/MyAssembly.glb public/models/my-assembly.glb
   ```

   A 300 MB export usually comes out under 1 MB. If small parts look broken, add
   `--ratio 0.2` (more detail, bigger file). Parts smaller than 2.5 mm are dropped (`--min-size`).
3. Point a chapter at it in `src/data/journey.yaml`:

   ```yaml
   model:
     src: /models/my-assembly.glb
     label: What it is
     explode: true    # pull the boards apart while scrolling
   ```

The Kinova rig is built from Kinova's published meshes by `npm run model:kinova`. Change the arm
pose with `JOINT_DEG` in `scripts/build-kinova-model.mjs`.

## Commands

| Command                 | What it does                                        |
| ----------------------- | --------------------------------------------------- |
| `npm run dev`           | Live preview at localhost:4321 (drafts are visible) |
| `npm run build`         | Build the site into `dist/` (what Cloudflare runs)  |
| `npm run check`         | Look for errors without building                    |
| `npm run images`        | Shrink images in `public/assets/` now               |
| `npm run model -- a b`  | Shrink a SOLIDWORKS `.glb` export                   |
| `npm run model:kinova`  | Rebuild the dual Kinova arm model                   |
