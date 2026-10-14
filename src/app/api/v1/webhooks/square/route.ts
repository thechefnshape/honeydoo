import { NextResponse } from 'next/server';
import { log } from '@/lib/http';
import { processSquareEvent, recordEvent, verifySquareSignature } from '@/server/integrations/square/webhooks';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifySquareSignature(raw, req.headers.get('x-square-hmacsha256-signature'))) {
    log('warn', 'square_webhook_bad_signature');
    return new NextResponse('invalid signature', { status: 403 });
  }
  let evt: any;
  try { evt = JSON.parse(raw); } catch { return new NextResponse('bad payload', { status: 400 }); }
  if (!evt?.event_id || !evt?.type) return new NextResponse('bad payload', { status: 400 });

  const rec = await recordEvent(evt);
  if (rec.duplicate) return NextResponse.json({ ok: true, duplicate: true });
  try {
    await processSquareEvent(rec.id, evt);
    return NextResponse.json({ ok: true });
  } catch {
    // Non-2xx makes Square retry; the stored event is also re-processable by the job runner.
    return new NextResponse('processing failed', { status: 500 });
  }
}
