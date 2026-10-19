# Backup and Recovery

SAHAR AI STUDIO keeps state in three places. All three must be backed up together for
a consistent restore.

| Store                   | Holds                                                                                   | Loss impact                                                                                |
| ----------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| PostgreSQL              | Users, sessions, projects, characters, scenes, takes, generation jobs, costs, audit log | Critical — the source of truth                                                             |
| S3 bucket (`S3_BUCKET`) | Original songs, reference images, generated takes, renders                              | Critical — originals and paid generations cannot be recreated for free                     |
| Redis                   | Queued/delayed BullMQ jobs, rate-limit counters, worker heartbeat                       | Low — jobs are re-derivable from `GenerationJob`/`RenderJob` rows; counters are disposable |

## PostgreSQL

**Daily logical backup** (keep ≥ 14 daily, ≥ 6 monthly, stored off-host and encrypted):

```bash
# libpq rejects Prisma's ?schema=… parameter, so it is stripped from the URL.
pg_dump --format=custom --no-owner --dbname="${DATABASE_URL%%\?*}" \
  --file="sahar-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

With Docker Compose:

```bash
docker compose exec -T postgres pg_dump -U sahar --format=custom sahar > sahar-$(date -u +%F).dump
```

For production, additionally enable continuous WAL archiving / point-in-time recovery
(managed PostgreSQL services provide this) so the recovery point objective is minutes,
not a day.

**Restore** into an empty database, then apply any newer migrations:

```bash
createdb -U sahar sahar_restore
pg_restore --no-owner --dbname=postgresql://sahar:…@host:5432/sahar_restore sahar-YYYYMMDD.dump
DATABASE_URL=postgresql://…/sahar_restore pnpm db:deploy
```

Point `DATABASE_URL` at the restored database only after verifying it (row counts,
latest `AuditLog.createdAt`, a test login).

## Object storage

- Enable **bucket versioning** and a lifecycle rule that expires non-current versions
  after 30 days — protects against accidental overwrite/delete.
- Replicate to a second bucket/region (S3 replication, R2/B2 sync, or a scheduled
  `rclone sync --immutable`). Uploaded originals are never modified by the application,
  so incremental sync is cheap.
- Development (SeaweedFS): back up the `seaweedfs-data` volume, or sync the bucket with
  any S3 tool using the credentials in `.env`.

Restore by syncing objects back into the bucket configured in `S3_BUCKET`. Object keys
are stable (`users/<userId>/<assetId>/…`) and referenced by `Asset.storageKey`, so a
restored bucket lines up with a restored database from the same point in time.

## Redis

Redis runs with AOF persistence (`--appendonly yes`) in Compose. A Redis loss does
**not** lose user data: on startup the worker re-creates its repeatable jobs, and (from
Phase 3) a reconciliation pass re-enqueues `GenerationJob`/`RenderJob` rows that are
non-terminal. Generation jobs that already have a `providerJobId` are only polled,
never resubmitted, so recovery cannot cause duplicate billable requests.

## Consistency rules

1. Back up PostgreSQL first, then storage, within the same window. Orphan objects
   (present in storage, absent in DB) are harmless; the reverse means missing media, so
   storage backups must not be older than the database backup.
2. Never restore an older database over newer `GenerationJob` rows without exporting
   them first — they are the record of what was billed by providers.

## Recovery drills

Quarterly: restore the latest database dump and a storage snapshot into a scratch
environment, run `pnpm db:deploy`, start the app, log in, and open a project with media.
Record the time taken (recovery time objective) and any gaps found.

## Secrets

`AUTH_SECRET`, database/storage credentials and provider API keys are **not** in any
backup above. Store them in a secrets manager. Rotating `AUTH_SECRET` does not log
users out (sessions are random tokens, not signed with it).
