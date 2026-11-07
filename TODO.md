# Website TODO

Work happens on the `redesign` branch. Nothing here is live until it is merged into `main`.
Search the repo for `TODO(Kenneth)` to find every placeholder in the data files.

## Done (redesign branch)
- [x] Landing page: intro, tiles (background, projects, resume, transcript, contacts), journey workbench (era tabs + 3D viewport with explode slider and part isolation)
- [x] AUV 5.0 stack model (288 MB -> 0.9 MB) with layered explode
- [x] FPGA tracker model from the EE2026 print STLs; rough VEX Tower Takeover robot rebuilt from photos
- [x] Dual Kinova Gen3 + Robotiq 2F-85 model with the real LUCID camera mount (0.16 MB)
- [x] Achievements moved to About; "Right now" and featured projects removed from the landing page
- [x] All About/landing content moved into `src/data/*.yaml`; LinkedIn-style role dropdowns; tech stack as logo grid
- [x] `draft: true` for projects; `TODO` bullets hidden automatically
- [x] `<YouTube>`, `<Pdf>`, `<Video>` components; FPGA page converted
- [x] Images shrunk (public/assets 110 MB -> 39 MB), small previews for cards, lazy-loaded images in write-ups
- [x] Landing page first load: 9 MB -> ~90 KB
- [x] Link-preview tags (LinkedIn/Telegram), footer year updates itself
- [x] Checked on phone (390 px), tablet (820 px), desktop (1440 px), light and dark theme
- [x] `MAINTAINING.md`

## Before merging to main
- [ ] **Get company clearance for the Kinova/GR00T material.** The rig photo and video are in `public/assets/embodied-ai/`, which is git-ignored so they can't be pushed by accident. Once cleared, delete that line from `.gitignore` and commit them. (The video shows a colleague at the back.)
- [ ] Look through the branch with `npm run dev`
- [ ] Check Cloudflare's build command is `npm run build` (not `astro build`), so image previews get made
- [ ] Merge `redesign` into `main` and push

## Content (yours)
### New
- [ ] `experience.yaml`: internship start month, how to name the company, your own bullets (placeholders marked `TODO(Kenneth)`)
- [ ] `experience.yaml`: AUV Lead start month, what you did as AUV Lead; Robotics Engineer end date
- [ ] `achievements.yaml`: year of the NUS Achievement Award
- [ ] Add `public/assets/images/logo-htx.png` (shows initials "H" until then)
- [ ] `skills.yaml`: trim or add to the tech stack
- [ ] Kinova project page after the internship: condensed story, diagrams, YouTube videos, the 2 reports
- [ ] AUV5 electrical stack project: real end date ("Dec 2025 – Present") and the RoboSub 2026 result
- [ ] YouTube channel + uploads
- [ ] New `resume.pdf` and `transcript.pdf`

### Fix stale facts
- [ ] TA role "AY25/26" in `education.yaml`: still current?
- [ ] Mini-AUV: "Led" (experience) vs "Co-led" (project card); pick one
- [ ] Journey chapter text in `journey.yaml` and the hero text in `profile.yaml`: rewrite in your own words

### Finish existing projects (warnings and TODOs visible to visitors)
- [ ] Mini-AUV (RoboSub 2025): work-in-progress notice + TODO list near the top
- [ ] FPGA object tracker: TODOs and a work-in-progress notice midway
- [ ] FALCON: work-in-progress notice + TODO
- [ ] IoT security device: TODO (schematic)
- [ ] Teleop search-and-rescue robot: work-in-progress notice
- [ ] NRC: TODO (pictures)
- [ ] Until each is done: set `draft: true`, or delete the visible TODO text

### Your uncommitted drafts (left untouched apart from the notes below)
- [ ] `src/content/blog/_cnn.md`: renamed from `cnn.md` because it has no title/date block, which stopped the build. Add the block and drop the `_` to publish it.
- [ ] `stm32.md`: image paths started with `/public/assets/...` (broken); now `/assets/...`. `stm32pins.png` became `stm32pins.jpg`.
- [ ] `src/content/blog/Flight_ctrl_comms`, `Processors and Chips`: no file extension, so Astro ignores them

## Later / ideas
- Replay a real joint trajectory from a recorded run on the 3D Kinova arms
- FPGA pan-tilt rig as a 3D model in the electrical chapter (needs a `.glb` export)

## Parked
- Cache (blog): leave as is for now
