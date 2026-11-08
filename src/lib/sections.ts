import { getData } from './content';

/**
 * Default heading for each kind of section. The components themselves are listed in
 * src/components/Sections.astro; a new kind of section needs an entry in both.
 */
export const SECTION_TITLES: Record<string, string> = {
  achievements: 'Achievements',
  skills: 'Tech stack',
  projects: 'Projects',
  highlights: 'A short intro',
  experience: 'Experience',
  education: 'Education',
  documents: 'Resume, transcript & socials'
};

/** Short names for site pages, shown on a section's heading link. */
const PAGE_NAMES: [string, string][] = [
  ['/about', '~/whoami'],
  ['/projects', '~/projects'],
  ['/blog', '~/cache']
];

export type PageSection = { section: string; id: string; title: string; link?: string; linkLabel?: string };

/** A page's sections from src/data/layout.yaml, with titles and link labels filled in. */
export async function getSections(page: 'home' | 'about'): Promise<PageSection[]> {
  const [layout] = await getData('layout');
  return layout[page].map((s) => {
    if (!(s.section in SECTION_TITLES)) {
      throw new Error(
        `src/data/layout.yaml: unknown section "${s.section}" under ${page}. Use one of: ${Object.keys(SECTION_TITLES).join(', ')}`
      );
    }
    const page_ = s.link ? PAGE_NAMES.find(([prefix]) => s.link!.startsWith(prefix)) : undefined;
    return {
      section: s.section,
      id: s.section,
      title: s.title ?? SECTION_TITLES[s.section],
      link: s.link,
      linkLabel: s.link ? (page_?.[1] ?? 'More') : undefined
    };
  });
}
