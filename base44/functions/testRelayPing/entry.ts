import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const relayUrl = Deno.env.get('RELAY_URL');
    const relaySecret = Deno.env.get('RELAY_SECRET');

    console.log(`Testing relay at: ${relayUrl}`);

    const res = await fetch(relayUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-relay-secret': relaySecret,
      },
      body: JSON.stringify({ sql: 'SELECT 1 AS ping' }),
    });

    const text = await res.text();
    console.log(`Relay status: ${res.status}, body: ${text.substring(0, 500)}`);

    return Response.json({ status: res.status, body: text.substring(0, 500) });
  } catch (error) {
    console.error('Relay test failed:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});