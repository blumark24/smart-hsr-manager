'use strict';

/**
 * SMART HSR — production Firestore BACKUP METADATA INSPECTOR (READ ONLY).
 *
 * Run manually by an authorized GCP operations reviewer with an already
 * authenticated least-privilege gcloud identity:
 *     node scripts/firestore-backup-readonly-audit.cjs
 *
 * This cannot create, update, restore, export or delete a backup and never
 * reads Firestore collections/documents or downloads evidence files.
 * Metadata is NOT evidence of completed restoration or deployment approval.
 */
const { execFileSync } = require('node:child_process');

const PROJECT = 'smart-hsr-manager';
const DATABASE = '(default)';
const LOCATION = 'me-central2';
const DATABASE_RESOURCE = 'projects/' + PROJECT + '/databases/' + DATABASE;
const READONLY_ARGS = Object.freeze(['--project=' + PROJECT, '--format=json', '--quiet']);

function parseList(value) {
  const data = JSON.parse(value);
  if (!Array.isArray(data)) throw new Error('UNEXPECTED_METADATA_FORMAT');
  return data;
}

function inspectBackupMetadata(run = execFileSync) {
  // Only read-only metadata listings with pinned project and location.
  const opts = { encoding: 'utf8', timeout: 45000, maxBuffer: 2 * 1024 * 1024 };
  const schedules = parseList(run('gcloud', [
    'firestore', 'backups', 'schedules', 'list',
    '--database=' + DATABASE, ...READONLY_ARGS
  ], opts));
  const backups = parseList(run('gcloud', [
    'firestore', 'backups', 'list',
    '--location=' + LOCATION, ...READONLY_ARGS
  ], opts));

  const schedulesForDb = schedules.filter(x => x && typeof x === 'object' &&
    typeof x.name === 'string' &&
    x.name.startsWith(DATABASE_RESOURCE + '/backupSchedules/'));

  const backupForDb = backups.filter(x => x && typeof x === 'object' &&
    x.database === DATABASE_RESOURCE);
  const verifiedTimestamps = backupForDb
    .filter(x => x.state === 'READY' && typeof x.snapshotTime === 'string' &&
      Number.isFinite(Date.parse(x.snapshotTime)))
    .map(x => new Date(x.snapshotTime).toISOString())
    .sort();

  return Object.freeze({
    project: PROJECT,
    database: DATABASE,
    location: LOCATION,
    check: 'read_only_metadata',
    schedulesDiscovered: schedulesForDb.length,
    backupMetadataDiscovered: backupForDb.length,
    readyBackupsWithValidTimestamp: verifiedTimestamps.length,
    latestReadySnapshotUtc: verifiedTimestamps.at(-1) || null,
    status: schedulesForDb.length > 0 && verifiedTimestamps.length > 0
      ? 'BACKUP_METADATA_PRESENT_RESTORE_UNVERIFIED'
      : 'RECOVERY_METADATA_INCOMPLETE',
    restorationVerified: false,
    complianceReviewed: false,
    productionChangeAuthorized: false,
    releaseDecision: 'HOLD'
  });
}

if (require.main === module) {
  try {
    const report = inspectBackupMetadata();
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    if (report.status !== 'BACKUP_METADATA_PRESENT_RESTORE_UNVERIFIED') {
      process.exitCode = 2;
    }
  } catch (_) {
    // Never print raw CLI errors: stderr can contain sensitive information.
    process.stdout.write(JSON.stringify({
      check: 'read_only_metadata',
      status: 'INSPECTION_UNAVAILABLE_OR_UNAUTHORIZED',
      restorationVerified: false,
      productionChangeAuthorized: false,
      releaseDecision: 'HOLD'
    }, null, 2) + '\n');
    process.exitCode = 3;
  }
}

module.exports = { inspectBackupMetadata, parseList, PROJECT, DATABASE, LOCATION };