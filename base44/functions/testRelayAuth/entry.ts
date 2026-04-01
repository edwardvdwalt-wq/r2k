import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const relayUrl = Deno.env.get('RELAY_URL');
    const relaySecret = Deno.env.get('RELAY_SECRET');

    if (!relayUrl) return Response.json({ error: 'RELAY_URL not configured' }, { status: 400 });
    if (!relaySecret) return Response.json({ error: 'RELAY_SECRET not configured' }, { status: 400 });

    console.log(`[testRelayAuth] Testing relay at: ${relayUrl}`);
    console.log(`[testRelayAuth] Secret length: ${relaySecret.length} chars`);

    // Test basic connectivity
    const res = await fetch(relayUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Relay-Secret': relaySecret,
      },
      body: JSON.stringify({
        endpoint: 'getHazmatList',
        site_parent: 'TEST_PROBE',
        page: 1,
        pageSize: 10,
        sinceLastSync: null,
      }),
    });

    const text = await res.text();

    return Response.json({
      relay_url: relayUrl,
      status: res.status,
      status_text: res.statusText,
      headers: {
        'content-type': res.headers.get('content-type'),
      },
      response_preview: text.substring(0, 500),
      full_response: text,
      auth_header_sent: 'X-Relay-Secret: ***',
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});