import { existsSync } from 'node:fs';
import { getCollection, type CollectionEntry } from 'astro:content';

type DataCollection = 'profile' | 'achievements' | 'experience' | 'education' | 'skills' | 'journey';

/** Entries of a src/data/*.yaml file, in the order they appear in the file. */
export async function getData<C extends DataCollection>(name: C) {
  const entries = await getCollection(name);
  return entries.sort((a, b) => a.id.localeCompare(b.id)).map((e) => e.data as CollectionEntry<C>['data']);
}

export async function getProfile() {
  const [profile] = await getData('profile');
  return profile;
}

/** Project entries. Drafts are shown while running `npm run dev`, hidden on the live site. */
export async function getProjects() {
  return (await getCollection('projects')).filter(
    (p) => p.id.endsWith('.mdx') && (import.meta.env.DEV || !p.data.draft)
  );
}

/** True if a file exists in public/ (paths as written on the site, e.g. /assets/x.jpg). */
export const inPublic = (src?: string) => Boolean(src) && existsSync(`public${decodeURI(src!)}`);

/**
 * The small .webp preview made by `npm run images`, else the original image,
 * else undefined when the file is missing (so the page leaves the image out instead of breaking).
 */
export function thumb(src?: string) {
  if (!src) return undefined;
  const preview = '/thumbs' + decodeURI(src).replace(/\.[^.]+$/, '.webp');
  if (existsSync(`public${preview}`)) return encodeURI(preview);
  return inPublic(src) ? src : undefined;
}
