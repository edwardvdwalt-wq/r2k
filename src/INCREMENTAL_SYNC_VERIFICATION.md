# Incremental Sync Field Verification

## Overview
Detailed audit of incremental sync driver fields, tie handling, timezone behavior, and mid-pagination update risks.

---

## 1. Incremental Sync Driver Fields by Endpoint

### ✅ Lookup Endpoints (Global)
**All use `updated_date` as the sole incremental field:**

| Endpoint | SQL Filter | Ordering | Notes |
|----------|-----------|----------|-------|
| `getGHSCodes` | `updated_date > @sinceLastSync` | `updated_date ASC, code` | global scope |
| `getNFPAGuides` | `updated_date > @sinceLastSync` | `updated_date ASC, class, level` | global scope |
| `getPPEReferences` | `updated_date > @sinceLastSync` | `updated_date ASC, ppe_name` | global scope |
| `getGlossaryTerms` | `updated_date > @sinceLastSync` | `updated_date ASC, category, term` | global scope |

### ✅ Tenant-Scoped Endpoints
**All use `updated_date` or `is_deleted` flag:**

| Endpoint | SQL Filter | Ordering | Notes |
|----------|-----------|----------|-------|
| `getSiteData` | `updated_date > @sinceLastSync OR is_deleted = 1` | `updated_date ASC, name` | Incremental only |
| `getSupplierData` | `updated_date > @sinceLastSync OR is_deleted = 1` | `updated_date ASC, name` | Incremental only |
| `getDocumentManifest` | `updated_date > @sinceLastSync OR is_deleted = 1 OR is_active = 0` | `updated_date ASC, document_type, title` | Incremental only |

### ⚠️ Registry/Composition/Hazards (No Native Incremental Support)
**These endpoints do NOT use `updated_date` for incremental filtering:**

| Endpoint | Incremental Support | Current Behavior |
|----------|-------------------|-----------------|
| `getHazmatList` | ❌ **NONE** | No `sinceLastSync` parameter; full scan on each call |
| `getComposition` | ❌ **NONE** | No `sinceLastSync` parameter; full scan on each call |
| `getHazards` | ❌ **NONE** | No `sinceLastSync` parameter; full scan on each call |
| `getSDSSections` | ❌ **NONE** | No `sinceLastSync` parameter; full scan on each call |

**Source SQL:**
- `getHazmatList`: No WHERE clause filtering on date; hardcoded `status = 'Active'`
- `getComposition`: Filters by `file_sha256 IN (...)` only; no date field
- `getHazards`: Filters by `file_sha256 IN (...)` only; no date field
- `getSDSSections`: Filters by `file_sha256 IN (...)` only; no date field

---

## 2. Is It Always `updated_date`?

**Answer: YES for lookup tables (global) and metadata (site/supplier/document). NO for composition tables.**

### Lookup Tables ✅
- GHS Codes, NFPA, PPE, Glossary all rely exclusively on `updated_date > '${sinceLastSync}'`

### Metadata Tables ✅
- Site, Supplier, Document all use:
  ```sql
  WHERE (updated_date > @sinceLastSync OR is_deleted = 1)
  ```
  This enables both **new/modified rows** (via `updated_date`) and **deleted rows** (via `is_deleted` flag).

### Composition Tables ❌
- **No date filtering whatsoever.** Registry, Composition, Hazards, SDS Sections all do full scans.
- The only filtering is by `file_sha256` (which is a foreign key relationship, not an incremental selector).

---

## 3. Tie Handling (Multiple Rows with Same Timestamp)

### Lookup Endpoints
**SQL Guarantees Order:**
```sql
ORDER BY updated_date ASC, code ASC
```

**Example (GHSHazardCodes):**
- If 100 rows have `updated_date = 2026-03-29 14:32:00.000`, they will still be ordered consistently by `code`.
- Next sync at exactly that timestamp will catch duplicates via:
  - SQL uses `>` (strict greater-than), not `>=`
  - Rows with identical timestamp won't re-appear on next page

**Risk Level: LOW** – SQL's `ORDER BY` clause with secondary sort key prevents duplicate rows across pagination.

### Metadata Endpoints (Site, Supplier, Document)
**SQL Guarantees Order:**
```sql
ORDER BY updated_date ASC, name ASC  -- OR document_type, title
```

**Same Principle:** Secondary sort keys prevent ties from causing duplicates or gaps.

**Risk Level: LOW**

### Composition Tables (No Ordering Guarantee on Date)
**SQL Ordering:**
- `getComposition`: `ORDER BY file_sha256, chemical_name` — **NO date ordering**
- `getHazards`: `ORDER BY file_sha256, code` — **NO date ordering**
- `getSDSSections`: `ORDER BY file_sha256, section_number` — **NO date ordering**

**Risk Level: CRITICAL** – If rows from different batches (during pagination) are updated simultaneously, sync logic won't detect them because there's no incremental field.

---

## 4. Timestamps: UTC and Consistency

### ✅ Frontend (`masterSyncDirectDb`)
```javascript
const nextSyncTime = new Date().toISOString();
// → Example: "2026-03-29T14:32:15.123Z"
```
- Uses JavaScript `Date.toISOString()` which **always returns UTC**
- Stored in browser localStorage as ISO string
- Passed to relay as `sinceLastSync: lastSync?.toISOString()`

### ✅ Relay Service (`relayService`)
```javascript
// SQL WHERE clause:
whereClause += ` AND updated_date > '${sinceLastSync}'`;
```
- Receives ISO string from sync function (UTC)
- Passed directly to SQL query parser
- **Assumption:** SQL Server is configured with UTC timestamps

### ⚠️ SQL Server Assumptions
**NOT EXPLICITLY VERIFIED:**
- Is the SQL `updated_date` column in UTC?
- Is the SQL Server timezone set to UTC?
- Are timestamps timezone-aware or naive?

**Recommendation:** Add validation:
```sql
-- Verify timestamp consistency
SELECT 
  GETDATE() AS [DB_Now_Local],
  GETUTCDATE() AS [DB_Now_UTC],
  SYSDATETIMEOFFSET() AS [DB_Now_WithTZ]
FROM sys.tables LIMIT 1;
```

### Timezone Consistency in App
- **Frontend:** Always UTC (JavaScript `toISOString()`)
- **localStorage:** Stored as ISO strings (UTC)
- **SyncLog Entity:** `timestamp: new Date().toISOString()` (UTC)
- **User timezone (Africa/Johannesburg):** Only used for UI display, NOT for sync logic

**Overall Consistency: HIGH** (frontend is always UTC; relay depends on SQL Server config)

---

## 5. Mid-Pagination Updates

### The Risk Scenario
**Pagination Loop:**
1. Fetch page 1 of `getComposition` (offset 0, pageSize 500) → rows 1–500
2. **[Meanwhile, SQL source is updated: new chemical_name in row 50's file_sha256]**
3. Fetch page 2 of `getComposition` (offset 500, pageSize 500) → rows 501–1000

**Question:** Will the update on row 50 be missed?

### Analysis by Endpoint

#### ✅ **Lookup Endpoints (LOW RISK)**
**Why:** They re-fetch from scratch using `updated_date > last_sync_time`:
- Page 1 fetches all rows where `updated_date > '2026-03-29 14:30:00'`
- If a row is updated **during pagination**, the **next page will still see it** because:
  - The WHERE clause `updated_date > ...` is evaluated **fresh on each query**
  - If row 50 is updated to `2026-03-29 14:31:59`, the next page's SQL will include it (if on same file_sha256 filter)

**Mitigating Factor:** `ORDER BY updated_date ASC` ensures consistent order.

#### ❌ **Composition/Hazards/SDS Sections (CRITICAL RISK)**
**Why:** They do NOT use incremental filtering:
1. Query page 1 → returns rows 1–500 (no timestamp filter)
2. Source DB updates row 50
3. Query page 2 → returns rows 501–1000
4. **Result:** Row 50's update is **MISSED** because:
   - No `sinceLastSync` filter to catch the update
   - OFFSET/FETCH is based on insertion order, not modification time
   - Row 50 already passed in page 1; won't appear in page 2

**Concrete Example:**
```
Time T0: HazmatRegistry contains file_sha256="ABC123"
Time T1: getComposition page 1 fetches rows 1–500 (ABC123's compositions)
Time T2: [SQL source: composition "Iron Oxide" for ABC123 is updated]
Time T3: getComposition page 2 fetches rows 501–1000 (ABC123's compositions)
Result: Update to "Iron Oxide" is MISSED.
```

### Registry/Hazmat List (Limited Scope)
- **`getHazmatList`:** No pagination-safe incremental field, but:
  - It's a **full refresh** on each sync (no `sinceLastSync`)
  - So mid-pagination updates are caught on the **next full sync run**
  - Less critical than composition tables (which are paginated)

---

## Risk Matrix

| Endpoint | Incremental Support | Pagination Risk | Tie Risk | Timestamp Risk |
|----------|-------------------|-----------------|----------|----------------|
| **Lookup (GHS, NFPA, PPE, Glossary)** | ✅ Yes | ✅ Low | ✅ Low | ✅ UTC |
| **Metadata (Site, Supplier, Document)** | ✅ Yes | ✅ Low | ✅ Low | ✅ UTC |
| **Registry (HazmatList)** | ❌ No | ⚠️ Medium | N/A | ✅ UTC |
| **Composition, Hazards, SDS** | ❌ No | ❌ **CRITICAL** | N/A | ✅ UTC |

---

## Recommendations

### Immediate (HIGH PRIORITY)
1. **Add `updated_date` to Composition, Hazards, SDSSection tables** (if possible in source SQL DB)
2. **Modify relay handlers** to accept `sinceLastSync` for these endpoints:
   ```javascript
   const handleGetComposition = async (params) => {
     const { file_sha256_list, page = 1, pageSize = 1000, sinceLastSync } = params;
     let whereClause = `WHERE file_sha256 IN (...)`;
     if (sinceLastSync) {
       whereClause += ` AND updated_date > '${sinceLastSync}'`;
     }
     // ... rest of query
   };
   ```

### Short Term
1. **Document timestamp assumptions** in DATABASE_INDEX_STRATEGY.md:
   - Add SQL validation queries to verify UTC consistency
   - Document SQL Server timezone configuration

2. **Add mid-pagination detection** to `masterSyncDirectDb`:
   ```javascript
   // Log warning if pageSize is too large (increases mid-pagination risk)
   if (pageSize > 1000) {
     console.warn(`[Sync] Large pageSize=${pageSize} increases mid-pagination update risk`);
   }
   ```

3. **Implement heartbeat logging** (already done via SyncLog):
   - Track which sync timestamps were used
   - Enable audit trail for missed updates

### Long Term
1. **Full refresh fallback** for composition tables:
   - If a sync error is detected, re-run entire composition sync (not incremental)
   - Add a "last full sync" field to track comprehensive syncs

2. **Event streaming** (if source DB supports it):
   - Move from polling with OFFSET/FETCH to event-driven updates
   - Capture DML events (INSERT/UPDATE/DELETE) and stream to relay

---

## Summary Table

| Question | Answer | Verification |
|----------|--------|--------------|
| **Incremental driver field?** | `updated_date` for lookups/metadata; **NONE** for composition | ✅ Code reviewed |
| **Always `updated_date`?** | No – composition tables lack incremental field | ❌ Critical gap |
| **Tie handling?** | SQL `ORDER BY` with secondary key prevents duplicates | ✅ Low risk |
| **Timestamps UTC?** | Frontend: always UTC ✅; SQL Server: **unverified** ⚠️ | Partial ✅ |
| **Mid-pagination updates?** | Lookup/metadata: safe ✅; Composition: **CRITICAL RISK** ❌ | ❌ High risk |