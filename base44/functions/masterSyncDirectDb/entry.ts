/**
 * masterSyncDirectDb — DEPRECATED
 *
 * This function previously implemented the step-driven tenant sync pipeline.
 * All tenant sync orchestration has been moved to `orchestrateTenantSync`,
 * which owns the full pipeline backend-side.
 *
 * This file is intentionally retired. Any call to this endpoint will receive
 * a 410 Gone response directing callers to use orchestrateTenantSync instead.
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

    console.warn(`[masterSyncDirectDb] DEPRECATED: received call for step="${step}". Use orchestrateTenantSync instead.`);

    return Response.json({
      error: 'DEPRECATED: masterSyncDirectDb is retired. Use orchestrateTenantSync to run the full tenant pipeline backend-side.',
      migration: 'POST orchestrateTenantSync with { site_parent, force }',
      step_received: step || null,
    }, { status: 410 });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});