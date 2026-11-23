/** Who can see the open store (docs/open-store.md › Keeping today's app unchanged). Pure. */
export type OpenStoreFlags = { enabled: boolean; superUserPreview: boolean };

export function canSeeOpenStore(flags: OpenStoreFlags, user: { isSuperUser: boolean } | null): boolean {
  if (flags.enabled) return true;
  return Boolean(flags.superUserPreview && user?.isSuperUser);
}
