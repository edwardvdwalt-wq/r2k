# Dual Logging & Troubleshooting Guide

## Overview

All relay and sync operations now log to **two channels**:

1. **Console (JSON)** – Real-time structured logs, ideal for live monitoring
2. **SyncLog Entity** – Persistent queryable records in the database

## Console Logs (Real-time)

All relay and sync operations output JSON to stdout:

```json
{
  "timestamp": "2026-03-29T14:32:15.000Z",
  "operation": "relay_endpoint",
  "endpoint": "getHazmatList",
  "status": "success",
  "duration_ms": 245,
  "row_count": 1847,
  "request_params": {"site_parent":"Glencore_ECM","page":1,"pageSize":2000}
}
```

### Console Log Fields

**For Relay Endpoints:**
- `timestamp` – ISO timestamp
- `operation` – Always `"relay_endpoint"`
- `endpoint` – Function name (getHazmatList, getComposition, etc)
- `status` – `"success"` or `"error"`
- `duration_ms` – Execution time
- `row_count` – Rows returned
- `request_params` – JSON string of input params (success only)
- `error_message` – Error text (error only)
- `error_stack` – Stack trace (error only)

**For Sync Steps:**
- `timestamp`, `operation` (="sync_step"), `status`, `duration_ms`
- `endpoint_or_step` – Step name (registry, composition, sites, etc)
- `tenant_id` – Tenant context (null for global lookups)
- `row_count` – Total rows affected (created + deleted + archived)
- `offset`, `page_size`, `next_offset` – Pagination state
- `is_done` – Whether all data synced
- `request_params` – Input payload (error only)

### Parsing Console Logs

**Example: Extract slow relay calls (>500ms)**
```bash
docker logs <container> | jq 'select(.operation=="relay_endpoint" and .duration_ms > 500)'
```

**Example: Find all errors**
```bash
docker logs <container> | jq 'select(.status=="error")'
```

**Example: Count rows by endpoint**
```bash
docker logs <container> | jq -s 'group_by(.endpoint) | map({endpoint: .[0].endpoint, total_rows: map(.row_count) | add})'
```

---

## SyncLog Entity (Persistent)

All logs are also written to the `SyncLog` entity for persistent analysis.

### SyncLog Schema

```
├─ operation (relay_endpoint | sync_step)
├─ endpoint_or_step (string)
├─ tenant_id (string, null for global)
├─ status (success | error)
├─ duration_ms (number)
├─ row_count (number)
├─ request_params (JSON string)
├─ error_message (string)
├─ error_stack (string)
├─ error_params (string, for debugging)
├─ offset, page_size, next_offset (pagination)
├─ is_done (boolean)
├─ created_at (ISO timestamp)
```

### Querying SyncLog

**Find slow endpoints (>1000ms):**
```javascript
const slowLogs = await base44.entities.SyncLog.filter({
  operation: 'relay_endpoint',
  status: 'success'
}, '-duration_ms', 100);

slowLogs
  .filter(log => log.duration_ms > 1000)
  .forEach(log => console.log(`${log.endpoint_or_step}: ${log.duration_ms}ms`));
```

**Track sync progress:**
```javascript
const syncLogs = await base44.entities.SyncLog.filter({
  operation: 'sync_step',
  tenant_id: 'Glencore_ECM',
  endpoint_or_step: 'composition'
}, '-created_at', 50);

syncLogs.forEach(log => {
  console.log(`${log.endpoint_or_step} @ offset ${log.offset}: done=${log.is_done}`);
});
```

**Analyze errors with context:**
```javascript
const errors = await base44.entities.SyncLog.filter({
  status: 'error'
}, '-created_at', 100);

errors.forEach(err => {
  console.log(`[${err.operation}] ${err.endpoint_or_step}`);
  console.log(`  Error: ${err.error_message}`);
  console.log(`  Params: ${err.request_params}`);
  console.log(`  Stack: ${err.error_stack?.substring(0, 200)}...`);
});
```

**Daily metrics:**
```javascript
const today = new Date();
today.setHours(0, 0, 0, 0);

const todayLogs = await base44.entities.SyncLog.filter({
  created_at: { $gte: today.toISOString() }
}, null, 10000);

const summary = {
  total: todayLogs.length,
  success: todayLogs.filter(l => l.status === 'success').length,
  errors: todayLogs.filter(l => l.status === 'error').length,
  avg_duration: todayLogs.reduce((a, b) => a + b.duration_ms, 0) / todayLogs.length,
  total_rows: todayLogs.reduce((a, b) => a + b.row_count, 0),
};
console.log(summary);
```

---

## Troubleshooting Workflow

### 1. **Check for Errors**
```bash
# Console
docker logs <container> 2>&1 | grep -i error

# Or via SyncLog
GET /admin → Query SyncLog where status='error'
```

### 2. **Identify Slow Endpoints**
```bash
# Console
docker logs <container> | jq 'select(.duration_ms > 1000)'

# Or via SyncLog
Query endpoints with duration_ms > threshold
```

### 3. **Inspect Failed Request Context**
- `error_message` – What failed
- `error_stack` – Where in code
- `request_params` – What params caused it

### 4. **Track Pagination Progress**
For sync steps, check `is_done`, `offset`, `next_offset` to understand which page failed and how many pages remain.

### 5. **Compare Timestamps**
- Replay request at specific time via console logs
- Reproduce via SyncLog query on that timestamp

---

## Best Practices

✅ **Do:**
- Query SyncLog for trend analysis (performance over time, error rates)
- Use console logs for immediate debugging during sync
- Archive old SyncLog entries monthly to control database size
- Set up alerts for errors (`status='error'`)
- Monitor duration trends (alert if avg > 5000ms)

❌ **Don't:**
- Rely solely on console logs for production (they're ephemeral)
- Ignore `error_message` and `request_params` — they're essential for debugging
- Assume pagination is correct without checking `is_done` flag

---

## Sample Admin Dashboard Widget

```javascript
// Real-time sync status
const syncLogs = await base44.entities.SyncLog.filter({
  operation: 'sync_step'
}, '-created_at', 1);

const latest = syncLogs[0];
console.log(`
  Step: ${latest.endpoint_or_step}
  Tenant: ${latest.tenant_id}
  Status: ${latest.status}
  Progress: ${latest.offset + latest.page_size} / ?
  Duration: ${latest.duration_ms}ms
  Done: ${latest.is_done ? 'Yes' : 'No'}
`);
```

---

## Retention & Cleanup

**Recommended policy:**
- Keep last 7 days: real-time debugging
- Aggregate to weekly summary for 90 days: trends
- Delete entries older than 90 days: storage control

```javascript
// Archive old logs (run weekly)
const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
const oldLogs = await base44.entities.SyncLog.filter({
  created_at: { $lt: cutoff.toISOString() }
}, null, 10000);

for (const log of oldLogs) {
  await base44.entities.SyncLog.delete(log.id);
}
``