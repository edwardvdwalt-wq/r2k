import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const relayUrl = Deno.env.get('RELAY_URL');
    const relaySecret = Deno.env.get('RELAY_SECRET');
    const { sql } = await req.json().catch(() => ({}));
    if (!sql) return Response.json({ error: 'sql required' }, { status: 400 });

    const res = await fetch(relayUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-relay-secret': relaySecret },
      body: JSON.stringify({ sql }),
    });
    const text = await res.text();
    return Response.json({ status: res.status, body: text });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});