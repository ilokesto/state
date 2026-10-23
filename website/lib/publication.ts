import publication from '../../docs-publication/active.json' with { type: 'json' };
import { rewriteDocsLink } from './docs-links.ts';

export const publishedPackages = publication.packages;
export type PackageName = keyof typeof publishedPackages;
export type DocsChannel = 'released' | 'next';

export function isPackageName(name: string | undefined): name is PackageName {
  return name !== undefined && Object.hasOwn(publishedPackages, name);
}

export function getDocsChannel(slugs: readonly string[] | undefined): DocsChannel | undefined {
  if (!isPackageName(slugs?.[0])) return undefined;
  return slugs?.[1] === 'next' ? 'next' : 'released';
}

export function isDevelopmentDocs(slugs: readonly string[] | undefined) {
  return getDocsChannel(slugs) === 'next';
}

export function isPackageIndex(slugs: readonly string[] | undefined) {
  const channel = getDocsChannel(slugs);
  return channel !== undefined
    && (slugs?.length === 1 || (channel === 'next' && slugs?.length === 2));
}

export function scopeDevelopmentLink(href: string | undefined) {
  return scopeDocsLink(href, true);
}

export function scopeDocsLink(href: string | undefined, development: boolean) {
  return rewriteDocsLink(href, development, 'state');
}
