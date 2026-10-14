import crypto from 'node:crypto';

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

export function hmac(secret: string, data: string, enc: 'base64' | 'base64url' | 'hex' = 'base64url'): string {
  return crypto.createHmac('sha256', secret).update(data).digest(enc);
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a); const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

function key(b64?: string): Buffer {
  if (!b64) throw new Error('TOKEN_ENCRYPTION_KEY is not configured');
  const k = Buffer.from(b64, 'base64');
  if (k.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes, base64 encoded');
  return k;
}

/** AES-256-GCM envelope: v1.<iv>.<tag>.<ciphertext>, all base64url. */
export function encryptSecret(plaintext: string, b64Key?: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(b64Key), iv);
  const ct = Buffer.concat([c.update(plaintext, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
}

export function decryptSecret(envelope: string, b64Key?: string): string {
  const [v, iv, tag, ct] = envelope.split('.');
  if (v !== 'v1' || !iv || !tag || !ct) throw new Error('Malformed secret envelope');
  const d = crypto.createDecipheriv('aes-256-gcm', key(b64Key), Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
}
