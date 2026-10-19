# Database schema

Source of truth: [`prisma/schema.prisma`](prisma/schema.prisma). PostgreSQL 16 accessed through Prisma 6. The whole domain is modelled from phase 1, so later phases mostly add code, not tables.

## Entity diagram

```
User 1─* Session
User 1─* Project 1─* Asset *─1 ConsentRecord
                 1─* Job   1─* Asset (outputs, "JobOutputs")
                 1─* ProjectEvent
User 1─* ConsentRecord 1─* Voice
User 1─* Voice
User 1─* UsageRecord *─1 Job
```

All child rows cascade on user/project deletion, so "delete my data" is a single `DELETE` plus purging the S3 prefix.

## Tables

| Table | Purpose | Key columns |
|---|---|---|
| `User` | account | `email` (unique, lower-cased), `passwordHash` (bcrypt), `role`, `termsAcceptedAt`, `monthlyBudgetCents` (0 = paid AI disabled), `dailyJobLimit` |
| `Session` | login sessions | `tokenHash` (SHA-256 of cookie token, unique), `expiresAt`, `userAgent`, `ip` |
| `Project` | a workspace | `ownerId`, `name`, `description`, `aspectRatio` ("9:16"/"16:9"/"1:1"), `duplicatedFromId` |
| `Asset` | any file in S3 | `kind` IMAGE/VIDEO/AUDIO, `role` SOURCE/GENERATED/EXPORT, `storageKey` (unique, private), `mimeType`, `sizeBytes`, `checksumSha256`, FFprobe metadata (`width`, `height`, `durationMs`, `fps`, `hasAudio`), **`aiGenerated`**, `consentId`, `producedByJobId` |
| `ConsentRecord` | proof of rights for a face/voice/video | `subject` FACE/VOICE/VIDEO, `relationship` SELF/OTHER_WITH_PERMISSION/OWNED_CONTENT, `subjectName`, exact `statement` + `statementVersion`, `verifiedAt` + `verificationMethod`, `revokedAt`, `ip`, `userAgent` |
| `Voice` | personal voice library | `kind` PRESET/DESIGNED/CLONED, `provider`, `providerVoiceId`, `gender`, `language` (default `he`), `consentId` (required for CLONED, enforced in code; cascades if consent deleted) |
| `Job` | every async AI/FFmpeg task | `type` (MEDIA_PROBE, FACE_DETECT, FACE_SWAP, MOTION_TRANSFER, TTS, VOICE_CLONE, SPEECH_TO_SPEECH, LIP_SYNC, VIDEO_EXPORT), `status` QUEUED/RUNNING/SUCCEEDED/FAILED/CANCELED, `progress` 0–100, `provider`, `providerJobId`, `input`/`output` JSON, `errorCode`, `errorMessage` (Hebrew), `estimatedCostCents`, timestamps |
| `ProjectEvent` | project history panel | `type` (e.g. `asset.uploaded`), Hebrew `message`, `data` JSON |
| `UsageRecord` | cost ledger for limits | `provider`, `unit`, `quantity`, `costCents`, optional `jobId` |

## Indexes

* `Session(userId)`, `Project(ownerId, createdAt)`, `Asset(projectId)`, `Asset(ownerId)`
* `Job(projectId, createdAt)`, `Job(userId, createdAt)`, `Job(status)`
* `ProjectEvent(projectId, createdAt)`, `UsageRecord(userId, createdAt)`, `ConsentRecord(userId)`, `Voice(ownerId)`

## Migrations

```bash
npx prisma migrate dev --name <change>   # development
npx prisma migrate deploy                # production
```

Initial migration: `prisma/migrations/*_init`.
