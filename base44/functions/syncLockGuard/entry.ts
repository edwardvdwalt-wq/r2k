// Tenant sync lock guard - prevents overlapping syncs on tenant steps
export async function checkTenantSyncLock(sr, siteParent, getTenantLockKey, getSingleLock, isLockActive) {
  const activeLock = await getSingleLock(sr, getTenantLockKey(siteParent));
  if (activeLock && isLockActive(activeLock)) {
    const err = new Error('Sync already running for this tenant');
    err.statusCode = 409;
    throw err;
  }
}