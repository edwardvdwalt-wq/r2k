# Database Index Strategy for HazMat R2K

## Query Path Requirements

This document defines the indexes needed to support efficient query execution across all relay endpoints.

### Core Entity Indexes

#### Site Table
```sql
-- Primary composite index for tenant filtering with pagination
CREATE INDEX idx_site_tenant_updated ON Site(tenant_id, is_active, updated_date, name);

-- Support soft-delete queries during incremental sync
CREATE INDEX idx_site_soft_delete ON Site(tenant_id, is_deleted, updated_date);
```

#### Supplier Table
```sql
-- Tenant + status + timestamp for pagination
CREATE INDEX idx_supplier_tenant_updated ON Supplier(tenant_id, is_active, updated_date, name);

-- Soft-delete support for incremental sync
CREATE INDEX idx_supplier_soft_delete ON Supplier(tenant_id, is_deleted, updated_date);
```

#### Document Table
```sql
-- Multi-tenant document retrieval with lifecycle awareness
CREATE INDEX idx_document_tenant_status ON Document(tenant_id, is_active, is_deleted, updated_date, document_type);

-- Fast lookup by registry entry for cascading deletes
CREATE INDEX idx_document_registry ON Document(registry_entry_id, tenant_id);

-- Fast lookup by site for offline-priority documents
CREATE INDEX idx_document_site ON Document(site_id, tenant_id, is_offline_priority);
```

### HazMat Registry Indexes (Existing, Optimized)

```sql
-- Primary hazmat list query with risk filtering
CREATE INDEX idx_hazmat_tenant_risk_updated ON HazMatRegistry(
  tenant_id, 
  is_active, 
  Risk_Rating_Desc, 
  updated_date
) INCLUDE (product_name, supplier_name, file_sha256);

-- Fast Top 25 filtering
CREATE INDEX idx_hazmat_top25 ON HazMatRegistry(tenant_id, Top_25_List, Risk_Rating_Desc);

-- Composition/Hazard/SDS lookups via file_sha256
CREATE INDEX idx_hazmat_file_sha256 ON HazMatRegistry(file_sha256, tenant_id);
```

### Reference Data Indexes (Global, Lookup-Only)

```sql
-- GHS Codes - updated_date for incremental sync
CREATE INDEX idx_ghs_codes_updated ON GHSHazardCode(updated_date, is_deleted);

-- NFPA Guides - updated_date for incremental sync
CREATE INDEX idx_nfpa_guides_updated ON NFPAGuide(updated_date, is_deleted);

-- PPE References - updated_date for incremental sync
CREATE INDEX idx_ppe_updated ON PPEReference(updated_date, is_deleted);

-- Glossary Terms - category + term + tenant
CREATE INDEX idx_glossary_terms ON GlossaryTerm(
  category, 
  term, 
  tenant_id, 
  updated_date, 
  is_deleted
);
```

### Composition & Hazard Indexes

```sql
-- Composition lookup by file_sha256 with pagination support
CREATE INDEX idx_composition_file_sha ON Composition(
  file_sha256, 
  tenant_id, 
  updated_date
) INCLUDE (chemical_name, cas_number, conc_value);

-- Hazard lookup by file_sha256
CREATE INDEX idx_hazard_file_sha ON Hazard(
  file_sha256, 
  tenant_id, 
  updated_date
) INCLUDE (code, signal_word);

-- SDS Sections by file_sha256 + section_number
CREATE INDEX idx_sds_section_file_sha ON SDSSection(
  file_sha256, 
  tenant_id, 
  section_number, 
  updated_date
);
```

## Query Pattern Summary

| Endpoint | Primary Index | Secondary Index | Incremental Support |
|----------|---------------|-----------------|---------------------|
| getSiteData | idx_site_tenant_updated | idx_site_soft_delete | Yes (is_deleted) |
| getSupplierData | idx_supplier_tenant_updated | idx_supplier_soft_delete | Yes (is_deleted) |
| getDocumentManifest | idx_document_tenant_status | idx_document_site | Yes (is_deleted, is_active) |
| getHazmatList | idx_hazmat_tenant_risk_updated | idx_hazmat_file_sha256 | Yes (via HazMatRegistry) |
| getComposition | idx_composition_file_sha | - | Yes (updated_date) |
| getHazards | idx_hazard_file_sha | - | Yes (updated_date) |
| getSDSSections | idx_sds_section_file_sha | - | Yes (updated_date) |
| getGHSCodes | idx_ghs_codes_updated | - | Yes (updated_date) |
| getNFPAGuides | idx_nfpa_guides_updated | - | Yes (updated_date) |
| getPPEReferences | idx_ppe_updated | - | Yes (updated_date) |
| getGlossaryTerms | idx_glossary_terms | - | Yes (updated_date) |

## Soft Delete & Deactivation Handling

### Pattern: is_deleted + is_active flags

**First Sync (no sinceLastSync):**
- Returns only active records (`is_active = 1` AND `is_deleted = 0`)

**Incremental Sync (with sinceLastSync):**
- Returns records where:
  - `updated_date > sinceLastSync` (changed records)
  - `is_deleted = 1` (newly deactivated/deleted)
  - Client must handle deletion by checking `is_deleted` flag

### Example Flow
```
1. Client requests: getSiteData(tenant_id, sinceLastSync='2026-03-28T10:00:00Z')
2. Relay returns all sites modified since that time, including deleted ones
3. Client receives `is_deleted: true` or `is_active: false` flags
4. Client removes these records from local cache
5. Indexes ensure efficient retrieval of both active AND changed records
```

## Notes

- All indexes use `tenant_id` as leading column for multi-tenant isolation
- `updated_date` is always included to support incremental sync patterns
- `INCLUDE` clauses reduce need for additional lookups in pagination queries
- Soft deletes avoid expensive physical deletions and enable recovery
- Index sizes should be monitored; consider partitioning on `tenant_id` for very large datasets