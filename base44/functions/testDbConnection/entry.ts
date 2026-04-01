import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const dbHost = Deno.env.get('DB_HOST');
    const dbPort = Deno.env.get('DB_PORT');
    const dbUser = Deno.env.get('DB_USER');
    const dbPassword = Deno.env.get('DB_PASSWORD');
    const dbName = Deno.env.get('DB_NAME');
    const dbSsl = Deno.env.get('DB_SSL');

    console.log('[testDb] Config loaded:');
    console.log(`  HOST: ${dbHost}`);
    console.log(`  PORT: ${dbPort}`);
    console.log(`  USER: ${dbUser}`);
    console.log(`  NAME: ${dbName}`);
    console.log(`  SSL: ${dbSsl}`);
    console.log(`  PASSWORD length: ${dbPassword?.length || 0}`);

    // Try direct TCP connection first
    console.log('[testDb] Attempting TCP connection...');
    const conn = await Deno.connect({
      hostname: dbHost,
      port: parseInt(dbPort || '1433'),
      transport: 'tcp',
    });
    console.log('[testDb] TCP connection successful!');
    conn.close();

    return Response.json({
      success: true,
      message: 'TCP connection to database server successful',
      config: {
        host: dbHost,
        port: dbPort,
        user: dbUser,
        database: dbName,
        passwordLength: dbPassword?.length || 0,
        ssl: dbSsl,
      },
    });
  } catch (error) {
    console.log(`[testDb] Error: ${error.message}`);
    return Response.json({
      success: false,
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
});