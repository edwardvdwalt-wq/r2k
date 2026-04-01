/**
 * syncLookupTablesDirectDb — DEPRECATED
 *
 * This function previously ran lookup table sync steps individually
 * (GHS codes, pictograms, precautionary statements, PPE, NFPA, glossary).
 *
 * Lookup sync is now owned entirely by `orchestrateTenantSync` via the
 * internal `runAllLookups()` function, which runs after the tenant pipeline
 * completes as part of the same backend-owned execution.
 *
 * This file is intentionally retired. Any call to this endpoint will receive
 * a 410 Gone response.
 *
 * Do not add new step logic here.
 * Do not call this from the frontend.
 * This file may be deleted once confirmed no external callers remain.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { step } = body;

    console.warn(`[syncLookupTablesDirectDb] DEPRECATED: received call for step="${step}". Lookup sync is now owned by orchestrateTenantSync.`);

    return Response.json({
      error: 'DEPRECATED: syncLookupTablesDirectDb is retired. Lookup sync runs automatically as part of orchestrateTenantSync.',
      migration: 'POST orchestrateTenantSync with { site_parent, force }',
      step_received: step || null,
    }, { status: 410 });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});