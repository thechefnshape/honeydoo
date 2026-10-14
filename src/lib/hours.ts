// Operating hours: { mon: [["07:00","17:00"]], ... } in the location's own time zone.
export type Hours = Partial<Record<Day, [string, string][]>>;
type Day = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';
const DAYS: Day[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function localParts(now: Date, tz: string) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const parts = Object.fromEntries(f.formatToParts(now).map((p) => [p.type, p.value]));
  const day = DAYS[['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday)];
  return { day, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}
const toMin = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
export function fmtTime(s: string) {
  const [h, m] = s.split(':').map(Number);
  const hh = ((h + 11) % 12) + 1;
  return `${hh}${m ? ':' + String(m).padStart(2, '0') : ''} ${h < 12 ? 'am' : 'pm'}`;
}

export interface PickupWindow { openNow: boolean; pickupToday: boolean; label: string; closesAt?: string }

/** Customer-facing pickup availability from posted hours and prep time. */
export function pickupWindow(hours: Hours, tz: string, prepMinutes: number, now = new Date()): PickupWindow {
  const { day, minutes } = localParts(now, tz);
  const today = hours[day] ?? [];
  for (const [o, c] of today) {
    const open = toMin(o), close = toMin(c);
    if (minutes >= open && minutes + prepMinutes <= close) return { openNow: true, pickupToday: true, label: `Pickup today, ready in about ${prepMinutes} min`, closesAt: c };
    if (minutes < open) return { openNow: false, pickupToday: true, label: `Pickup today from ${fmtTime(o)}` };
  }
  for (let i = 1; i <= 7; i++) {
    const d = DAYS[(DAYS.indexOf(day) + i) % 7];
    const slot = (hours[d] ?? [])[0];
    if (slot) return { openNow: false, pickupToday: false, label: `${i === 1 ? 'Tomorrow' : cap(d)} from ${fmtTime(slot[0])}` };
  }
  return { openNow: false, pickupToday: false, label: 'Pickup hours not posted' };
}
const cap = (d: string) => ({ sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday' } as Record<string, string>)[d];

export function hoursTable(hours: Hours): { day: string; text: string }[] {
  const order: Day[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  return order.map((d) => ({ day: cap(d), text: (hours[d] ?? []).map(([o, c]) => `${fmtTime(o)} to ${fmtTime(c)}`).join(', ') || 'Closed' }));
}
