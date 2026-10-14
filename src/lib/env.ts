import { z } from 'zod';

// Server-only configuration. Never import this from a client component.
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  DATABASE_URL: z.string().optional(),
  PGLITE_DIR: z.string().default('.data/pglite'),
  DEMO_MODE: z.enum(['true', 'false']).default('true'),
  // Search engines may index the site only when this is true. Leave off for staging, previews and pre-launch.
  SITE_INDEXING: z.enum(['true', 'false']).default('false'),
  ALLOW_EMBEDDED_DB: z.enum(['true', 'false']).default('false'), // local production-mode testing only
  SESSION_SECRET: z.string().min(16).default('dev-only-session-secret-change-me'),
  TOKEN_ENCRYPTION_KEY: z.string().optional(), // 32 bytes, base64
  HONEYDOO_VARIABLE_COST_MINOR: z.coerce.number().int().min(0).default(8),

  SQUARE_APPLICATION_ID: z.string().optional(),
  SQUARE_APPLICATION_SECRET: z.string().optional(),
  SQUARE_ENVIRONMENT: z.enum(['sandbox', 'production']).default('sandbox'),
  SQUARE_WEBHOOK_SIGNATURE_KEY: z.string().optional(),
  SQUARE_WEBHOOK_URL: z.string().url().optional(),
  SQUARE_REDIRECT_URI: z.string().url().optional(),
  SQUARE_API_VERSION: z.string().default('2026-09-16'),
  SQUARE_COLLECT_APP_FEE: z.enum(['true', 'false']).default('true'),

  // Transactional email (password reset). Resend is the default adapter; unset means reset email is unavailable.
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('honeydoo <hello@honeydoo.com>'),

  AI_PROVIDER: z.enum(['anthropic', 'none']).default('anthropic'),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default('claude-sonnet-5-5'),
  AI_DAILY_REQUEST_LIMIT: z.coerce.number().int().default(5000),
});

export type Env = z.infer<typeof schema>;
let cached: Env | null = null;

export function env(): Env {
  if (!cached) {
    const parsed = schema.parse(process.env);
    if (parsed.NODE_ENV === 'production') {
      if (parsed.SESSION_SECRET.startsWith('dev-only')) throw new Error('SESSION_SECRET must be set in production');
      if (!parsed.DATABASE_URL && parsed.ALLOW_EMBEDDED_DB !== 'true') throw new Error('DATABASE_URL must be set in production');
      if (parsed.DEMO_MODE === 'true' && parsed.ALLOW_EMBEDDED_DB !== 'true') console.warn('DEMO_MODE is on in production. Turn it off before real launch.');
    }
    cached = parsed;
  }
  return cached;
}

export function resetEnvForTests() { cached = null; }

export const isDemoMode = () => env().DEMO_MODE === 'true';

export function squareConfigured() {
  const e = env();
  return Boolean(e.SQUARE_APPLICATION_ID && e.SQUARE_APPLICATION_SECRET && e.SQUARE_REDIRECT_URI && e.TOKEN_ENCRYPTION_KEY);
}

export const emailConfigured = () => !!env().RESEND_API_KEY;
