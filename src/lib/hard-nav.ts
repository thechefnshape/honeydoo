/** Full page navigation, so server-rendered parts (header, bag, orders) pick up a sign-in or sign-out. */
export function hardNavigate(to: string) { window.location.assign(to); }
