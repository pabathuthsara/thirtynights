import { createClient } from 'npm:@supabase/supabase-js@2.111.0';

const encoder = new TextEncoder();

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hmacHex(value: string, secret: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const authorizationSecret = Deno.env.get('REVENUECAT_WEBHOOK_AUTH');
  const hmacSecret = Deno.env.get('REVENUECAT_WEBHOOK_HMAC_SECRET');
  if (!authorizationSecret || !hmacSecret) return new Response('Webhook is not configured', { status: 503 });
  const suppliedAuthorization = request.headers.get('authorization') ?? '';
  if (!constantTimeEqual(suppliedAuthorization, `Bearer ${authorizationSecret}`)) return new Response('Unauthorized', { status: 401 });

  const rawBody = await request.text();
  const signatureParts = Object.fromEntries((request.headers.get('x-revenuecat-webhook-signature') ?? '')
    .split(',').map((part) => part.split('=', 2)).filter((part) => part.length === 2));
  const timestamp = signatureParts.t;
  const suppliedSignature = signatureParts.v1;
  if (!timestamp || !suppliedSignature || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return new Response('Invalid signature timestamp', { status: 401 });
  const expectedSignature = await hmacHex(`${timestamp}.${rawBody}`, hmacSecret);
  if (!constantTimeEqual(suppliedSignature, expectedSignature)) return new Response('Invalid signature', { status: 401 });

  try {
    const payload = JSON.parse(rawBody) as { event?: Record<string, unknown> };
    if (!payload.event) return new Response('Invalid payload', { status: 400 });
    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.rpc('process_revenuecat_event', {
      event: payload.event,
      payload_hash: await sha256Hex(rawBody),
    });
    if (error) throw error;
    return Response.json({ accepted: true, result: data }, { status: 200 });
  } catch (error) {
    console.error('revenuecat_webhook_failed', error instanceof Error ? error.message : 'unknown');
    return Response.json({ accepted: false }, { status: 500 });
  }
});
