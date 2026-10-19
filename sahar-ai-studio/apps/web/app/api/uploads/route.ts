import { prisma, type ConsentSubject } from '@sahar/db';
import { EXTENSION_BY_TYPE, MIME_BY_TYPE, type SniffedType } from '@sahar/media';
import { CONSENT_STATEMENTS, MEDIA_JOBS, UPLOADS_PER_HOUR, type ConsentKind } from '@sahar/shared';
import { assetObjectKey } from '@sahar/storage';
import { NextResponse, type NextRequest } from 'next/server';
import { apiError, ApiError, assertSameOrigin, handleApiError, requireApiUser } from '@/lib/api';
import { audit } from '@/lib/audit';
import { findOwnedCharacter } from '@/lib/characters';
import { getServerEnv } from '@/lib/env';
import { getLocale } from '@/lib/i18n/server';
import { logger } from '@/lib/logger';
import { findOwnedProject, projectHasTakes } from '@/lib/projects';
import { enqueueMediaJob } from '@/lib/queue';
import { consumeRateLimit } from '@/lib/rate-limit';
import { getRedis } from '@/lib/redis';
import { getRequestMeta } from '@/lib/request';
import { getStorage } from '@/lib/storage';
import { inspectUpload, UploadRejectedError } from '@/lib/upload-stream';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Target = 'project-audio' | 'character-reference';

const TARGETS: Record<
  Target,
  { allowed: SniffedType[]; consent: ConsentKind; subject: ConsentSubject; maxMb: () => number }
> = {
  'project-audio': {
    allowed: ['mp3', 'wav'],
    consent: 'MUSIC',
    subject: 'MUSIC',
    maxMb: () => getServerEnv().MAX_AUDIO_UPLOAD_MB,
  },
  'character-reference': {
    allowed: ['jpeg', 'png', 'webp'],
    consent: 'FACE_LIKENESS',
    subject: 'FACE_LIKENESS',
    maxMb: () => getServerEnv().MAX_IMAGE_UPLOAD_MB,
  },
};

function cleanFilename(raw: string | null): string {
  let name = 'upload';
  try {
    name = raw ? decodeURIComponent(raw) : name;
  } catch {
    /* keep default */
  }
  // Display only: control characters and path separators are dropped.
  // eslint-disable-next-line no-control-regex -- matching control characters is the point
  return name.replace(/[\u0000-\u001f\u007f/\\]/g, '').slice(0, 200) || 'upload';
}

/**
 * Streams one file into private storage.
 *
 *   POST /api/uploads?target=project-audio&projectId=…           (MP3/WAV)
 *   POST /api/uploads?target=character-reference&characterId=…   (JPEG/PNG/WebP)
 *
 * Body: the raw file. Headers: Content-Length, X-File-Name (URI-encoded),
 * X-Consent (version of the consent statement the user accepted).
 */
export async function POST(request: NextRequest) {
  let assetId: string | null = null;
  let committed = false;
  try {
    const user = await requireApiUser();
    assertSameOrigin(request);

    const target = request.nextUrl.searchParams.get('target') as Target | null;
    const config = target ? TARGETS[target] : undefined;
    if (!target || !config) return apiError(400, 'invalidTarget');

    const statement = CONSENT_STATEMENTS[config.consent];
    if (request.headers.get('x-consent') !== statement.version)
      return apiError(400, 'consentRequired');

    const maxBytes = config.maxMb() * 1024 * 1024;
    const declared = Number(request.headers.get('content-length'));
    if (!Number.isFinite(declared) || declared <= 0) return apiError(411, 'lengthRequired');
    if (declared > maxBytes) return apiError(413, 'tooLarge');
    if (!request.body) return apiError(400, 'empty');

    const limit = await consumeRateLimit(
      getRedis(),
      { name: 'upload:user', limit: UPLOADS_PER_HOUR, windowMs: 60 * 60_000 },
      user.id,
    );
    if (!limit.allowed) return apiError(429, 'rateLimited');

    // Ownership of the destination is checked before reading the body.
    let projectId: string | null = null;
    let characterId: string | null = null;
    let replacing = false;
    if (target === 'project-audio') {
      const project = await findOwnedProject(
        user.id,
        request.nextUrl.searchParams.get('projectId') ?? '',
      );
      if (!project) return apiError(404, 'notFound');
      projectId = project.id;
      replacing = project.masterAudioId !== null;
      if (replacing && (await projectHasTakes(project.id))) return apiError(409, 'projectHasTakes');
    } else {
      const character = await findOwnedCharacter(
        user.id,
        request.nextUrl.searchParams.get('characterId') ?? '',
      );
      if (!character) return apiError(404, 'notFound');
      characterId = character.id;
    }

    const upload = await inspectUpload(request.body, config.allowed, maxBytes, declared);
    const env = getServerEnv();
    const storage = getStorage();
    const asset = await prisma.asset.create({
      data: {
        ownerId: user.id,
        projectId,
        kind: target === 'project-audio' ? 'AUDIO_MASTER' : 'IMAGE_REFERENCE',
        status: 'PENDING_UPLOAD',
        bucket: env.S3_BUCKET,
        // Placeholder (unique) until the id-based key is known.
        storageKey: `pending/${crypto.randomUUID()}`,
        originalFilename: cleanFilename(request.headers.get('x-file-name')),
        mimeType: MIME_BY_TYPE[upload.type],
        sizeBytes: BigInt(declared),
      },
    });
    assetId = asset.id;
    const storageKey = assetObjectKey(
      user.id,
      asset.id,
      `original.${EXTENSION_BY_TYPE[upload.type]}`,
    );
    await prisma.asset.update({ where: { id: asset.id }, data: { storageKey } });

    try {
      await storage.uploadStream(storageKey, upload.stream, MIME_BY_TYPE[upload.type]);
    } catch (error) {
      await storage.delete([storageKey]).catch(() => undefined);
      throw error;
    }
    const { sizeBytes, sha256 } = upload.result();

    const locale = await getLocale();
    const meta = await getRequestMeta();
    const orphanKeys = await prisma.$transaction(async (tx) => {
      const orphans: string[] = [];
      await tx.asset.update({
        where: { id: asset.id },
        data: { status: 'UPLOADED', sizeBytes: BigInt(sizeBytes), sha256 },
      });
      await tx.consentRecord.create({
        data: {
          userId: user.id,
          assetId: asset.id,
          subject: config.subject,
          statement: statement[locale],
          statementVersion: statement.version,
          ipAddress: meta.ipAddress,
        },
      });
      if (projectId) {
        // The previous song is replaced as a whole; its derived data and scenes go with it.
        const previous = await tx.project.findUniqueOrThrow({
          where: { id: projectId },
          select: {
            masterAudio: {
              select: {
                id: true,
                storageKey: true,
                audioAnalysis: {
                  select: { waveformAsset: { select: { id: true, storageKey: true } } },
                },
              },
            },
          },
        });
        await tx.scene.deleteMany({ where: { projectId } });
        await tx.project.update({ where: { id: projectId }, data: { masterAudioId: asset.id } });
        if (previous.masterAudio) {
          const waveform = previous.masterAudio.audioAnalysis?.waveformAsset;
          await tx.asset.deleteMany({
            where: { id: { in: [previous.masterAudio.id, ...(waveform ? [waveform.id] : [])] } },
          });
          orphans.push(previous.masterAudio.storageKey, ...(waveform ? [waveform.storageKey] : []));
        }
      }
      if (characterId) {
        const hasPrimary = await tx.characterReferenceImage.count({
          where: {
            characterId,
            isPrimary: true,
            asset: { status: { notIn: ['FAILED', 'DELETED'] } },
          },
        });
        const count = await tx.characterReferenceImage.count({ where: { characterId } });
        await tx.characterReferenceImage.create({
          data: { characterId, assetId: asset.id, isPrimary: hasPrimary === 0, sortOrder: count },
        });
      }
      return orphans;
    });
    committed = true;

    if (orphanKeys.length > 0) {
      await storage
        .delete(orphanKeys)
        .catch((error) =>
          logger.warn({ err: error, orphanKeys }, 'failed to delete replaced song objects'),
        );
      logger.info({ projectId, assetId: asset.id, replaced: replacing }, 'project song replaced');
    }

    await enqueueMediaJob(
      target === 'project-audio' ? MEDIA_JOBS.analyzeAudio : MEDIA_JOBS.verifyImage,
      asset.id,
    );
    await audit({
      action: target === 'project-audio' ? 'media.audio.upload' : 'media.reference.upload',
      userId: user.id,
      ipAddress: meta.ipAddress,
      metadata: { assetId: asset.id, sizeBytes, sha256, consentVersion: statement.version },
    });

    return NextResponse.json({ assetId: asset.id, status: 'UPLOADED' }, { status: 201 });
  } catch (error) {
    if (assetId) {
      // Not yet attached to anything: remove the row. Attached: keep it, visibly failed.
      await (
        committed
          ? prisma.asset.update({
              where: { id: assetId },
              data: { status: 'FAILED', failureReason: 'upload interrupted' },
            })
          : prisma.asset.delete({ where: { id: assetId } })
      ).catch(() => undefined);
    }
    if (error instanceof UploadRejectedError) return apiError(error.status, error.code);
    if (error instanceof ApiError) return handleApiError(error);
    logger.error({ err: error }, 'upload failed');
    return apiError(500, 'uploadFailed');
  }
}
