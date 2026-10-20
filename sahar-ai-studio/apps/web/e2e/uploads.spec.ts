import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { fixture } from './env';
import {
  createProject,
  openMainCharacter,
  register,
  uniqueEmail,
  uploadReference,
  waitForSongReady,
} from './helpers';

test.describe('upload matrix', () => {
  test.beforeEach(async ({ page }) => {
    await register(page, { name: 'מעלה', email: uniqueEmail('uploads') });
  });

  test('images: WebP accepted; oversize, HEIC and video refused', async ({ page, baseURL }) => {
    await openMainCharacter(page);
    const characterId = page.url().split('/').pop()!;

    await uploadReference(page, fixture('reference.webp'));
    const item = page.getByTestId('reference-item').first();
    await expect(item.locator('img')).toBeVisible({ timeout: 30_000 });
    expect(await item.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(
      640,
    );

    // Too large: refused in the browser before uploading…
    await uploadReference(page, fixture('large.png'));
    await expect(page.getByTestId('form-error')).toHaveText('הקובץ גדול מדי (עד 5MB).');
    // …and by the server if the browser check is bypassed.
    const big = readFileSync(fixture('large.png'));
    const direct = await page.request.post(
      `/api/uploads?target=character-reference&characterId=${characterId}`,
      {
        data: big,
        headers: {
          Origin: baseURL!,
          'Content-Type': 'image/png',
          'X-File-Name': 'large.png',
          'X-Consent': '2026-10-19',
        },
      },
    );
    expect(direct.status()).toBe(413);
    expect(await direct.json()).toEqual({ error: 'tooLarge' });

    // HEIC (iOS converts library photos to JPEG; a raw HEIC file is refused) and MP4.
    for (const name of ['photo.heic', 'clip.mp4']) {
      await uploadReference(page, fixture(name));
      await expect(page.getByTestId('form-error')).toContainText('סוג הקובץ אינו נתמך');
    }
    await page.reload();
    await expect(page.getByTestId('reference-item')).toHaveCount(1);
  });

  test('songs: MP3 with cover art, 24-bit/48 kHz mono WAV, Hebrew filename; video refused', async ({
    page,
  }) => {
    await createProject(page, { title: 'עטיפה', song: fixture('song-cover.mp3') });
    await waitForSongReady(page);
    await expect(page.getByTestId('fact-codec')).toHaveText('MP3');
    await expect(page.getByTestId('fact-channels')).toHaveText('2');

    await createProject(page, {
      title: 'רזולוציה גבוהה',
      song: fixture('song-48k-24bit-mono.wav'),
    });
    await waitForSongReady(page);
    await expect(page.getByTestId('fact-sample-rate')).toHaveText('48,000 Hz');
    await expect(page.getByTestId('fact-channels')).toHaveText('1');
    await expect(page.getByTestId('fact-codec')).toHaveText('PCM_S24LE');
    await expect(page.getByTestId('fact-tempo')).toContainText('120 BPM');

    await createProject(page, {
      title: 'שם בעברית',
      song: {
        name: 'שיר שלי.mp3',
        mimeType: 'audio/mpeg',
        buffer: readFileSync(fixture('song.mp3')),
      },
    });
    await waitForSongReady(page);
    await expect(page.getByTestId('song-card')).toContainText('שיר שלי.mp3');

    await page.goto('/projects/new');
    await page.getByLabel('שם הקליפ').fill('וידאו');
    await page.getByTestId('song-input').setInputFiles(fixture('clip.mp4'));
    await page.getByTestId('song-consent').check();
    await page.getByTestId('create-project').click();
    await expect(page.getByTestId('form-error')).toContainText('סוג הקובץ אינו נתמך');
  });
});
