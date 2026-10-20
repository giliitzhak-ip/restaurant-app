# SAHAR AI STUDIO — Database Schema

PostgreSQL 16, managed by Prisma 6. Source of truth:
[`packages/db/prisma/schema.prisma`](packages/db/prisma/schema.prisma). Migrations live in
`packages/db/prisma/migrations` and are applied with `pnpm db:deploy` (production) or
`pnpm db:migrate` (development). Never edit the database by hand.

Conventions: `cuid` string IDs; `createdAt`/`updatedAt` on mutable rows; soft delete
(`deletedAt`) for user-facing content; money as `Decimal(12,4)` USD; raw provider units
(e.g. credits) as `Decimal(14,4)` + `unitName`; times inside a song in integer
milliseconds.

## Entity relationships

```
User ─┬─< Session
      ├─< AuditLog
      ├─< ConsentRecord >── Asset
      ├─< Asset
      ├─< Character ─┬─< CharacterReferenceImage ── Asset (1:1)
      │              ├─< CharacterClothingPreset
      │              └─< CharacterStylePreset
      ├─< Project ─┬── masterAudio: Asset (1:1, immutable song) ── AudioAnalysis (1:1)
      │            ├─< LyricLine
      │            ├─< Scene ─┬─< Take ── Asset (video, 1:1)
      │            │          │     └── GenerationJob (1:1)
      │            │          └── selectedTake: Take (1:1)
      │            ├─< GenerationJob ─< GenerationJobEvent
      │            └─< RenderJob ── outputAsset: Asset (1:1)
      ├─< GenerationJob
      └─< RenderJob
WebhookEvent (standalone, deduplicated per provider)
```

## Tables

### Identity & security

| Model        | Purpose                      | Key fields / constraints                                                                                                                                                                                                           |
| ------------ | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **User**     | Account                      | `email` unique (stored lower-case), `passwordHash` (scrypt, self-describing format), `locale` (`he` default / `en`), `role`, `monthlyBudgetUsd` (null ⇒ billable generation blocked until set), `termsAcceptedAt` + `termsVersion` |
| **Session**  | Login session                | `tokenHash` unique = SHA-256 of the cookie token (raw token never stored), `expiresAt` (sliding), `lastSeenAt`, `ipAddress`, `userAgent`; cascade on user delete; indexed by `expiresAt` for purge                                 |
| **AuditLog** | Security/billing audit trail | `action` (e.g. `auth.login.success`, `auth.login.failure`, `auth.register`, `auth.logout`), optional `userId`, `target*`, `metadata`                                                                                               |

### Media

| Model             | Purpose                                                           | Key fields / constraints                                                                                                                                                                                                                                   |
| ----------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Asset**         | Any stored object (song, reference image, take, render, waveform) | `kind`, `status` (`PENDING_UPLOAD → UPLOADED → VERIFYING → READY` / `FAILED` / `DELETED`), `bucket` + `storageKey` (unique, server-generated), declared `mimeType`/`sizeBytes`, `sha256` computed after upload, media dimensions/duration, `failureReason` |
| **ConsentRecord** | Usage-rights / consent attestations                               | `subject` (`FACE_LIKENESS`, `VOICE`, `MUSIC`, `OTHER_MEDIA`), exact `statement` text + `statementVersion`, optional `assetId`, `acceptedAt`, `ipAddress`                                                                                                   |

**Immutability of the song:** `Project.masterAudioId` references an `AUDIO_MASTER` asset
with `onDelete: Restrict`. Application code never overwrites a `READY` master asset;
replacing the song means uploading a new asset. Analysis results are stored separately in
`AudioAnalysis`.

### Characters

| Model                       | Purpose                       | Key fields / constraints                                                                                                    |
| --------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Character**               | Reusable singer identity      | `name`, `description`, `defaultAppearance` (prompt text), `presetKey` (e.g. `sharona-sahar`; unique per owner), soft delete |
| **CharacterReferenceImage** | Approved reference photos     | `assetId` unique, `isPrimary`, `sortOrder`, `label`                                                                         |
| **CharacterClothingPreset** | Outfit prompt fragments       | `name`, `description`, `sortOrder`                                                                                          |
| **CharacterStylePreset**    | Visual style prompt fragments | `name`, `description`, `sortOrder`                                                                                          |

Character-specific generation history = `GenerationJob` rows filtered by `characterId`.

### Projects, audio, scenes

| Model             | Purpose                                        | Key fields / constraints                                                                                                                                                                                                                                                                                 |
| ----------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Project**       | A music video                                  | `title`, `status`, `aspectRatio` (`LANDSCAPE_16_9` / `PORTRAIT_9_16`), `outputWidth`×`outputHeight`, `fps`, `masterAudioId`, `mainCharacterId` (default identity for every scene)                                                                                                                        |
| **AudioAnalysis** | Derived facts about the song                   | `durationMs`, `sampleRate`, `channels`, `codec`, `bitRate`, `silenceRegions` JSON `[{startMs,endMs}]`, `waveformAssetId`, `tempoConfidence` (always when detection ran), `tempoBpm` / `beatTimesMs` (only when confidence ≥ 0.3), `tempoAlternativeBpm` (half/double-tempo ambiguity), `analyzerVersion` |
| **LyricLine**     | User-provided lyrics for manual timing         | `position` (unique per project), `text`, optional `startMs`/`endMs`                                                                                                                                                                                                                                      |
| **Scene**         | A time segment of the song                     | `position`, `startMs`, `endMs`, `offsetMs` (manual A/V correction), `characterId`, `referenceImageId`, `providerKey`, `prompt`, `status`, `selectedTakeId`                                                                                                                                               |
| **Take**          | One generated (or corrected) video for a scene | `takeNumber` (unique per scene), `generationJobId`, `videoAssetId`, `trimStartMs`/`trimEndMs`, `notes`. Takes are never deleted when regenerating, preserving history and enabling A/B comparison                                                                                                        |

### Generation & cost

| Model                  | Purpose                                          | Key fields / constraints                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **GenerationJob**      | One approved billable (or mock) provider request | `providerKey`, `operation` (`AUDIO_TO_VIDEO` / `LIP_SYNC`), `status`, **`idempotencyKey` unique**, `providerJobId` (unique per provider), frozen `inputSnapshot`, `estimatedCostUsd` / `estimatedUnits` / `unitName`, **`approvedAt` (required — a job cannot exist without approval)**, lifecycle timestamps, `attempts`, `progress` (0..1, real provider progress), `nextPollAt`, `errorCode`/`errorMessage`, `actualCostUsd` / `actualUnits` / `actualCostReportedAt` |
| **GenerationJobEvent** | Append-only status history                       | `fromStatus`, `toStatus`, `message`, `payload`                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **WebhookEvent**       | Received provider webhooks                       | `signatureValid`, `payload`, `processedAt`; unique `(providerKey, externalEventId)` drops duplicate deliveries                                                                                                                                                                                                                                                                                                                                                           |

Status machine:

```
QUEUED ──▶ SUBMITTING ──▶ PROCESSING ──▶ COMPLETED
   │            │              │
   │            │              ├──▶ FAILED
   │            │              └──▶ CANCELLED (if provider supports it)
   │            └──▶ NEEDS_RECONCILIATION  (submit outcome unknown — never auto-resubmitted)
   └──▶ CANCELLED
```

Reports are aggregate queries:

- per scene: `SUM(actualCostUsd ?? estimatedCostUsd) WHERE sceneId = …`
- per project: same grouped by `projectId`
- monthly budget: same over `ownerId` and `approvedAt` in the current calendar month
  (UTC), including in-flight jobs, checked inside the approval transaction
- failed generations: `status IN (FAILED, NEEDS_RECONCILIATION)`

### Rendering

| Model         | Purpose          | Key fields / constraints                                                                                                                                                       |
| ------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **RenderJob** | Final MP4 export | `status`, `progress` (0..1 from FFmpeg `-progress`, null until reported), `settings` JSON (resolution, fps, aspect, codec params), `outputAssetId`, `errorMessage`, timestamps |

## Indexes worth knowing

- `Session(expiresAt)` — purge job
- `GenerationJob(status, nextPollAt)` — polling fallback scheduler
- `Project(ownerId, updatedAt)` — project library ordering
- `AuditLog(userId, createdAt)`, `AuditLog(action, createdAt)`
