# Database Trigger Requirements for Sync Field Maintenance

**Last Updated:** 2026-03-29  
**Status:** Design Specification  
**Purpose:** Define automatic timestamp and soft-delete field maintenance via SQL Server triggers

---

## Overview

The relay service relies on timestamp-based incremental synchronization. Database triggers must automatically maintain:

1. **Timestamp Fields** – Updated on every INSERT/UPDATE
2. **Soft Delete Fields** – Maintained on UPDATE (delete operations)
3. **Status Fields** – Updated consistently with delete state

Triggers ensure sync integrity without requiring application-level timestamp management.

---

## Timestamp Field Maintenance

### Operational Tables (use `last_updated_at`)

**Tables:**
- `Site`
- `Supplier`
- `Document`
- `R2K_Site_Hazmat_Registry`
- `Composition`
- `Hazards`
- `TextBySection`

**Trigger Behavior:**

```sql
-- ON INSERT: Set last_updated_at to GETUTCDATE()
-- ON UPDATE: Set last_updated_at to GETUTCDATE()
```

**Example SQL Server Trigger:**
```sql
CREATE TRIGGER tr_Site_UpdateTimestamp
ON Site
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE Site
    SET last_updated_at = GETUTCDATE()
    WHERE id IN (SELECT id FROM inserted);
END;
```

**Requirements:**
- `GETUTCDATE()` must return UTC timestamp (server configured for UTC)
- Timestamp precision: milliseconds (`DATETIME2(3)` or `DATETIME`)
- Always use UTC; never local time
- Timestamp must be updated on UPDATE even if only soft-delete flags change

---

### Reference Tables (use `_lastupdated`)

**Tables:**
- `GHS_Codes`
- `NFPA_Guide`
- `PPE_Reference`
- `Glossary_Terms`

**Trigger Behavior:**

```sql
-- ON INSERT: Set _lastupdated to GETUTCDATE()
-- ON UPDATE: Set _lastupdated to GETUTCDATE()
```

**Example SQL Server Trigger:**
```sql
CREATE TRIGGER tr_GHSCodes_UpdateTimestamp
ON GHS_Codes
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE GHS_Codes
    SET _lastupdated = GETUTCDATE()
    WHERE code IN (SELECT code FROM inserted);
END;
```

---

## Soft Delete Field Maintenance

### Two-Flag Soft Delete Pattern

All tables use both flags for delete tracking:

1. **`is_deleted`** (TINYINT / BIT)
   - `0` = active (default)
   - `1` = marked for deletion
   - Synced to app for incremental pull-down deletes

2. **`record_status`** (VARCHAR/NVARCHAR)
   - `'Active'` = live record (default)
   - `'Archived'` = inactive but retained
   - `'Deleted'` = soft-deleted record
   - Query filter: `WHERE record_status != 'Deleted' AND is_deleted = 0`

### Soft Delete Via Application UPDATE

**No hard deletes.** Deletion triggers an UPDATE:

```sql
UPDATE Site
SET is_deleted = 1,
    record_status = 'Deleted',
    last_updated_at = GETUTCDATE()
WHERE id = @id;
```

**Trigger Behavior** (optional, for consistency):
- When `is_deleted` is set to `1`, ensure `record_status = 'Deleted'`
- When `record_status` is set to `'Deleted'`, ensure `is_deleted = 1`
- Always update timestamp on delete

**Example Sync Trigger:**
```sql
CREATE TRIGGER tr_Site_SyncDeleteFlags
ON Site
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    -- If is_deleted=1, ensure record_status='Deleted'
    UPDATE Site
    SET record_status = 'Deleted'
    WHERE id IN (SELECT id FROM inserted)
      AND inserted.is_deleted = 1
      AND inserted.record_status != 'Deleted';
    
    -- If record_status='Deleted', ensure is_deleted=1
    UPDATE Site
    SET is_deleted = 1
    WHERE id IN (SELECT id FROM inserted)
      AND inserted.record_status = 'Deleted'
      AND inserted.is_deleted = 0;
END;
```

---

## Trigger Implementation Checklist

### Per-Table Requirements

#### Operational Tables
- [ ] `Site` – INSERT/UPDATE: set `last_updated_at`
- [ ] `Supplier` – INSERT/UPDATE: set `last_updated_at`
- [ ] `Document` – INSERT/UPDATE: set `last_updated_at`
- [ ] `R2K_Site_Hazmat_Registry` – INSERT/UPDATE: set `last_updated_at`
- [ ] `Composition` – INSERT/UPDATE: set `last_updated_at`
- [ ] `Hazards` – INSERT/UPDATE: set `last_updated_at`
- [ ] `TextBySection` – INSERT/UPDATE: set `last_updated_at`

#### Reference Tables
- [ ] `GHS_Codes` – INSERT/UPDATE: set `_lastupdated`
- [ ] `NFPA_Guide` – INSERT/UPDATE: set `_lastupdated`
- [ ] `PPE_Reference` – INSERT/UPDATE: set `_lastupdated`
- [ ] `Glossary_Terms` – INSERT/UPDATE: set `_lastupdated`

#### Delete Sync Triggers (optional but recommended)
- [ ] `Site` – sync `is_deleted` ↔ `record_status`
- [ ] `Supplier` – sync `is_deleted` ↔ `record_status`
- [ ] `Document` – sync `is_deleted` ↔ `record_status`
- [ ] `R2K_Site_Hazmat_Registry` – sync `is_deleted` ↔ `record_status`
- [ ] `Composition` – sync `is_deleted` ↔ `record_status`
- [ ] `Hazards` – sync `is_deleted` ↔ `record_status`
- [ ] `TextBySection` – sync `is_deleted` ↔ `record_status`
- [ ] `GHS_Codes` – sync `_deleted` ↔ `record_status`
- [ ] `NFPA_Guide` – sync `_deleted` ↔ `record_status`
- [ ] `PPE_Reference` – sync `_deleted` ↔ `record_status`
- [ ] `Glossary_Terms` – sync `_deleted` ↔ `record_status`

---

## Relay Contract Alignment

With triggers in place, the relay service assumes:

### Sync Field Guarantees

**Operational Tables (Composition, Hazards, SDS, Site, Supplier, Document, Registry):**
- `last_updated_at` is **always** set on INSERT/UPDATE
- Incremental filter: `WHERE last_updated_at > @sinceLastSync`
- Delete check: `WHERE is_deleted = 0 AND record_status != 'Deleted'`

**Reference Tables (GHS, NFPA, PPE, Glossary):**
- `_lastupdated` is **always** set on INSERT/UPDATE
- Incremental filter: `WHERE _lastupdated > @sinceLastSync`
- Delete check: `WHERE _deleted = 0 AND record_status != 'Deleted'`

### Query Patterns Expected by Relay

```sql
-- Incremental sync (operational tables)
SELECT ...
FROM Composition
WHERE file_sha256 IN (...)
  AND last_updated_at > '2026-03-29T14:30:00.000Z'
  AND is_deleted = 0
  AND record_status != 'Deleted'
ORDER BY last_updated_at ASC, file_sha256 ASC, chemical_name ASC;

-- Incremental sync (reference tables)
SELECT ...
FROM GHS_Codes
WHERE _lastupdated > '2026-03-29T14:30:00.000Z'
  AND _deleted = 0
  AND record_status != 'Deleted'
ORDER BY _lastupdated ASC, code ASC;

-- Soft delete retrieval (for delta tracking)
SELECT id, Site_Parent, name, is_deleted, last_updated_at
FROM Site
WHERE Site_Parent = 'Glencore_ECM'
  AND (last_updated_at > '2026-03-29T14:30:00.000Z' OR is_deleted = 1);
```

---

## UTC Compliance

### Server Configuration

**CRITICAL:** SQL Server instance must be configured for UTC:

1. **System Time:** Server system clock in UTC
2. **SQL Server Login Default:** Do not use `CURRENT_TIMESTAMP` (local time)
3. **Use:** `GETUTCDATE()` (UTC) in all triggers
4. **Never:** `GETDATE()` (local time) in sync fields

**Verification Query:**
```sql
-- Should return the same or very close times
SELECT GETUTCDATE() AS UTC, GETDATE() AS LocalTime;

-- UTC should be ahead of local time by your timezone offset
-- Africa/Johannesburg is UTC+2 (or UTC+1 in winter)
```

---

## Edge Cases & Considerations

### Mid-Pagination Updates

**Scenario:** Record is updated mid-way through pagination.

**Mitigation:** Triggers ensure `last_updated_at` is always updated. Relay client:
1. Saves timestamp from last page: `max(last_updated_at) + 1ms`
2. Next sync fetches only rows where `last_updated_at > saved_timestamp`
3. Guarantees no missed updates across pages

### Bulk Inserts

**Scenario:** Batch insert 10,000 rows via `INSERT ... SELECT`.

**Expected:** All rows get `last_updated_at = GETUTCDATE()` (same timestamp).

**Relay behavior:** All rows treated as a single batch in next sync; no duplicates if timestamp comparison is `>`, not `>=`.

### Concurrent Updates

**Scenario:** Same row updated by two transactions simultaneously.

**Expected:** Last write wins; timestamp reflects the latest update.

**Relay behavior:** May see the row twice in paginated sync if updated between requests. Idempotent upsert in app handles duplicates.

### Soft Delete Timestamp

**Scenario:** Row marked deleted at 14:32:00, then updated (reactivated) at 14:35:00.

**Expected:** `last_updated_at = 14:35:00`, `is_deleted = 0`, `record_status = 'Active'`.

**Relay behavior:** Row appears as "updated" in sync (not deleted). Correct; app treats as reactivation.

---

## Monitoring & Validation

### Health Check Query

Run periodically to validate trigger effectiveness:

```sql
-- Should return 0 rows (no missing timestamps)
SELECT COUNT(*) AS missing_timestamps
FROM Site
WHERE last_updated_at IS NULL AND created_date IS NOT NULL;

-- Should return row count (all active)
SELECT COUNT(*) AS active_sites
FROM Site
WHERE is_deleted = 0 AND record_status = 'Active';

-- Verify UTC time is consistent
SELECT 
    DATEDIFF(SECOND, GETUTCDATE(), GETDATE()) AS offset_seconds;
    -- Africa/Johannesburg = +7200 (2 hours ahead in winter)
```

### Trigger Performance Impact

- **Timestamp trigger:** Negligible (single UPDATE statement)
- **Delete sync trigger:** Minimal (conditional check + update)
- **Total overhead:** < 1% for typical OLTP workloads

No indexing changes required; `last_updated_at` and `_lastupdated` already indexed for sync queries.

---

## Reference: Relay Field Mappings

| Table | Timestamp Field | Delete Flags | Used By Relay |
|-------|-----------------|--------------|---------------|
| Site | `last_updated_at` | `is_deleted`, `record_status` | getSiteData |
| Supplier | `last_updated_at` | `is_deleted`, `record_status` | getSupplierData |
| Document | `last_updated_at` | `is_deleted`, `record_status` | getDocumentManifest |
| R2K_Site_Hazmat_Registry | `last_updated_at` | `is_deleted`, `record_status` | getHazmatList |
| Composition | `last_updated_at` | `is_deleted`, `record_status` | getComposition |
| Hazards | `last_updated_at` | `is_deleted`, `record_status` | getHazards |
| TextBySection | `last_updated_at` | `is_deleted`, `record_status` | getSDSSections |
| GHS_Codes | `_lastupdated` | `_deleted`, `record_status` | getGHSCodes |
| NFPA_Guide | `_lastupdated` | `_deleted`, `record_status` | getNFPAGuides |
| PPE_Reference | `_lastupdated` | `_deleted`, `record_status` | getPPEReferences |
| Glossary_Terms | `_lastupdated` | `_deleted`, `record_status` | getGlossaryTerms |

---

## Next Steps

1. **Implement triggers** on all 11 tables per checklist above
2. **Verify UTC server configuration** with health check query
3. **Test soft deletes** end-to-end with relay sync
4. **Monitor trigger performance** after deployment
5. **Keep this doc aligned** with any schema changes