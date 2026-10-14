/** Only same-site paths are allowed as a post-sign-in destination. */
export function safeNext(v: string | null | undefined, fallback = '/profile'): string {
  if (!v || !v.startsWith('/') || v.startsWith('//') || v.startsWith('/\\') || v.length > 300) return fallback;
  return v;
}
