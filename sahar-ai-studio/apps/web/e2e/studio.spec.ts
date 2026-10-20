import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { PrismaClient } from '@sahar/db';
import { fixture } from './env';
import {
  createProject,
  logout,
  openMainCharacter,
  register,
  uniqueEmail,
  uploadReference,
  waitForSongReady,
} from './helpers';

const db = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
test.afterAll(async () => {
  await db.$disconnect();
});

async function prepare(page: Page, prefix: string) {
  const email = uniqueEmail(prefix);
  await register(page, { name: 'במאית', email });
  await openMainCharacter(page);
  await uploadReference(page, fixture('reference.jpg'));
  await expect(page.getByTestId('reference-item').first().locator('img')).toBeVisible({
    timeout: 30_000,
  });
  const projectId = await createProject(page, { title: 'סטודיו', song: fixture('song.mp3') });
  await waitForSongReady(page);
  return { email, projectId };
}

async function generate(page: Page, sceneIndex: number) {
  await page.getByTestId('studio-scene').nth(sceneIndex).click();
  await expect(page.getByTestId('studio-scene').nth(sceneIndex)).toHaveAttribute(
    'aria-current',
    'true',
  );
  await page.getByTestId('approve-estimate').check();
  await page.getByTestId('generate').click();
  await expect(page.getByText('המשימה נכנסה לתור.')).toBeVisible();
}

test.describe('AI Singing Studio with the technical test engine', () => {
  test('estimate → approval → queue → real progress → MP4 take that plays inline and downloads', async ({
    page,
  }) => {
    const { email, projectId } = await prepare(page, 'studio');
    await page.goto('/studio');

    // Engine choice: only the Mock engine is selectable, and it is labelled as a test.
    await expect(page.getByTestId('provider-mock')).toContainText('מנוע בדיקה טכני (Mock)');
    await expect(page.getByTestId('provider-mock')).toContainText(
      'סרטון בדיקה טכני — לא נוצר בבינה מלאכותית',
    );
    for (const key of ['local-gpu', 'hedra', 'fal']) {
      await expect(page.getByTestId(`provider-${key}`).getByRole('radio')).toBeDisabled();
    }

    // The estimate is shown before anything happens — $0.00, not billed.
    const estimate = page.getByTestId('cost-estimate');
    await expect(page.getByTestId('estimate-amount')).toHaveText('$0.00');
    await expect(estimate).toContainText('לא יחויב');
    await expect(estimate).toContainText('עיבוד מקומי ב-FFmpeg');
    await expect(estimate).toContainText('1920×1080');

    // No approval, no job.
    await page.getByTestId('generate').click();
    await expect(page.getByTestId('form-error')).toHaveText('יש לאשר את הערכת העלות לפני היצירה.');
    expect(await db.generationJob.count({ where: { projectId } })).toBe(0);

    // Two approved jobs: one renders while the other visibly waits in the queue.
    await generate(page, 2);
    await generate(page, 0);
    const rows = page.getByTestId('job-row');
    await expect(rows).toHaveCount(2);
    await expect(page.locator('[data-testid=job-row][data-status=QUEUED]')).toHaveCount(1, {
      timeout: 10_000,
    });
    const processing = page.locator('[data-testid=job-row][data-status=PROCESSING]');
    await expect(processing).toHaveCount(1, { timeout: 15_000 });
    // Progress comes from FFmpeg via the worker: it must actually move.
    await expect
      .poll(
        async () =>
          Number(
            (await processing
              .getByTestId('job-progress')
              .getAttribute('aria-valuenow')
              .catch(() => '0')) ?? 0,
          ),
        {
          timeout: 20_000,
        },
      )
      .toBeGreaterThan(0);

    await expect(page.locator('[data-testid=job-row][data-status=COMPLETED]')).toHaveCount(2, {
      timeout: 60_000,
    });
    await expect(page.getByTestId('take-video')).toHaveCount(2);

    // Inline playback attributes required by iPhone Safari, and the test label.
    const video = page.getByTestId('take-video').first();
    expect(await video.evaluate((v: HTMLVideoElement) => v.playsInline && v.controls)).toBe(true);
    await expect(page.getByTestId('test-render-badge').first()).toHaveText(
      'סרטון בדיקה טכני — לא נוצר בבינה מלאכותית',
    );
    const src = (await video.getAttribute('src'))!;
    const ranged = await page.request.get(src, { headers: { Range: 'bytes=0-1023' } });
    expect(ranged.status()).toBe(206);
    expect(ranged.headers()['content-type']).toBe('video/mp4');

    // Download: attachment with a descriptive (Hebrew) name; the file is a valid MP4.
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('take-download').first().click(),
    ]);
    expect(download.suggestedFilename()).toBe('סטודיו - scene 1 - take 1 - TEST.mp4');
    const saved = test.info().outputPath('take.mp4');
    await download.saveAs(saved);
    const probe = JSON.parse(
      execFileSync('ffprobe', [
        '-v',
        'error',
        '-print_format',
        'json',
        '-show_streams',
        '-show_format',
        saved,
      ]).toString(),
    );
    const streams = probe.streams.map((s: { codec_name: string }) => s.codec_name).sort();
    expect(streams).toEqual(['aac', 'h264']);
    const bytes = readFileSync(saved);
    expect(bytes.indexOf('moov')).toBeLessThan(bytes.indexOf('mdat'));

    // Persisted: jobs, costs, takes, events and the approval in the audit log.
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    const jobs = await db.generationJob.findMany({
      where: { projectId },
      include: { take: { include: { videoAsset: true } }, events: true, scene: true },
      orderBy: { createdAt: 'asc' },
    });
    expect(jobs).toHaveLength(2);
    for (const job of jobs) {
      expect(job).toMatchObject({ status: 'COMPLETED', providerKey: 'mock', progress: 1 });
      expect(job.estimatedCostUsd?.toString()).toBe('0');
      expect(job.actualCostUsd?.toString()).toBe('0');
      expect(job.approvedAt).not.toBeNull();
      expect(job.events.map((e) => e.toStatus)).toEqual(['QUEUED', 'PROCESSING', 'COMPLETED']);
      expect(job.take?.videoAsset).toMatchObject({
        kind: 'VIDEO_TAKE',
        status: 'READY',
        width: 1920,
        height: 1080,
      });
      const expectedMs = job.scene.endMs - job.scene.startMs;
      expect(Math.abs(job.take!.videoAsset!.durationMs! - expectedMs)).toBeLessThan(150);
      expect(job.scene).toMatchObject({ status: 'READY', selectedTakeId: job.take!.id });
    }
    const audits = await db.auditLog.findMany({
      where: { userId: user.id, action: 'generation.request' },
    });
    expect(audits).toHaveLength(2);

    // The scene editor shows the selected take.
    await page.goto(`/projects/${projectId}/scenes`);
    await expect(page.getByTestId('selected-take')).toHaveCount(2);

    // The rendering queue lists the jobs across projects.
    await page.goto('/renders');
    await expect(page.getByTestId('job-row')).toHaveCount(2);

    // Another user cannot see the jobs or their videos.
    await logout(page);
    await register(page, { name: 'זר', email: uniqueEmail('stranger') });
    const ids = jobs.map((job) => job.id).join(',');
    expect(await (await page.request.get(`/api/generations?ids=${ids}`)).json()).toEqual([]);
    expect((await page.request.get(src)).status()).toBe(404);
  });

  test('a running job can be cancelled and leaves no take', async ({ page }) => {
    const { projectId } = await prepare(page, 'cancel');
    await page.goto('/studio');
    await generate(page, 0);
    const row = page.getByTestId('job-row').first();
    await expect(row).toHaveAttribute('data-status', /QUEUED|PROCESSING/);
    page.once('dialog', (dialog) => dialog.accept());
    await row.getByTestId('job-cancel').click();
    await expect(row).toHaveAttribute('data-status', 'CANCELLED', { timeout: 15_000 });
    await expect(row.getByTestId('job-status')).toHaveText('בוטל');

    // Give the worker time to notice; nothing may be stored for a cancelled job.
    await page.waitForTimeout(3_000);
    const job = await db.generationJob.findFirstOrThrow({
      where: { projectId },
      include: { take: true },
    });
    expect(job.status).toBe('CANCELLED');
    expect(job.take).toBeNull();
    expect(await db.asset.count({ where: { projectId, kind: 'VIDEO_TAKE' } })).toBe(0);
  });

  test('settings show the test engine as operational and paid providers as not connected', async ({
    page,
  }) => {
    await register(page, { name: 'הגדרות', email: uniqueEmail('settings3') });
    await page.goto('/settings');
    await expect(page.getByTestId('provider-operational-mock')).toHaveText('פעיל');
    await expect(page.getByTestId('provider-status')).toContainText('מתוכנן לשלב 4');
  });
});
