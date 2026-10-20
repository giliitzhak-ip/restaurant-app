import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { PrismaClient } from '@sahar/db';
import { CONSENT_STATEMENTS, TERMS_VERSION } from '@sahar/shared';
import { storageFromEnv } from '@sahar/storage';
import { fixture } from './env';
import {
  createProject,
  openMainCharacter,
  register,
  uniqueEmail,
  uploadReference,
  waitForSongReady,
} from './helpers';

/** Direct access to what the app persisted — the UI is not trusted to prove it. */
const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
const storage = storageFromEnv({
  S3_ENDPOINT: process.env.S3_ENDPOINT,
  S3_REGION: process.env.S3_REGION ?? 'us-east-1',
  S3_BUCKET: process.env.S3_BUCKET ?? 'sahar-media',
  S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
  S3_FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE !== 'false',
});

const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex');

async function storedBytes(key: string) {
  const object = await storage.get(key);
  const chunks: Buffer[] = [];
  for await (const chunk of object.body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

test.afterAll(async () => {
  await db.$disconnect();
});

test('characters, projects, media and consents are persisted exactly', async ({ page }) => {
  const email = uniqueEmail('persist');
  await register(page, { name: 'שמירה', email });

  const user = await db.user.findUniqueOrThrow({ where: { email } });
  expect(user.passwordHash).toMatch(/^scrypt\$32768\$8\$1\$/);
  expect(user.termsVersion).toBe(TERMS_VERSION);
  expect(user.locale).toBe('he');

  // Preset character exists without any reference image.
  const sharona = await db.character.findFirstOrThrow({
    where: { ownerId: user.id, presetKey: 'sharona-sahar' },
    include: { referenceImages: true, clothingPresets: true, stylePresets: true },
  });
  expect(sharona.name).toBe('שרונה סהר');
  expect(sharona.defaultAppearance).toContain('Young female Mizrahi singer');
  expect(sharona.referenceImages).toHaveLength(0);
  expect(sharona.clothingPresets.map((p) => p.description)).toEqual(['elegant black dress']);

  // Reference image: stored bytes are identical to the upload; consent recorded verbatim.
  await openMainCharacter(page);
  await page.getByLabel('תיאור', { exact: true }).fill('תיאור מעודכן');
  await page.getByTestId('character-form').getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByText('הדמות נשמרה.')).toBeVisible();
  await uploadReference(page, fixture('reference.png'));
  await expect(page.getByTestId('reference-item').first().locator('img')).toBeVisible({
    timeout: 30_000,
  });

  const image = readFileSync(fixture('reference.png'));
  const ref = await db.characterReferenceImage.findFirstOrThrow({
    where: { characterId: sharona.id },
    include: { asset: { include: { consents: true } } },
  });
  expect(ref.isPrimary).toBe(true);
  expect(ref.asset).toMatchObject({
    kind: 'IMAGE_REFERENCE',
    status: 'READY',
    mimeType: 'image/png',
    sha256: sha256(image),
    width: 600,
    height: 800,
    originalFilename: 'reference.png',
  });
  expect(Number(ref.asset.sizeBytes)).toBe(image.length);
  expect(ref.asset.storageKey).toBe(`users/${user.id}/${ref.asset.id}/original.png`);
  expect(sha256(await storedBytes(ref.asset.storageKey))).toBe(sha256(image));
  expect(ref.asset.consents).toHaveLength(1);
  expect(ref.asset.consents[0]).toMatchObject({
    subject: 'FACE_LIKENESS',
    statement: CONSENT_STATEMENTS.FACE_LIKENESS.he,
    statementVersion: CONSENT_STATEMENTS.FACE_LIKENESS.version,
    userId: user.id,
  });
  expect((await db.character.findUniqueOrThrow({ where: { id: sharona.id } })).description).toBe(
    'תיאור מעודכן',
  );

  // Project with song: master asset, analysis, waveform, scenes with identity defaults.
  const projectId = await createProject(page, { title: 'נשמר', song: fixture('song.mp3') });
  await waitForSongReady(page);
  const song = readFileSync(fixture('song.mp3'));
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      masterAudio: {
        include: { audioAnalysis: { include: { waveformAsset: true } }, consents: true },
      },
      scenes: { orderBy: { position: 'asc' } },
    },
  });
  expect(project).toMatchObject({
    ownerId: user.id,
    title: 'נשמר',
    aspectRatio: 'LANDSCAPE_16_9',
    outputWidth: 1920,
    outputHeight: 1080,
    mainCharacterId: sharona.id,
  });
  const master = project.masterAudio!;
  expect(master).toMatchObject({
    kind: 'AUDIO_MASTER',
    status: 'READY',
    mimeType: 'audio/mpeg',
    sha256: sha256(song),
  });
  expect(sha256(await storedBytes(master.storageKey))).toBe(sha256(song));
  expect(master.consents[0]).toMatchObject({
    subject: 'MUSIC',
    statement: CONSENT_STATEMENTS.MUSIC.he,
  });
  expect(master.audioAnalysis).toMatchObject({ sampleRate: 44100, channels: 2, codec: 'mp3' });
  expect(master.audioAnalysis!.waveformAsset).toMatchObject({
    kind: 'WAVEFORM_PEAKS',
    status: 'READY',
  });
  expect(project.scenes.length).toBe(3);
  expect(
    project.scenes.every((s) => s.characterId === sharona.id && s.referenceImageId === ref.id),
  ).toBe(true);
  expect(project.scenes[0]!.startMs).toBe(0);
  expect(project.scenes.at(-1)!.endMs).toBe(master.audioAnalysis!.durationMs);

  // Editing the project persists, including derived output size.
  await page.getByLabel('שם הקליפ').fill('נשמר — עודכן');
  await page.getByText('9:16 לאורך').click();
  await page.getByTestId('project-settings').getByRole('button', { name: 'שמירה' }).click();
  await expect(page.getByText('ההגדרות נשמרו.')).toBeVisible();
  expect(await db.project.findUniqueOrThrow({ where: { id: projectId } })).toMatchObject({
    title: 'נשמר — עודכן',
    aspectRatio: 'PORTRAIT_9_16',
    outputWidth: 1080,
    outputHeight: 1920,
  });

  // Security-relevant actions are in the audit log.
  const actions = (await db.auditLog.findMany({ where: { userId: user.id } })).map((a) => a.action);
  for (const action of [
    'auth.register',
    'character.update',
    'media.reference.upload',
    'project.create',
    'media.audio.upload',
    'project.update',
  ]) {
    expect(actions).toContain(action);
  }

  // Deleting is a soft delete: hidden from the library, row kept.
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByTestId('delete-project').click();
  await expect(page).toHaveURL('/projects');
  await expect(page.getByTestId('project-card')).toHaveCount(0);
  expect(
    (await db.project.findUniqueOrThrow({ where: { id: projectId } })).deletedAt,
  ).not.toBeNull();
});
