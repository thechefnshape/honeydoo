// Preview: routes live in the hash, and a reload re-reads the account from local storage.
export function hardNavigate(to: string) { location.hash = to; location.reload(); }
