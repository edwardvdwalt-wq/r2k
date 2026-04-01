// Persistent SQL relay with connection pooling and parameterized queries
// Deno-based MSSQL connection pool manager

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import Connection from 'npm:tedious@18.0.0/lib/connection.js';
import Request from 'npm:tedious@18.0.0/lib/request.js';
import { TYPES } from 'npm:tedious@18.0.0/lib/data-type.js';

// Global connection pool state
let poolPromise = null;
let isInitializing = false;
let connection = null;

// Initialize MSSQL connection pool with tedious driver
const initPool = async () => {
  if (poolPromise) return poolPromise;
  if (isInitializing) {
    return new Promise((resolve) => {
      const checkPool = () => {
        if (poolPromise) resolve(poolPromise);
        else setTimeout(checkPool, 100);
      };
      checkPool();
    });
  }

  isInitializing = true;
  
  return new Promise((resolve, reject) => {
    try {
      const config = {
        server: Deno.env.get("DB_HOST"),
        authentication: {
          type: "default",
          options: {
            userName: Deno.env.get("DB_USER"),
            password: Deno.env.get("DB_PASSWORD"),
          },
        },
        options: {
          database: Deno.env.get("DB_NAME"),
          port: parseInt(Deno.env.get("DB_PORT") || "1433"),
          encrypt: Deno.env.get("DB_SSL") === "true",
          connectTimeout: 15000,
          requestTimeout: 30000,
          rowCollectionOnDone: true,
          rowCollectionOnRequestCompletion: true,
        },
      };

      console.log("[Pool] Initializing MSSQL connection pool");
      connection = new Connection(config);

      connection.on("connect", (err) => {
        if (err) {
          console.error("[Pool] Connection failed:", err.message);
          isInitializing = false;
          reject(err);
        } else {
          console.log("[Pool] Connected to MSSQL");
          poolPromise = Promise.resolve(connection);
          isInitializing = false;
          resolve(connection);
        }
      });

      connection.on("error", (err) => {
        console.error("[Pool] Connection error:", err.message);
      });

      connection.connect();
    } catch (err) {
      poolPromise = null;
      isInitializing = false;
      reject(err);
    }
  });
};

// Main relay handler - exposed as an endpoint
serve(async (req) => {
  const startTime = Date.now();
  let endpoint = 'unknown';

  try {
    // Auth check
    const secret = req.headers.get("x-relay-secret");
    if (secret !== Deno.env.get("RELAY_SECRET")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { method } = new URL(req.url);

    // Only POST allowed
    if (method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    const params = await req.json();
    endpoint = params?.endpoint || 'unknown';

    if (!endpoint) {
      return new Response(
        JSON.stringify({ error: "Missing endpoint in request body" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    let result;

    // Route to appropriate parameterized query handler based on body endpoint
    switch (endpoint) {
      case "ping":
        result = { ok: true, message: "Relay is operational" };
        break;
      case "getHazmatList":
        result = await handleGetHazmatList(params);
        break;
      case "getProductMaster":
        result = await handleGetProductMaster(params);
        break;
      case "getComposition":
        result = await handleGetComposition(params);
        break;
      case "getHazards":
        result = await handleGetHazards(params);
        break;
      case "getSDSSections":
        result = await handleGetSDSSections(params);
        break;
      case "getGHSCodes":
        result = await handleGetGHSCodes(params);
        break;
      case "getNFPAGuides":
        result = await handleGetNFPAGuides(params);
        break;
      case "getPPEReferences":
        result = await handleGetPPEReferences(params);
        break;
      case "getGlossaryTerms":
        result = await handleGetGlossaryTerms(params);
        break;
      case "getSiteData":
        result = await handleGetSiteData(params);
        break;
      case "getSupplierData":
        result = await handleGetSupplierData(params);
        break;
      case "getDocumentManifest":
        result = await handleGetDocumentManifest(params);
        break;
      default:
        return new Response(
          JSON.stringify({ error: "Unknown endpoint: " + endpoint }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
    }

    const duration = Date.now() - startTime;
    const rowCount = result?.recordset?.length || 0;
    const logEntry = {
      timestamp: new Date().toISOString(),
      operation: 'relay_endpoint',
      endpoint: endpoint,
      status: 'success',
      duration_ms: duration,
      row_count: rowCount,
    };
    console.log(JSON.stringify(logEntry));
    
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const duration = Date.now() - startTime;
    const logEntry = {
      timestamp: new Date().toISOString(),
      operation: 'relay_endpoint',
      endpoint: endpoint || 'unknown',
      status: 'error',
      duration_ms: duration,
      error_message: err.message,
    };
    console.log(JSON.stringify(logEntry));
    return new Response(
      JSON.stringify({
        error: err.message,
        detail: err.stack,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});

// ==================== Query Handlers (Parameterized) ====================

const handleGetHazmatList = async (params) => {
  const { site_parent, page = 1, pageSize = 100, riskFilter, top25Only, sinceLastSync } =
    params;
  if (!site_parent) throw new Error("site_parent required");

  const offset = (page - 1) * pageSize;
  let whereClause = "WHERE Site_Parent = @siteParent";
  const queryParams = { siteParent: site_parent, offset, pageSize };

  if (sinceLastSync) {
    // Incremental sync: return rows updated since last sync, OR deleted tombstones
    whereClause += " AND (last_updated_at > @sinceLastSync OR is_deleted = 1 OR record_status = 'Deleted')";
    queryParams.sinceLastSync = new Date(sinceLastSync);
  } else {
    // Full sync: return only active rows (exclude deleted)
    whereClause += " AND record_status != 'Deleted' AND is_deleted = 0";
  }

  if (riskFilter && riskFilter.length > 0) {
    const placeholders = riskFilter
      .map((_, i) => `@risk${i}`)
      .join(", ");
    riskFilter.forEach((risk, i) => {
      queryParams[`risk${i}`] = risk;
    });
    whereClause += ` AND Risk_Rating_Desc IN (${placeholders})`;
  }

  if (top25Only) {
    whereClause += " AND Top_25_List = 'Yes'";
  }

  const sql = `
    SELECT Site_Chem_Id, file_sha256, product_name, supplier_name, 
           Risk_Rating, Risk_Rating_Desc, Site, Likelihood, ERP_Number,
           Responsible_Department, Onsite_Contractor, Top_25_List, record_status, is_deleted, last_updated_at
    FROM R2K_Site_Hazmat_Registry
    ${whereClause}
    ORDER BY last_updated_at DESC, Risk_Rating DESC, product_name ASC
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
  `;

  return { recordset: await executeSql(sql, queryParams), page, pageSize };
};

const handleGetProductMaster = async (params) => {
  const { site_parent, page = 1, pageSize = 500, sinceLastSync } = params;
  if (!site_parent) throw new Error("site_parent required");

  const offset = (page - 1) * pageSize;
  const queryParams = { siteParent: site_parent, offset, pageSize };
  
  let whereClause = "WHERE Site_Parent = @siteParent AND is_current = 1";
  if (sinceLastSync) {
    // Incremental sync: return updated active rows OR deleted tombstones
    whereClause = "WHERE Site_Parent = @siteParent AND (last_updated_at > @sinceLastSync OR is_deleted = 1 OR record_status = 'Deleted')";
    queryParams.sinceLastSync = new Date(sinceLastSync);
  }

  const sql = `
    SELECT file_sha256, product_name, supplier_name, supplier_key, product_key,
           sds_date, is_current, version, valid_from, valid_to,
           pdf_url, pictogram_url, NFPA_H, NFPA_F, NFPA_R,
           signal_word, emergency_phone, supplier_phone, supplier_email,
           default_risk_rating, un_number, cas_number, product_code,
           last_updated_at, is_deleted, record_status
    FROM ProductMaster
    ${whereClause}
    ORDER BY product_name ASC, file_sha256 ASC
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
  `;

  return {
    recordset: await executeSql(sql, queryParams),
    page,
    pageSize,
  };
};

const handleGetComposition = async (params) => {
  const { file_sha256_list, page = 1, pageSize = 1000, sinceLastSync } = params;
  if (!file_sha256_list || file_sha256_list.length === 0)
    throw new Error("file_sha256_list required");

  const offset = (page - 1) * pageSize;
  const placeholders = file_sha256_list.map((_, i) => `@sha${i}`).join(", ");
  const queryParams = { offset, pageSize };
  file_sha256_list.forEach((sha, i) => {
    queryParams[`sha${i}`] = sha;
  });

  let whereClause = `WHERE file_sha256 IN (${placeholders})`;
  if (sinceLastSync) {
    // Incremental sync: return updated active rows OR deleted tombstones
    whereClause += " AND (last_updated_at > @sinceLastSync OR is_deleted = 1 OR record_status = 'Deleted')";
    queryParams.sinceLastSync = new Date(sinceLastSync);
  } else {
    // Full sync: return only active rows
    whereClause += " AND is_deleted = 0 AND record_status != 'Deleted'";
  }

  const sql = `
    SELECT file_sha256, chemical_name, cas_number, ec_number,
           conc_value, conc_min, conc_max, conc_unit,
           hazard_classes, hazard_categories, hazard_statements, record_status, is_deleted, last_updated_at
    FROM Composition
    ${whereClause}
    ORDER BY last_updated_at ASC, file_sha256, chemical_name
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
  `;

  return {
    recordset: await executeSql(sql, queryParams),
    page,
    pageSize,
  };
};

const handleGetHazards = async (params) => {
  const { file_sha256_list, page = 1, pageSize = 1000, sinceLastSync } = params;
  if (!file_sha256_list || file_sha256_list.length === 0)
    throw new Error("file_sha256_list required");

  const offset = (page - 1) * pageSize;
  const placeholders = file_sha256_list.map((_, i) => `@sha${i}`).join(", ");
  const queryParams = { offset, pageSize };
  file_sha256_list.forEach((sha, i) => {
    queryParams[`sha${i}`] = sha;
  });

  let whereClause = `WHERE file_sha256 IN (${placeholders})`;
  if (sinceLastSync) {
    // Incremental sync: return updated active rows OR deleted tombstones
    whereClause += " AND (last_updated_at > @sinceLastSync OR is_deleted = 1 OR record_status = 'Deleted')";
    queryParams.sinceLastSync = new Date(sinceLastSync);
  } else {
    // Full sync: return only active rows
    whereClause += " AND is_deleted = 0 AND record_status != 'Deleted'";
  }

  const sql = `
    SELECT file_sha256, signal_word, statement_type, pictogram_url,
           code, label_code, statements, record_status, is_deleted, last_updated_at
    FROM Hazards
    ${whereClause}
    ORDER BY last_updated_at ASC, file_sha256, code
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
  `;

  return {
    recordset: await executeSql(sql, queryParams),
    page,
    pageSize,
  };
};

const handleGetSDSSections = async (params) => {
  const { file_sha256_list, page = 1, pageSize = 500, sinceLastSync } = params;
  if (!file_sha256_list || file_sha256_list.length === 0)
    throw new Error("file_sha256_list required");

  const offset = (page - 1) * pageSize;
  const placeholders = file_sha256_list.map((_, i) => `@sha${i}`).join(", ");
  const queryParams = { offset, pageSize };
  file_sha256_list.forEach((sha, i) => {
    queryParams[`sha${i}`] = sha;
  });

  let whereClause = `WHERE file_sha256 IN (${placeholders})`;
  if (sinceLastSync) {
    // Incremental sync: return updated active rows OR deleted tombstones
    whereClause += " AND (last_updated_at > @sinceLastSync OR is_deleted = 1 OR record_status = 'Deleted')";
    queryParams.sinceLastSync = new Date(sinceLastSync);
  } else {
    // Full sync: return only active rows
    whereClause += " AND is_deleted = 0 AND record_status != 'Deleted'";
  }

  const sql = `
    SELECT file_sha256, section_number, text, abstained, reason, record_status, is_deleted, last_updated_at
    FROM TextBySection
    ${whereClause}
    ORDER BY last_updated_at ASC, file_sha256, section_number
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
  `;

  return {
    recordset: await executeSql(sql, queryParams),
    page,
    pageSize,
  };
};

const handleGetGHSCodes = async (params) => {
  const { page = 1, pageSize = 5000, sinceLastSync } = params;
  const offset = (page - 1) * pageSize;
  const queryParams = { offset, pageSize };

  let whereClause;
  if (sinceLastSync) {
    // Incremental sync: return updated rows OR deleted tombstones
    whereClause = "WHERE _lastupdated > @sinceLastSync OR _deleted = 1 OR record_status = 'Deleted'";
    queryParams.sinceLastSync = new Date(sinceLastSync);
  } else {
    // Full sync: return only active rows (exclude deleted)
    whereClause = "WHERE _deleted = 0 AND record_status != 'Deleted'";
  }

  const sql = `
    SELECT code, statement, pictogram_img, type,
           hazard_class, hazard_category, signal_word, _lastupdated, _deleted, record_status
    FROM GHS_Codes
    ${whereClause}
    ORDER BY _lastupdated ASC, code
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
  `;

  return {
    recordset: await executeSql(sql, queryParams),
    page,
    pageSize,
  };
};

const handleGetNFPAGuides = async (params) => {
  const { page = 1, pageSize = 1000, sinceLastSync } = params;
  const offset = (page - 1) * pageSize;
  const queryParams = { offset, pageSize };

  let whereClause;
  if (sinceLastSync) {
    // Incremental sync: return updated rows OR deleted tombstones
    whereClause = "WHERE _lastupdated > @sinceLastSync OR _deleted = 1 OR record_status = 'Deleted'";
    queryParams.sinceLastSync = new Date(sinceLastSync);
  } else {
    // Full sync: return only active rows (exclude deleted)
    whereClause = "WHERE _deleted = 0 AND record_status != 'Deleted'";
  }

  const sql = `
    SELECT class, level, rule, _lastupdated, _deleted, record_status
    FROM NFPA_Guide
    ${whereClause}
    ORDER BY _lastupdated ASC, class, level
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
  `;

  return {
    recordset: await executeSql(sql, queryParams),
    page,
    pageSize,
  };
};

const handleGetPPEReferences = async (params) => {
  const { page = 1, pageSize = 500, sinceLastSync } = params;
  const offset = (page - 1) * pageSize;
  const queryParams = { offset, pageSize };

  let whereClause;
  if (sinceLastSync) {
    // Incremental sync: return updated rows OR deleted tombstones
    whereClause = "WHERE _lastupdated > @sinceLastSync OR _deleted = 1 OR record_status = 'Deleted'";
    queryParams.sinceLastSync = new Date(sinceLastSync);
  } else {
    // Full sync: return only active rows (exclude deleted)
    whereClause = "WHERE _deleted = 0 AND record_status != 'Deleted'";
  }

  const sql = `
    SELECT ppe_name, image_url, _lastupdated, _deleted, record_status
    FROM PPE_Reference
    ${whereClause}
    ORDER BY _lastupdated ASC, ppe_name
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
  `;

  return {
    recordset: await executeSql(sql, queryParams),
    page,
    pageSize,
  };
};

const handleGetGlossaryTerms = async (params) => {
  const { page = 1, pageSize = 300, sinceLastSync } = params;
  const offset = (page - 1) * pageSize;
  const queryParams = { offset, pageSize };

  let whereClause;
  if (sinceLastSync) {
    // Incremental sync: return updated rows OR deleted tombstones
    whereClause = "WHERE _lastupdated > @sinceLastSync OR _deleted = 1 OR record_status = 'Deleted'";
    queryParams.sinceLastSync = new Date(sinceLastSync);
  } else {
    // Full sync: return only active rows (exclude deleted)
    whereClause = "WHERE _deleted = 0 AND record_status != 'Deleted'";
  }

  const sql = `
    SELECT category, term, abbreviation, definition, _lastupdated, _deleted, record_status
    FROM Glossary_Terms
    ${whereClause}
    ORDER BY _lastupdated ASC, category, term
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
  `;

  return {
    recordset: await executeSql(sql, queryParams),
    page,
    pageSize,
  };
};

const handleGetSiteData = async (params) => {
  // STUB: Not yet implemented. Return empty recordset to allow orchestrator to continue.
  const { page = 1, pageSize = 500 } = params;
  console.log('[Stub] getSiteData returning empty recordset');
  return { recordset: [], page, pageSize };
};

const handleGetSupplierData = async (params) => {
  // STUB: Not yet implemented. Return empty recordset to allow orchestrator to continue.
  const { page = 1, pageSize = 500 } = params;
  console.log('[Stub] getSupplierData returning empty recordset');
  return { recordset: [], page, pageSize };
};

const handleGetDocumentManifest = async (params) => {
  // STUB: Not yet implemented. Return empty recordset to allow orchestrator to continue.
  const { page = 1, pageSize = 300 } = params;
  console.log('[Stub] getDocumentManifest returning empty recordset');
  return { recordset: [], page, pageSize };
};

// ==================== SQL Executor (parameterized with tedious) ====================

const executeSql = async (sql, params) => {
  try {
    const pool = await initPool();
    
    return new Promise((resolve, reject) => {
      const request = new Request(sql, (err, rowCount, rows) => {
        if (err) {
          console.error("[SQL] Query error:", err.message);
          reject(err);
        } else {
          console.log(`[SQL] Query executed: ${rowCount} rows`);
          // Transform tedious driver rows to plain objects
          const transformed = (rows || []).map(row => {
            const out = {};
            for (const col of row) {
              out[col.metadata.colName] = col.value;
            }
            return out;
          });
          resolve(transformed);
        }
      });

      // Bind parameters
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          let sqlType = TYPES.NVarChar;
          
          // Type detection
          if (typeof value === 'number') {
            sqlType = Number.isInteger(value) ? TYPES.Int : TYPES.Float;
          } else if (value instanceof Date) {
            sqlType = TYPES.DateTime2;
          } else if (typeof value === 'boolean') {
            sqlType = TYPES.Bit;
          }
          
          request.addParameter(key, sqlType, value);
        });
      }

      pool.execSql(request);
    });
  } catch (err) {
    console.error("[SQL] Execution failed:", err.message);
    throw new Error(`SQL execution failed: ${err.message}`);
  }
};

// Export pool getter for other functions
export { initPool };