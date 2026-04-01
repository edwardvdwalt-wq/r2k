/**
 * submitFastTrack — stores the Fast Track request and sends notification emails.
 *
 * Recipients:
 *   - hazmat_support@r2knexus.co.za (fixed)
 *   - Site Admin(s) for the submitting tenant
 *   - Submitting user
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const {
      tenant_id, site_id, site_name,
      supplier_name, supplier_contact_number, substance_name,
      substance_photo_1_url, substance_photo_2_url, vehicle_license_photo_url,
      notes,
    } = body;

    if (!supplier_name || !supplier_contact_number || !substance_name ||
        !substance_photo_1_url || !substance_photo_2_url || !vehicle_license_photo_url) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Save the request
    const request = await base44.entities.FastTrackRequest.create({
      tenant_id: tenant_id || user.tenant_id,
      site_id,
      site_name,
      submitted_by_user_id: user.id,
      submitted_by_email: user.email,
      submitted_by_name: user.full_name,
      supplier_name,
      supplier_contact_number,
      substance_name,
      substance_photo_1_url,
      substance_photo_2_url,
      vehicle_license_photo_url,
      status: 'Submitted',
      notes: notes || '',
    });

    // Find Site Admin users for this tenant to notify
    let adminEmails = [];
    try {
      const tenantUsers = await base44.asServiceRole.entities.TenantUser.filter({
        tenant_id: tenant_id || user.tenant_id,
        is_active: true,
      });
      adminEmails = tenantUsers
        .filter(u => ['site_admin', 'super_admin'].includes(u.tenant_role))
        .map(u => u.user_email)
        .filter(Boolean);
    } catch (_) {}

    const photoSection = `
<ul>
  <li><a href="${substance_photo_1_url}">Substance Photo 1</a></li>
  <li><a href="${substance_photo_2_url}">Substance Photo 2</a></li>
  <li><a href="${vehicle_license_photo_url}">Vehicle License Photo</a></li>
</ul>`;

    const emailBody = `
<h2>Fast Track Substance Request</h2>
<p><strong>Submitted by:</strong> ${user.full_name} (${user.email})</p>
<p><strong>Site:</strong> ${site_name || 'N/A'}</p>
<p><strong>Tenant:</strong> ${tenant_id || user.tenant_id}</p>
<hr/>
<p><strong>Substance Name:</strong> ${substance_name}</p>
<p><strong>Supplier Name:</strong> ${supplier_name}</p>
<p><strong>Supplier Contact:</strong> ${supplier_contact_number}</p>
${notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ''}
<h3>Photos</h3>
${photoSection}
<hr/>
<p>This is a Fast Track request only. It has NOT been added to the live register. A Site Admin or App Super Admin must review and convert this request if appropriate.</p>
<p><em>Request ID: ${request.id}</em></p>
`;

    const subject = `[Fast Track] ${substance_name} — ${site_name || tenant_id}`;
    const recipients = [
      'hazmat_support@r2knexus.co.za',
      user.email,
      ...adminEmails,
    ].filter((v, i, a) => v && a.indexOf(v) === i); // unique

    await Promise.allSettled(
      recipients.map(to =>
        base44.integrations.Core.SendEmail({ to, subject, body: emailBody })
      )
    );

    return Response.json({ success: true, request_id: request.id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});