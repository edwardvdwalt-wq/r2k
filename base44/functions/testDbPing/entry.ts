import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import sql from 'npm:mssql@11.0.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const server = Deno.env.get('DB_HOST');
    const port = parseInt(Deno.env.get('DB_PORT') || '1433');
    const userName = Deno.env.get('DB_USER');
    const password = Deno.env.get('DB_PASSWORD');
    const database = Deno.env.get('DB_NAME');

    console.log(`Connecting to ${server}:${port}/${database}`);

    const pool = await sql.connect({
      server,
      port,
      user: userName,
      password,
      database,
      options: {
        encrypt: true,
        trustServerCertificate: false,
        connectTimeout: 30000,
        requestTimeout: 30000,
      },
    });

    console.log('Running SELECT 1...');
    const result = await pool.request().query('SELECT 1 AS ping');
    console.log('Ping result:', result.recordset);
    await pool.close();

    return Response.json({ success: true, ping: result.recordset });
  } catch (error) {
    console.error('DB ping failed:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});