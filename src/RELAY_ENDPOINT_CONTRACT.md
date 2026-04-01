# Relay Endpoint Contract (Current)

**Last Updated:** 2026-03-31  
**Status:** Core endpoints implemented; metadata endpoints stubbed  
**Base URL:** `${RELAY_URL}`  
**Auth Header:** `X-Relay-Secret: ${RELAY_SECRET}`  
**Method:** POST (all endpoints)  
**Routing:** Body-based endpoint dispatch — send `{ "endpoint": "getHazmatList", ...params }`  
**Backend:** Core sync endpoints backed by tedious MSSQL driver; safe for controlled integration testing, not yet fully production-hardened.  
**NOTE:** getSiteData, getSupplierData, and getDocumentManifest are placeholder endpoints returning empty recordsets. See [Tenant-Scoped Endpoints](#tenant-scoped-endpoints).

---

## Table of Contents
1. [Lookup Endpoints (Global)](#lookup-endpoints-global)
2. [Tenant-Scoped Endpoints](#tenant-scoped-endpoints)
3. [Registry & Composition Endpoints](#registry--composition-endpoints)

---

## Lookup Endpoints (Global)

All lookup endpoints use `_lastupdated` for incremental sync and `_deleted` + `record_status` for delete handling.

---

## Tenant Identifier Mapping

**Canonical tenant request field:** `site_parent`

For backward compatibility, relay handlers may also accept `tenant_id`, but the app functions should standardize on `site_parent`.

Example:
- Request: `{ "site_parent": "Glencore_ECM" }`
- Database Query: `WHERE Site_Parent = 'Glencore_ECM'`

---

### 1. getGHSCodes

**Purpose:** Fetch GHS hazard statement codes (global reference data)

**Request:**
```json
{
  "page": 1,
  "pageSize": 5000,
  "sinceLastSync": "2026-03-29T14:30:00.000Z"  // ISO UTC, optional
}
```

**Response:**
```json
{
  "recordset": [
    {
      "code": "H302",
      "statement": "Harmful if swallowed",
      "pictogram_img": "https://...",
      "type": "H-Statement",
      "hazard_class": "Acute toxicity",
      "hazard_category": "4",
      "signal_word": "Warning"
    }
  ],
  "page": 1,
  "pageSize": 5000
}
```

**Sync Key:** `_lastupdated`  
**Pagination:** `OFFSET (page-1)*pageSize ROWS FETCH NEXT pageSize ROWS ONLY`  
**Incremental Filter:** `_lastupdated > '${sinceLastSync}'` (if provided)  
**Delete Handling:** `_deleted = 0 AND record_status != 'Deleted'` (soft-delete + status flag)  
**Order:** `_lastupdated ASC, code ASC`

---

### 2. getNFPAGuides

**Purpose:** Fetch NFPA fire/health/reactivity classification guides

**Request:**
```json
{
  "page": 1,
  "pageSize": 1000,
  "sinceLastSync": "2026-03-29T14:30:00.000Z"  // ISO UTC, optional
}
```

**Response:**
```json
{
  "recordset": [
    {
      "class": "HEALTH",
      "level": "3",
      "rule": "Serious or permanent injury possible"
    }
  ],
  "page": 1,
  "pageSize": 1000
}
```

**Sync Key:** `_lastupdated`  
**Pagination:** `OFFSET (page-1)*pageSize ROWS FETCH NEXT pageSize ROWS ONLY`  
**Incremental Filter:** `_lastupdated > '${sinceLastSync}'` (if provided)  
**Delete Handling:** `_deleted = 0 AND record_status != 'Deleted'` (soft-delete + status flag)  
**Order:** `_lastupdated ASC, class ASC, level ASC`

---

### 3. getPPEReferences

**Purpose:** Fetch PPE equipment reference library

**Request:**
```json
{
  "page": 1,
  "pageSize": 500,
  "sinceLastSync": "2026-03-29T14:30:00.000Z"  // ISO UTC, optional
}
```

**Response:**
```json
{
  "recordset": [
    {
      "ppe_name": "Safety Goggles",
      "image_url": "https://..."
    }
  ],
  "page": 1,
  "pageSize": 500
}
```

**Sync Key:** `_lastupdated`  
**Pagination:** `OFFSET (page-1)*pageSize ROWS FETCH NEXT pageSize ROWS ONLY`  
**Incremental Filter:** `_lastupdated > '${sinceLastSync}'` (if provided)  
**Delete Handling:** `_deleted = 0 AND record_status != 'Deleted'` (soft-delete + status flag)  
**Order:** `_lastupdated ASC, ppe_name ASC`

---

### 4. getGlossaryTerms

**Purpose:** Fetch SDS glossary terms (definitions + abbreviations)

**Request:**
```json
{
  "page": 1,
  "pageSize": 300,
  "sinceLastSync": "2026-03-29T14:30:00.000Z"  // ISO UTC, optional
}
```

**Response:**
```json
{
  "recordset": [
    {
      "category": "SDS Terms",
      "term": "GHS",
      "abbreviation": "Globally Harmonized System",
      "definition": "International classification standard for chemical hazards"
    }
  ],
  "page": 1,
  "pageSize": 300
}
```

**Sync Key:** `_lastupdated`  
**Pagination:** `OFFSET (page-1)*pageSize ROWS FETCH NEXT pageSize ROWS ONLY`  
**Incremental Filter:** `_lastupdated > '${sinceLastSync}'` (if provided)  
**Delete Handling:** `_deleted = 0 AND record_status != 'Deleted'` (soft-delete + status flag)  
**Order:** `_lastupdated ASC, category ASC, term ASC`

---

## Tenant-Scoped Endpoints

### 5. getSiteData

**Status:** Not implemented (relay SQL layer stubbed).  
**Current orchestrator behavior:** Non-fatal step; failure is logged as `sites_skipped`.

---

### 6. getSupplierData

**Status:** Not implemented (relay SQL layer stubbed).  
**Current orchestrator behavior:** Non-fatal step; failure is logged as `suppliers_skipped`.

---

### 7. getDocumentManifest

**Status:** Not implemented (relay SQL layer stubbed).  
**Current orchestrator behavior:** Non-fatal step; failure is logged as `documents_skipped`.

---

## Registry & Composition Endpoints

### 8. getHazmatList

**Purpose:** Fetch hazmat registry entries for a tenant (incremental by last_updated_at)

**Request:**
```json
{
  "site_parent": "Glencore_ECM",
  "page": 1,
  "pageSize": 2000,
  "riskFilter": ["High", "Extreme"],  // optional
  "top25Only": false,  // optional
  "sinceLastSync": "2026-03-29T14:30:00.000Z"  // ISO UTC, optional
}
```

**Response:**
```json
{
  "recordset": [
    {
      "Site_Chem_Id": "chem-001",
      "file_sha256": "abc123def456...",
      "product_name": "Methane Gas",
      "supplier_name": "SafeGas Inc",
      "Risk_Rating": 4,
      "Risk_Rating_Desc": "High",
      "Site": "Johannesburg Operations",
      "Likelihood": 3,
      "ERP_Number": "ERP-2026-001",
      "Responsible_Department": "Operations",
      "Onsite_Contractor": "External Contractor Ltd",
      "Top_25_List": "Yes",
      "record_status": "Active",
      "is_deleted": false,
      "last_updated_at": "2026-03-29T14:32:15.000Z"
    }
  ],
  "page": 1,
  "pageSize": 2000
}
```

**Sync Key:** `last_updated_at`  
**Pagination:** `OFFSET (page-1)*pageSize ROWS FETCH NEXT pageSize ROWS ONLY`  
**Incremental Behavior:**
- **Full Sync** (no `sinceLastSync`): Returns only active rows (`record_status = 'Active'` AND `is_deleted = 0`)
- **Incremental Sync** (with `sinceLastSync`): Returns rows where `last_updated_at > '${sinceLastSync}'` OR `is_deleted = 1` OR `record_status = 'Deleted'` (includes tombstones)
- **Delete Handling:** Caller receives tombstone rows with `is_deleted = 1` and/or `record_status = 'Deleted'`, then removes locally
**Order:** `last_updated_at DESC, Risk_Rating DESC, product_name ASC`  
**Notes:** Timestamp-based incremental sync with tombstone support

---

### 9. getComposition

**Purpose:** Fetch chemical composition for products (incremental by file_sha256 + last_updated_at)

**Request:**
```json
{
  "file_sha256_list": ["abc123...", "def456..."],
  "page": 1,
  "pageSize": 1000,
  "sinceLastSync": "2026-03-29T14:30:00.000Z"  // ISO UTC, optional
}
```

**Response:**
```json
{
  "recordset": [
    {
      "file_sha256": "abc123...",
      "chemical_name": "Iron Oxide",
      "cas_number": "1309-37-1",
      "ec_number": "215-168-2",
      "index_number": "026-008-00-X",
      "reach_registration": "01-2119487243-21",
      "conc_value": 25.5,
      "conc_min": 20,
      "conc_max": 30,
      "conc_unit": "%",
      "hazard_classes": "Acute Tox 3, Eye Irrit",
      "hazard_categories": "H301, H319",
      "hazard_statements": "Toxic if swallowed; Causes serious eye irritation",
      "m_factor": "1",
      "notes": "Dust hazard",
      "last_updated_at": "2026-03-29T14:32:15.000Z",
      "is_deleted": false
    }
  ],
  "page": 1,
  "pageSize": 1000
}
```

**Sync Key:** `last_updated_at`  
**Pagination:** `OFFSET (page-1)*pageSize ROWS FETCH NEXT pageSize ROWS ONLY`  
**Incremental Behavior:**
- **Full Sync** (no `sinceLastSync`): Returns only active rows (`is_deleted = 0` AND `record_status != 'Deleted'`)
- **Incremental Sync** (with `sinceLastSync`): Returns rows where `last_updated_at > '${sinceLastSync}'` OR `is_deleted = 1` OR `record_status = 'Deleted'` (includes tombstones)
- **Delete Handling:** Caller receives tombstone rows with `is_deleted = 1` and/or `record_status = 'Deleted'`, then removes locally
**Order:** `last_updated_at ASC, file_sha256 ASC, chemical_name ASC`  
**Notes:** Timestamp-based incremental sync with tombstone support across pagination

---

### 10. getHazards

**Purpose:** Fetch hazard statements for products (incremental by file_sha256 + last_updated_at)

**Request:**
```json
{
  "file_sha256_list": ["abc123...", "def456..."],
  "page": 1,
  "pageSize": 1000,
  "sinceLastSync": "2026-03-29T14:30:00.000Z"  // ISO UTC, optional
}
```

**Response:**
```json
{
  "recordset": [
    {
      "file_sha256": "abc123...",
      "signal_word": "Danger",
      "statement_type": "H-Statement",
      "pictogram_url": "https://...",
      "code": "H301",
      "label_code": "GHS06",
      "statements": "Toxic if swallowed",
      "last_updated_at": "2026-03-29T14:32:15.000Z",
      "is_deleted": false
    }
  ],
  "page": 1,
  "pageSize": 1000
}
```

**Sync Key:** `last_updated_at`  
**Pagination:** `OFFSET (page-1)*pageSize ROWS FETCH NEXT pageSize ROWS ONLY`  
**Incremental Behavior:**
- **Full Sync** (no `sinceLastSync`): Returns only active rows (`is_deleted = 0` AND `record_status != 'Deleted'`)
- **Incremental Sync** (with `sinceLastSync`): Returns rows where `last_updated_at > '${sinceLastSync}'` OR `is_deleted = 1` OR `record_status = 'Deleted'` (includes tombstones)
- **Delete Handling:** Caller receives tombstone rows with `is_deleted = 1` and/or `record_status = 'Deleted'`, then removes locally
**Order:** `last_updated_at ASC, file_sha256 ASC, code ASC`  
**Notes:** Timestamp-based incremental sync with tombstone support across pagination

---

### 11. getSDSSections

**Purpose:** Fetch SDS text sections for products (incremental by file_sha256 + last_updated_at)

**Request:**
```json
{
  "file_sha256_list": ["abc123...", "def456..."],
  "page": 1,
  "pageSize": 500,
  "sinceLastSync": "2026-03-29T14:30:00.000Z"  // ISO UTC, optional
}
```

**Response:**
```json
{
  "recordset": [
    {
      "file_sha256": "abc123...",
      "section_number": 3,
      "text": "COMPOSITION / INFORMATION ON INGREDIENTS\n\nChemical Name: Iron Oxide\nCAS Number: 1309-37-1\nConcentration: 25.5%",
      "abstained": false,
      "reason": null,
      "last_updated_at": "2026-03-29T14:32:15.000Z",
      "is_deleted": false
    }
  ],
  "page": 1,
  "pageSize": 500
}
```

**Sync Key:** `last_updated_at`  
**Pagination:** `OFFSET (page-1)*pageSize ROWS FETCH NEXT pageSize ROWS ONLY`  
**Incremental Behavior:**
- **Full Sync** (no `sinceLastSync`): Returns only active rows (`is_deleted = 0` AND `record_status != 'Deleted'`)
- **Incremental Sync** (with `sinceLastSync`): Returns rows where `last_updated_at > '${sinceLastSync}'` OR `is_deleted = 1` OR `record_status = 'Deleted'` (includes tombstones)
- **Delete Handling:** Caller receives tombstone rows with `is_deleted = 1` and/or `record_status = 'Deleted'`, then removes locally
**Order:** `last_updated_at ASC, file_sha256 ASC, section_number ASC`  
**Notes:** Timestamp-based incremental sync with tombstone support across pagination. Sections may be empty if extraction abstained (`abstained = true`).

---

## Error Handling

**All endpoints return standard error format on failure:**

```json
{
  "error": "Error message",
  "detail": "Stack trace (if available)"
}
```

**HTTP Status Codes:**
- `200 OK` – Success
- `400 Bad Request` – Missing/invalid params
- `401 Unauthorized` – Invalid X-Relay-Secret
- `404 Not Found` – Unknown endpoint
- `500 Internal Server Error` – SQL/server error

---

## Implementation Notes

### Timestamps
- **Format:** ISO 8601 UTC (e.g., `2026-03-29T14:32:15.123Z`)
- **Timezone:** All timestamps in UTC; SQL Server must be configured for UTC
- **Consistency:** Frontend (Deno) always produces UTC via `new Date().toISOString()`

### Pagination
- **Default pageSize:** Varies by endpoint (300–5000)
- **Max pageSize:** 5000 for all endpoints
- **Start Page:** Always page 1 (offset 0)
- **Done Signal:** `rows.length < pageSize` indicates final page

### Soft Delete Patterns

**All tables use consistent delete handling:**
- Rows are never hard-deleted
- Soft deletes are tracked via `is_deleted` (or `_deleted` for reference tables) + `record_status = 'Deleted'`
- Caller receives tombstone rows (with delete flags set) and must remove them locally

**Full Sync Behavior:**
- All endpoints filter out deleted rows when `sinceLastSync` is NOT provided
- WHERE clause: `is_deleted = 0 AND record_status != 'Deleted'`

**Incremental Sync Behavior:**
- All endpoints return tombstones when `sinceLastSync` IS provided
- WHERE clause: `last_updated_at > @sinceLastSync` OR `is_deleted = 1` OR `record_status = 'Deleted'`
- Caller deletes rows from local cache if received with `is_deleted = 1` and/or `record_status = 'Deleted'`

### Incremental Sync Guarantee
- **Lookup tables (GHS, NFPA, PPE, Glossary):** `_lastupdated > sinceLastSync` (or deleted)
- **Metadata (Site, Supplier, Document):** `last_updated_at > sinceLastSync` (or deleted)
- **Composition tables (Hazmat, Composition, Hazards, SDS):** `last_updated_at > sinceLastSync` (or deleted)
- **Save timestamp:** After each successful incremental page, save `max(last_updated_at)` or `max(_lastupdated)` from results + 1ms safety margin

---

## Request/Response Examples

### Example 1: Incremental Sync (Lookup)
**Request:**
```bash
curl -X POST https://relay.example.com/getGHSCodes \
  -H "X-Relay-Secret: secret123" \
  -H "Content-Type: application/json" \
  -d '{
    "page": 1,
    "pageSize": 5000,
    "sinceLastSync": "2026-03-28T14:30:00.000Z"
  }'
```

**Response:**
```json
{
  "recordset": [
    { "code": "H302", "statement": "...", ... },
    { "code": "H303", "statement": "...", ... }
  ],
  "page": 1,
  "pageSize": 5000
}
```
**Action:** If `recordset.length < 5000`, sync complete. Save timestamp `2026-03-29T14:32:15.123Z` for next sync.

### Example 2: Pagination (Composition)
**Request 1 (page 1):**
```bash
curl -X POST https://relay.example.com/getComposition \
  -H "X-Relay-Secret: secret123" \
  -d '{
    "file_sha256_list": ["abc123...", "def456..."],
    "page": 1,
    "pageSize": 1000
  }'
```

**Response 1:**
```json
{
  "recordset": [
    { "file_sha256": "abc123...", "chemical_name": "Iron Oxide", ... },
    ...
    // 1000 rows
  ],
  "page": 1,
  "pageSize": 1000
}
```

**Request 2 (page 2):**
```bash
curl -X POST https://relay.example.com/getComposition \
  -d '{
    "file_sha256_list": ["abc123...", "def456..."],
    "page": 2,
    "pageSize": 1000
  }'
```

**Response 2:**
```json
{
  "recordset": [
    // rows 1001–2000 (or fewer if < 1000)
  ],
  "page": 2,
  "pageSize": 1000
}
```
**Action:** If `recordset.length < 1000`, no more pages. Stop pagination.

---

## Endpoint Summary Table

| Endpoint | Scope | Sync Key | Pagination | Delete Support | Max PageSize |
|----------|-------|----------|-----------|-----------------|--------------|
| getGHSCodes | Global | `_lastupdated` | ✅ Yes | `_deleted` + `record_status` | 5000 |
| getNFPAGuides | Global | `_lastupdated` | ✅ Yes | `_deleted` + `record_status` | 5000 |
| getPPEReferences | Global | `_lastupdated` | ✅ Yes | `_deleted` + `record_status` | 5000 |
| getGlossaryTerms | Global | `_lastupdated` | ✅ Yes | `_deleted` + `record_status` | 5000 |
| getSiteData | Tenant | — | ❌ Not Implemented | — | — |
| getSupplierData | Tenant | — | ❌ Not Implemented | — | — |
| getDocumentManifest | Tenant | — | ❌ Not Implemented | — | — |
| getHazmatList | Tenant | `last_updated_at` | ✅ Yes | `record_status` + `is_deleted` | 5000 |
| getComposition | Tenant | `last_updated_at` | ✅ Yes | `is_deleted` + `record_status` | 5000 |
| getHazards | Tenant | `last_updated_at` | ✅ Yes | `is_deleted` + `record_status` | 5000 |
| getSDSSections | Tenant | `last_updated_at` | ✅ Yes | `is_deleted` + `record_status` | 5000 |