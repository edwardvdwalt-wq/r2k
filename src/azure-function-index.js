const sql = require('mssql');

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '1433'),
  database: process.env.DB_NAME,
  options: {
    encrypt: process.env.DB_SSL !== 'false',
    trustServerCertificate: false,
  },
};

async function executeSql(query, params) {
  let pool;
  try {
    pool = await sql.connect(config);
    const request = pool.request();
    
    // Add parameterized inputs
    for (const [key, value] of Object.entries(params)) {
      request.input(key, value);
    }
    
    const result = await request.query(query);
    return result.recordset || [];
  } finally {
    if (pool) await pool.close();
  }
}

const handlers = {
  getHazmatList: async (params) => {
    const { site_parent, page = 1, pageSize = 2000, sinceLastSync } = params;
    const offset = (page - 1) * pageSize;

    let whereClause = "WHERE Site_Parent = @site_parent AND record_status != 'Deleted'";
    if (sinceLastSync) {
      whereClause += " AND updated_date > @sinceLastSync";
    }

    const query = `
      SELECT * FROM R2K_Site_Hazmat_Registry
      ${whereClause}
      ORDER BY updated_date ASC
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `;

    return {
      recordset: await executeSql(query, {
        site_parent,
        sinceLastSync: sinceLastSync ? new Date(sinceLastSync) : null,
        offset,
        pageSize,
      }),
      page,
      pageSize,
    };
  },

  getComposition: async (params) => {
    const { file_sha256_list = [], page = 1, pageSize = 500, sinceLastSync } = params;
    const offset = (page - 1) * pageSize;

    let whereClause = "WHERE file_sha256 IN (@sha256List)";
    if (sinceLastSync) {
      whereClause += " AND updated_date > @sinceLastSync";
    }

    const query = `
      SELECT * FROM Product_Composition
      ${whereClause}
      ORDER BY updated_date ASC
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `;

    return {
      recordset: await executeSql(query, {
        sha256List: file_sha256_list.length > 0 ? file_sha256_list.join("','") : '',
        sinceLastSync: sinceLastSync ? new Date(sinceLastSync) : null,
        offset,
        pageSize,
      }),
      page,
      pageSize,
    };
  },

  getHazards: async (params) => {
    const { file_sha256_list = [], page = 1, pageSize = 200, sinceLastSync } = params;
    const offset = (page - 1) * pageSize;

    let whereClause = "WHERE file_sha256 IN (@sha256List)";
    if (sinceLastSync) {
      whereClause += " AND updated_date > @sinceLastSync";
    }

    const query = `
      SELECT * FROM Product_Hazards
      ${whereClause}
      ORDER BY updated_date ASC
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `;

    return {
      recordset: await executeSql(query, {
        sha256List: file_sha256_list.length > 0 ? file_sha256_list.join("','") : '',
        sinceLastSync: sinceLastSync ? new Date(sinceLastSync) : null,
        offset,
        pageSize,
      }),
      page,
      pageSize,
    };
  },

  getSDSSections: async (params) => {
    const { file_sha256_list = [], page = 1, pageSize = 100, sinceLastSync } = params;
    const offset = (page - 1) * pageSize;

    let whereClause = "WHERE file_sha256 IN (@sha256List)";
    if (sinceLastSync) {
      whereClause += " AND updated_date > @sinceLastSync";
    }

    const query = `
      SELECT * FROM SDS_Text_By_Section
      ${whereClause}
      ORDER BY updated_date ASC
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `;

    return {
      recordset: await executeSql(query, {
        sha256List: file_sha256_list.length > 0 ? file_sha256_list.join("','") : '',
        sinceLastSync: sinceLastSync ? new Date(sinceLastSync) : null,
        offset,
        pageSize,
      }),
      page,
      pageSize,
    };
  },

  getGHSCodes: async (params) => {
    const { page = 1, pageSize = 5000, sinceLastSync } = params;
    const offset = (page - 1) * pageSize;

    let whereClause = "WHERE 1=1";
    if (sinceLastSync) {
      whereClause += " AND updated_date > @sinceLastSync";
    }

    const query = `
      SELECT GHS_Haz_Code as code, Comb_Code_Statement as statement, 
             GHS_Haz_Pictogram_IMG as pictogram_img, 'H-Statement' as type,
             GHS_Haz_Class as hazard_class, GHS_Haz_Cat as hazard_category, 
             GHS_Signal_Word as signal_word
      FROM GHS_Hazard_Codes
      ${whereClause}
      ORDER BY updated_date ASC
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `;

    return {
      recordset: await executeSql(query, {
        sinceLastSync: sinceLastSync ? new Date(sinceLastSync) : null,
        offset,
        pageSize,
      }),
      page,
      pageSize,
    };
  },

  getGHSPictograms: async (params) => {
    const { page = 1, pageSize = 100, sinceLastSync } = params;
    const offset = (page - 1) * pageSize;

    let whereClause = "WHERE 1=1";
    if (sinceLastSync) {
      whereClause += " AND updated_date > @sinceLastSync";
    }

    const query = `
      SELECT GHS_Label_Desc as description, Hint_Text as hint_text, 
             GHS_Label_IMG as pictogram_img
      FROM GHS_Labels
      ${whereClause}
      ORDER BY updated_date ASC
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `;

    return {
      recordset: await executeSql(query, {
        sinceLastSync: sinceLastSync ? new Date(sinceLastSync) : null,
        offset,
        pageSize,
      }),
      page,
      pageSize,
    };
  },

  getGHSPrecautionaryStatements: async (params) => {
    const { page = 1, pageSize = 200, sinceLastSync } = params;
    const offset = (page - 1) * pageSize;

    let whereClause = "WHERE 1=1";
    if (sinceLastSync) {
      whereClause += " AND updated_date > @sinceLastSync";
    }

    const query = `
      SELECT GHS_Precautionary_Statement_Code as code, 
             GHS_Precautionary_Comb_Text as description
      FROM GHS_Precautionary_Statements
      ${whereClause}
      ORDER BY updated_date ASC
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `;

    return {
      recordset: await executeSql(query, {
        sinceLastSync: sinceLastSync ? new Date(sinceLastSync) : null,
        offset,
        pageSize,
      }),
      page,
      pageSize,
    };
  },

  getPPEReferences: async (params) => {
    const { page = 1, pageSize = 500, sinceLastSync } = params;
    const offset = (page - 1) * pageSize;

    let whereClause = "WHERE 1=1";
    if (sinceLastSync) {
      whereClause += " AND updated_date > @sinceLastSync";
    }

    const query = `
      SELECT PPE_Description as ppe_name, PPE_Pictogram_IMG as image_url
      FROM PPE_Reference
      ${whereClause}
      ORDER BY updated_date ASC
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `;

    return {
      recordset: await executeSql(query, {
        sinceLastSync: sinceLastSync ? new Date(sinceLastSync) : null,
        offset,
        pageSize,
      }),
      page,
      pageSize,
    };
  },

  getNFPAGuides: async (params) => {
    const { page = 1, pageSize = 1000, sinceLastSync } = params;
    const offset = (page - 1) * pageSize;

    let whereClause = "WHERE 1=1";
    if (sinceLastSync) {
      whereClause += " AND updated_date > @sinceLastSync";
    }

    const query = `
      SELECT Class as class, Level as level, Rule as rule
      FROM NFPA_Guide
      ${whereClause}
      ORDER BY updated_date ASC
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `;

    return {
      recordset: await executeSql(query, {
        sinceLastSync: sinceLastSync ? new Date(sinceLastSync) : null,
        offset,
        pageSize,
      }),
      page,
      pageSize,
    };
  },

  getGlossaryTerms: async (params) => {
    const { page = 1, pageSize = 300, sinceLastSync } = params;
    const offset = (page - 1) * pageSize;

    let whereClause = "WHERE 1=1";
    if (sinceLastSync) {
      whereClause += " AND updated_date > @sinceLastSync";
    }

    const query = `
      SELECT Category as category, Term as term, Abbreviation as abbreviation, 
             Definition as definition
      FROM Glossary_Terms
      ${whereClause}
      ORDER BY updated_date ASC
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `;

    return {
      recordset: await executeSql(query, {
        sinceLastSync: sinceLastSync ? new Date(sinceLastSync) : null,
        offset,
        pageSize,
      }),
      page,
      pageSize,
    };
  },
};

module.exports = async function (context, req) {
  // Authenticate
  const secret = req.headers['x-relay-secret'];
  if (secret !== process.env.RELAY_SECRET) {
    context.res = { status: 401, body: 'Unauthorized' };
    return;
  }

  // Extract endpoint and params
  const pathname = req.url.split('?')[0];
  const endpoint = Object.keys(handlers).find(e => pathname.includes(`/${e}`));

  if (!endpoint) {
    context.res = { status: 404, body: { error: 'Unknown endpoint' } };
    return;
  }

  try {
    const params = req.body || {};
    const result = await handlers[endpoint](params);
    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: result,
    };
  } catch (err) {
    context.res = {
      status: 500,
      body: { error: err.message },
    };
  }
};