import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const LOOKUP_ENTITIES = [
  { entity: 'GHSHazardCode', endpoint: 'getGHSCodes', pageSize: 1000, keyField: 'code' },
  { entity: 'GHSPictogram', endpoint: 'getGHSPictograms', pageSize: 1000, keyField: 'description' },
  { entity: 'GHSPrecautionaryStatement', endpoint: 'getGHSPrecautionaryStatements', pageSize: 1000, keyField: 'code' },
  { entity: 'PPEReference', endpoint: 'getPPEReferences', pageSize: 500, keyField: 'ppe_name' },
  { entity: 'NFPAGuide', endpoint: 'getNFPAGuides', pageSize: 1000, keyField: 'rule' },
  { entity: 'GlossaryTerm', endpoint: 'getGlossaryTerms', pageSize: 1000, keyField: 'term' },
];

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

async function getCheckpoint(sr, key) {
  try {
    const logs = await sr.entities.SyncLog.filter(
      { operation: 'sync_checkpoint', endpoint_or_step: key, status: 'success' },
      '-created_date', 1
    );
    const arr = Array.isArray(logs) ? logs : (logs?.data || []);
    return arr.length > 0 ? new Date(arr[0].created_at) : null;
  } catch {
    return null;
  }
}

async function setCheckpoint(sr, key) {
  try {
    await sr.entities.SyncLog.create({
      operation: 'sync_checkpoint',
      endpoint_or_step: key,
      status: 'success',
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    // Silent fail
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const { force } = await req.json();
    const relayUrl = Deno.env.get('RELAY_URL');
    const relaySecret = Deno.env.get('RELAY_SECRET');
    const sr = base44.asServiceRole;

    const results = {};

    for (const config of LOOKUP_ENTITIES) {
      const checkpointKey = `lookup:${config.entity}`;
      const checkpoint = force ? null : await getCheckpoint(sr, checkpointKey);
      let updated = 0;
      let offset = 0;
      let done = false;

      while (!done) {
        const rows = await relayCall(relayUrl, relaySecret, config.endpoint, {
          page: Math.floor(offset / config.pageSize) + 1,
          pageSize: config.pageSize,
          sinceLastSync: checkpoint?.toISOString(),
        });

        if (rows.length === 0) {
          done = true;
          break;
        }

        for (const row of rows) {
          try {
            const keyValue = config.entity === 'GHSHazardCode' ? (row.GHS_Haz_Code || row.code || '')
              : config.entity === 'GHSPictogram' ? (row.label_description || row.GHS_Label_Desc || row.description || '')
              : config.entity === 'GHSPrecautionaryStatement' ? (row.GHS_Precautionary_Statement_Code || row.code || '')
              : config.entity === 'PPEReference' ? (row.PPE_Description || row.ppe_name || '')
              : config.entity === 'NFPAGuide' ? (row.nfpa_rule || row.Rule || row.rule || '')
              : config.entity === 'GlossaryTerm' ? (row.Term || row.term || '') : '';

            if (!keyValue) continue;

            const filter = { [config.keyField]: keyValue };
            const existing = await sr.entities[config.entity].filter(filter, null, 1);
            const arr = Array.isArray(existing) ? existing : (existing?.data || []);

            const data = config.entity === 'GHSHazardCode' ? {
              code: keyValue,
              statement: row.Comb_Code_Statement || row.GHS_Haz_Statement || '',
              pictogram_img: row.GHS_Haz_Pictogram_IMG || '',
              type: 'H-Statement',
              hazard_class: row.GHS_Haz_Class || '',
              hazard_category: row.GHS_Haz_Cat || '',
              signal_word: row.GHS_Signal_Word || '',
            }
              : config.entity === 'GHSPictogram' ? {
                description: keyValue,
                hint_text: row.Hint_Text || '',
                pictogram_img: row.GHS_Label_IMG || '',
              }
              : config.entity === 'GHSPrecautionaryStatement' ? {
                code: keyValue,
                description: row.GHS_Precautionary_Comb_Text || '',
              }
              : config.entity === 'PPEReference' ? {
                ppe_name: keyValue,
                image_url: row.PPE_Pictogram_IMG || '',
              }
              : config.entity === 'NFPAGuide' ? {
                class: row.class || row.Class || '',
                level: row.level || row.Level || '',
                rule: keyValue,
              }
              : config.entity === 'GlossaryTerm' ? {
                category: row.Category || '',
                term: keyValue,
                abbreviation: row.Abbreviation || '',
                definition: row.Definition || '',
                tenant_id: '',
              } : {};

            if (arr.length > 0) {
              await sr.entities[config.entity].update(arr[0].id, data);
            } else {
              await sr.entities[config.entity].create(data);
            }
            updated++;
          } catch (e) {
            console.error(`[${config.entity}]`, e.message);
          }
        }

        if (rows.length < config.pageSize) {
          done = true;
        }
        offset += config.pageSize;
        await new Promise(r => setTimeout(r, 100));
      }

      await setCheckpoint(sr, checkpointKey);
      results[config.entity] = updated;
    }

    return Response.json({ success: true, results });

  } catch (error) {
    console.error('[syncLookupTables]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});