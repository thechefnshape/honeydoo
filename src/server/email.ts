import { env, emailConfigured } from '@/lib/env';
import { HttpError, log } from '@/lib/http';

export interface EmailMessage { to: string; subject: string; text: string }

let sender: ((m: EmailMessage) => Promise<void>) | null = null;
/** Tests replace the transport so no real email is sent. */
export function setEmailSenderForTests(fn: typeof sender) { sender = fn; }

/** Sends through Resend. Message bodies are never logged because they can contain sign-in links. */
export async function sendEmail(m: EmailMessage) {
  if (sender) return sender(m);
  if (!emailConfigured()) throw new HttpError(503, 'email_unavailable', 'Email is not set up yet, so we cannot send a reset link. Contact hello@honeydoo.com and we will help you get back in.');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env().RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env().EMAIL_FROM, to: [m.to], subject: m.subject, text: m.text }),
  });
  if (!r.ok) { log('error', 'email_send_failed', { status: r.status }); throw new HttpError(502, 'email_failed', 'We could not send the email. Try again in a minute.'); }
}
