import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const NON_CORE_SECTIONS = [1, 2, 3, 8, 9, 10, 11, 12, 13, 14, 15, 16];

async function relayCall(url, secret, endpoint, params, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Relay-Secret': secret },
        body: JSON.stringify({ endpoint, ...params }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return (await res.json()).recordset || [];
    } catch (err) {
      if (attempt < retries) {
        const wait = Math.pow(2, attempt - 1) * 1000 + Math.random() * 300;
        await new Promise(r => setTimeout(r, wait));
      } else {
        throw err;
      }
    }
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { file_sha256, tenant_id } = await req.json();
    if (!file_sha256 || !tenant_id) {
      return Response.json({ error: 'file_sha256 and tenant_id required' }, { status: 400 });
    }

    const relayUrl = Deno.env.get('RELAY_URL');
    const relaySecret = Deno.env.get('RELAY_SECRET');
    const sr = base44.asServiceRole;

    // Check what sections already exist locally (core sections 4-7)
    const existing = await sr.entities.SDSSection.filter({
      file_sha256,
      tenant_id,
    }, null, 100);
    const existingArr = Array.isArray(existing) ? existing : (existing?.data || []);
    const cachedSections = new Set(existingArr.map(s => s.section_number));

    // Fetch non-core sections from relay
    const sdsRows = await relayCall(relayUrl, relaySecret, 'getSDSSections', {
      file_sha256_list: [file_sha256],
      section_numbers: NON_CORE_SECTIONS,
    });

    let upserted = 0;
    for (const row of sdsRows) {
      if (!row.section_number) continue;

      const data = {
        tenant_id,
        file_sha256: file_sha256,
        section_number: row.section_number,
        text: row.text || '',
        abstained: row.abstained || false,
        reason: row.reason || '',
        is_core: false, // Non-core sections fetched on-demand
      };

      // Upsert: update if exists, create if not
      const filter = { file_sha256, section_number: row.section_number, tenant_id };
      const existing = await sr.entities.SDSSection.filter(filter, null, 1);
      const arr = Array.isArray(existing) ? existing : (existing?.data || []);

      if (arr.length > 0) {
        await sr.entities.SDSSection.update(arr[0].id, data);
      } else {
        await sr.entities.SDSSection.create(data);
      }
      upserted++;
    }

    // Merge core (from cache) + non-core (from relay) for response
    const allSections = [
      ...existingArr.filter(s => [4, 5, 6, 7].includes(s.section_number)),
      ...sdsRows,
    ];

    return Response.json({
      success: true,
      file_sha256,
      sections_fetched: upserted,
      total_sections: allSections.length,
      data: allSections,
    });

  } catch (error) {
    console.error('[fetchSDSOnDemand]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});