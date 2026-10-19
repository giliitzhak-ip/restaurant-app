import { expect, test, type Page } from '@playwright/test';
import { fixture } from './env';
import {
  createProject,
  openMainCharacter,
  register,
  uniqueEmail,
  uploadReference,
  waitForSongReady,
} from './helpers';

/** Maps song time to page coordinates using the first scene block (which starts at 0). */
async function timelineGeometry(page: Page) {
  const first = page.getByTestId('scene-block').first();
  const box = (await first.boundingBox())!;
  const endMs = Number(await first.getAttribute('data-end'));
  const pxPerMs = box.width / endMs;
  return { x: (ms: number) => box.x + ms * pxPerMs, waveformY: box.y + box.height + 50 };
}

test.describe('projects, audio analysis and timeline', () => {
  test.beforeEach(async ({ page }) => {
    await register(page, { name: 'מפיקה', email: uniqueEmail('proj') });
  });

  test('song upload is analysed: duration, format, silence and tempo', async ({ page }) => {
    await createProject(page, { title: 'שיר הבדיקה', song: fixture('song.mp3') });
    await waitForSongReady(page);

    await expect(page.getByTestId('fact-duration')).toHaveText('0:30.0');
    await expect(page.getByTestId('fact-sample-rate')).toHaveText('44,100 Hz');
    await expect(page.getByTestId('fact-channels')).toHaveText('2');
    await expect(page.getByTestId('fact-codec')).toHaveText('MP3');
    await expect(page.getByTestId('fact-silences')).toHaveText('1');
    await expect(page.getByTestId('fact-tempo')).toContainText('120 BPM');
    await expect(page.getByTestId('scenes-summary')).toHaveText('3 סצנות מתוך השיר');

    // The original file streams back with byte-range support (needed by iPhone Safari).
    const src = await page.getByTestId('song-player').getAttribute('src');
    const ranged = await page.request.get(src!, { headers: { Range: 'bytes=0-99' } });
    expect(ranged.status()).toBe(206);
    expect(ranged.headers()['content-length']).toBe('100');
    expect(ranged.headers()['content-range']).toMatch(/^bytes 0-99\/\d+$/);
    expect(ranged.headers()['accept-ranges']).toBe('bytes');
    const full = await page.request.get(src!);
    expect(full.status()).toBe(200);
    expect(full.headers()['content-type']).toBe('audio/mpeg');

    // The project is listed in the library.
    await page.goto('/projects');
    await expect(page.getByTestId('project-card')).toContainText('שיר הבדיקה');
    await expect(page.getByTestId('project-card')).toContainText('0:30');
  });

  test('WAV songs work too, and invalid songs are rejected with a clear reason', async ({
    page,
  }) => {
    await createProject(page, { title: 'WAV', song: fixture('song.wav') });
    await waitForSongReady(page);
    await expect(page.getByTestId('fact-codec')).toHaveText('PCM_S16LE');
    await expect(page.getByTestId('fact-duration')).toHaveText('0:30.0');

    // Looks like MP3 (valid frame header) but does not decode → failed by the worker.
    await createProject(page, { title: 'פגום', song: fixture('corrupt.mp3') });
    const status = page.getByTestId('song-card').getByTestId('asset-status');
    await expect(status).toHaveAttribute('data-status', 'FAILED', { timeout: 30_000 });
    await expect(page.getByTestId('asset-failure')).toContainText(
      'הקובץ אינו בפורמט נתמך או שהוא פגום.',
    );

    // Not audio at all → refused at upload, before storage.
    await page.goto('/projects/new');
    await page.getByLabel('שם הקליפ').fill('טקסט');
    await page.getByTestId('song-input').setInputFiles(fixture('not-audio.mp3'));
    await page.getByTestId('song-consent').check();
    await page.getByTestId('create-project').click();
    await expect(page.getByTestId('form-error')).toContainText('סוג הקובץ אינו נתמך');
  });

  test('timeline: seek, split, drag, save, auto-proposal — all persisted', async ({ page }) => {
    const projectId = await createProject(page, { title: 'ציר זמן', song: fixture('song.mp3') });
    await waitForSongReady(page);
    await page.goto(`/projects/${projectId}/timeline`);
    const blocks = page.getByTestId('scene-block');
    await expect(blocks).toHaveCount(3);
    // The proposal cut inside the known silence (9.67 s – 12.1 s).
    const firstEnd = Number(await blocks.first().getAttribute('data-end'));
    expect(firstEnd).toBeGreaterThan(9_670);
    expect(firstEnd).toBeLessThan(12_100);

    // Seek by tapping the waveform at 5 s, then split there.
    let geo = await timelineGeometry(page);
    await page.mouse.click(geo.x(5_000), geo.waveformY);
    await expect(page.getByTestId('timeline-time')).toContainText(/^0:0(4\.9|5\.0|5\.1)/);
    await page.getByTestId('timeline-split').click();
    await expect(blocks).toHaveCount(4);
    await expect(page.getByTestId('timeline-status')).toContainText('יש שינויים שלא נשמרו');

    // Drag the boundary at 5 s to ~7 s.
    geo = await timelineGeometry(page);
    const handle = page.getByTestId('boundary-handle').first();
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 80);
    await page.mouse.down();
    await page.mouse.move(geo.x(7_000), box.y + 80, { steps: 10 });
    await page.mouse.up();
    const dragged = Number(await blocks.first().getAttribute('data-end'));
    expect(Math.abs(dragged - 7_000)).toBeLessThan(150);

    await page.getByTestId('timeline-save').click();
    await expect(page.getByText('החלוקה נשמרה.')).toBeVisible();

    await page.reload();
    await expect(blocks).toHaveCount(4);
    expect(
      Math.abs(Number(await blocks.first().getAttribute('data-end')) - dragged),
    ).toBeLessThanOrEqual(1);

    // Merge the first two scenes back together.
    await blocks.first().click();
    await page.getByTestId('timeline-merge').click();
    await expect(blocks).toHaveCount(3);

    // Automatic proposal replaces the layout after confirmation.
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByTestId('timeline-auto').click();
    await expect(blocks).toHaveCount(3);
    await page.getByTestId('timeline-save').click();
    await expect(page.getByText('החלוקה נשמרה.')).toBeVisible();

    // Keyboard: boundaries are sliders that move in 100 ms steps.
    const slider = page.getByTestId('boundary-handle').first();
    const startValue = Number(await slider.getAttribute('aria-valuenow'));
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await expect(slider).toHaveAttribute('aria-valuenow', String(startValue + 100));
  });

  test('scenes keep the main character identity unless changed explicitly', async ({ page }) => {
    // Approved reference image first, so new scenes pick it up.
    await openMainCharacter(page);
    await uploadReference(page, fixture('reference.png'));
    await expect(page.getByTestId('reference-item').first().locator('img')).toBeVisible({
      timeout: 30_000,
    });

    const projectId = await createProject(page, { title: 'זהות', song: fixture('song.mp3') });
    await waitForSongReady(page);
    await page.goto(`/projects/${projectId}/scenes`);
    const cards = page.getByTestId('scene-card');
    await expect(cards).toHaveCount(3);
    for (const card of await cards.all()) {
      await expect(card.getByLabel('דמות', { exact: true })).toHaveValue(/.+/);
      await expect(card.getByLabel('תמונת ייחוס')).not.toHaveValue('');
      await expect(card.locator('img')).toBeVisible();
      await expect(card.getByTestId('identity-warning')).toHaveCount(0);
    }

    // A per-scene prompt is saved.
    const first = cards.first();
    await first.getByLabel('הנחיה לסצנה').fill('תקריב, תאורה חמה');
    await first.getByRole('button', { name: 'שמירת הסצנה' }).click();
    await expect(first.getByText('הסצנה נשמרה.')).toBeVisible();

    // Deviating from the main identity is flagged.
    const second = cards.nth(1);
    await second.getByLabel('תמונת ייחוס').selectOption('');
    await expect(second.getByTestId('identity-warning')).toBeVisible();
    await second.getByRole('button', { name: 'שמירת הסצנה' }).click();
    await expect(second.getByText('הסצנה נשמרה.')).toBeVisible();

    await page.reload();
    await expect(cards.first().getByLabel('הנחיה לסצנה')).toHaveValue('תקריב, תאורה חמה');
    await expect(cards.nth(1).getByTestId('identity-warning')).toBeVisible();

    // One action restores the main character and primary image everywhere.
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByTestId('apply-main').click();
    await expect(
      page.getByText('כל הסצנות משתמשות עכשיו בדמות הראשית ובתמונה הראשית שלה.'),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('identity-warning')).toHaveCount(0);

    // A reference image used by scenes cannot be deleted out from under them.
    await openMainCharacter(page);
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByTestId('reference-item').first().getByRole('button', { name: 'מחיקה' }).click();
    await expect(page.getByTestId('form-error')).toContainText('התמונה בשימוש ב-3 סצנות');
  });

  test('replacing the song re-analyses it and rebuilds the scenes', async ({ page }) => {
    await createProject(page, { title: 'החלפה', song: fixture('song.mp3') });
    await waitForSongReady(page);
    await page.getByText('החלפת השיר', { exact: true }).first().click();
    await page.getByTestId('song-upload-input').setInputFiles(fixture('song.wav'));
    await page.getByTestId('song-upload-consent').check();
    await page.getByTestId('song-upload-submit').click();
    await expect(page.getByTestId('fact-codec')).toHaveText('PCM_S16LE', { timeout: 30_000 });
    await expect(page.getByTestId('scenes-summary')).toHaveText('3 סצנות מתוך השיר');
  });
});
