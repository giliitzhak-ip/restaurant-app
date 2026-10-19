import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { fixture } from './env';
import { createProject, logout, register, uniqueEmail, waitForSongReady } from './helpers';

test.describe('media isolation between users', () => {
  test('one user can never read or write another user’s media or projects', async ({
    page,
    baseURL,
  }) => {
    // User A creates a project with a song.
    await register(page, { name: 'A', email: uniqueEmail('owner') });
    const projectId = await createProject(page, { title: 'פרטי', song: fixture('song.mp3') });
    await waitForSongReady(page);
    const mediaPath = (await page.getByTestId('song-player').getAttribute('src'))!;
    const assetId = mediaPath.split('/').pop()!;
    expect((await page.request.get(mediaPath)).status()).toBe(200);
    await logout(page);

    // Signed out: no media, no status, no uploads.
    expect((await page.request.get(mediaPath)).status()).toBe(401);
    expect((await page.request.get(`/api/assets/${assetId}`)).status()).toBe(401);

    // User B sees none of it: same 404 as for a non-existent id.
    await register(page, { name: 'B', email: uniqueEmail('intruder') });
    expect((await page.request.get(mediaPath)).status()).toBe(404);
    expect((await page.request.get(`/api/assets/${assetId}`)).status()).toBe(404);
    await page.goto(`/projects/${projectId}`);
    await expect(page.getByRole('heading', { name: 'הדף לא נמצא' })).toBeVisible();
    await page.goto(`/projects/${projectId}/timeline`);
    await expect(page.getByRole('heading', { name: 'הדף לא נמצא' })).toBeVisible();

    const body = readFileSync(fixture('song.mp3'));
    const headers = {
      Origin: baseURL!,
      'Content-Type': 'audio/mpeg',
      'X-File-Name': 'song.mp3',
      'X-Consent': '2026-10-19',
    };
    const intrusion = await page.request.post(
      `/api/uploads?target=project-audio&projectId=${projectId}`,
      {
        data: body,
        headers,
      },
    );
    expect(intrusion.status()).toBe(404);

    // Cross-site requests are refused even for the user's own destinations.
    const own = await createProject(page, { title: 'שלי', song: fixture('song.mp3') });
    const crossSite = await page.request.post(
      `/api/uploads?target=project-audio&projectId=${own}`,
      {
        data: body,
        headers: { ...headers, Origin: 'https://evil.example' },
      },
    );
    expect(crossSite.status()).toBe(403);

    // Uploads without the rights confirmation are refused.
    const noConsent = await page.request.post(
      `/api/uploads?target=project-audio&projectId=${own}`,
      {
        data: body,
        headers: { ...headers, 'X-Consent': '' },
      },
    );
    expect(noConsent.status()).toBe(400);
    expect(await noConsent.json()).toEqual({ error: 'consentRequired' });
  });
});
