/**
 * Four real browsers, one 2×2 match.
 *
 * This is the test the whole of stage 4 is for: four separate pages, a private
 * room, a party of two that asks for opponents, a kick-off, and four people
 * agreeing about where the ball is. Run it the same way as `online.e2e.mjs`:
 *
 *   STANGA_TEST_HOOKS=1 STANGA_SERVER_URL=... npx vite build
 *   npm run server
 *   npx vite preview --port 4173
 *   npm install --no-save playwright
 *   node e2e/twovstwo.e2e.mjs
 */
import { chromium } from 'playwright';

const PAGE_URL = process.env.STANGA_E2E_URL ?? 'http://127.0.0.1:4173/';
const EXECUTABLE = process.env.STANGA_E2E_CHROMIUM;
const LAUNCH_ARGS = [
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--no-sandbox',
  '--disable-dev-shm-usage',
];

const failures = [];
function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures.push(`${label} ${detail}`.trim());
    console.log(`  FAIL ${label} ${detail}`);
  }
}

const browser = await chromium.launch({
  ...(EXECUTABLE ? { executablePath: EXECUTABLE } : {}),
  args: LAUNCH_ARGS,
});

const consoleErrors = [];
async function openPage(label) {
  const context = await browser.newContext({ viewport: { width: 900, height: 620 } });
  // Four software-rendered pages on one box: the lowest preset is the only
  // honest setting here, and the presets have their own test.
  await context.addInitScript(() => {
    window.localStorage.setItem('stanga.settings.v1', JSON.stringify({ quality: 'low' }));
  });
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(`[${label}] ${message.text()}`);
  });
  page.on('pageerror', (error) => consoleErrors.push(`[${label}] ${error.message}`));
  await page.goto(PAGE_URL, { waitUntil: 'load' });
  await page.waitForSelector('#screen-menu:not(.is-hidden)', { timeout: 90_000 });
  return page;
}

/** Opens the 2×2 online screen, clearing the primer a fresh profile gets. */
async function enterTwoVsTwo(page, name) {
  await page.click('#btn-play-online-2v2');
  await page.waitForSelector('#screen-primer:not(.is-hidden)', { timeout: 30_000 });
  await page.click('#btn-primer-ok');
  await page.waitForSelector('#screen-online:not(.is-hidden)', { timeout: 30_000 });
  await page.fill('#online-name', name);
}

const seatedCount = () =>
  document.querySelectorAll('#online-teams .online__seat:not(.is-empty)').length;
const seatCount = () => document.querySelectorAll('#online-teams .online__seat').length;
const ballPosition = () => {
  const state = window.__stanga?.matchState();
  return state
    ? { x: +state.ball.position.x.toFixed(2), z: +state.ball.position.z.toFixed(2) }
    : null;
};

try {
  const pages = [];
  for (const label of ['a', 'b', 'c', 'd']) pages.push(await openPage(label));
  const [host, friend, first, second] = pages;

  console.log('a private room for four');
  await enterTwoVsTwo(host, 'גיל');
  await host.click('#btn-online-create');
  await host.waitForSelector('#online-invite:not(.is-hidden)', { timeout: 60_000 });
  const code = (await host.textContent('#online-invite-code'))?.trim() ?? '';
  check('the host is given an invite code', /^[A-Z0-9]{5}$/.test(code), code);
  check('the lobby shows four seats', (await host.evaluate(seatCount)) === 4);
  check(
    'the seat counter reads one of four',
    ((await host.textContent('#online-seats')) ?? '').trim() === '1/4',
    (await host.textContent('#online-seats')) ?? '',
  );

  await enterTwoVsTwo(friend, 'דני');
  await friend.fill('#online-code', code);
  await friend.click('#btn-online-join');
  await host.waitForFunction(
    () => document.querySelectorAll('#online-teams .online__seat:not(.is-empty)').length === 2,
    null,
    { timeout: 60_000 },
  );
  check('the friend takes a seat', (await host.evaluate(seatedCount)) === 2);

  console.log('a party asks for opponents');
  // The pair put themselves on the same side, then open the room up.
  const hostTeam = await host.evaluate(() => window.__stanga.onlineTeam());
  const friendTeam = await friend.evaluate(() => window.__stanga.onlineTeam());
  if (hostTeam !== friendTeam) {
    await friend.click('#btn-online-switch');
    await friend.waitForTimeout(1200);
  }
  check(
    'the friends are on the same side',
    (await friend.evaluate(() => window.__stanga.onlineTeam())) === hostTeam,
  );

  await host.waitForSelector('#btn-online-open:not(.is-hidden)', { timeout: 30_000 });
  await host.click('#btn-online-open');
  await host.waitForFunction(() => window.__stanga.onlineRoom().isPrivate === false, null, {
    timeout: 30_000,
  });
  check('the room joins matchmaking', true);

  // Two strangers now find it by ordinary quick match.
  for (const [page, name] of [
    [first, 'נועה'],
    [second, 'רון'],
  ]) {
    await enterTwoVsTwo(page, name);
    await page.click('#btn-online-quick');
    await page.waitForSelector('#online-room:not(.is-hidden)', { timeout: 60_000 });
  }
  await host.waitForFunction(
    () => document.querySelectorAll('#online-teams .online__seat:not(.is-empty)').length === 4,
    null,
    { timeout: 90_000 },
  );
  check('all four are in the same room', (await host.evaluate(seatedCount)) === 4);
  check(
    'the seat counter reads four of four',
    ((await host.textContent('#online-seats')) ?? '').trim() === '4/4',
  );
  check(
    'nobody was moved off their team',
    (await friend.evaluate(() => window.__stanga.onlineTeam())) === hostTeam &&
      (await first.evaluate(() => window.__stanga.onlineTeam())) !== hostTeam,
  );

  console.log('kick-off');
  for (const page of pages) await page.click('#btn-online-ready');
  for (const page of pages) {
    await page.waitForSelector('#hud:not(.is-hidden)', { timeout: 90_000 });
  }
  for (const page of pages) {
    await page.waitForFunction(() => window.__stanga.matchState().phase === 'playing', null, {
      timeout: 90_000,
    });
  }
  check('all four pages entered the match', true);
  check(
    'every page is simulating four players',
    (
      await Promise.all(
        pages.map((page) => page.evaluate(() => window.__stanga.matchState().players.length)),
      )
    ).every((count) => count === 4),
  );

  // One player runs at the ball; everybody should see roughly the same thing.
  await host.keyboard.down('KeyW');
  await host.waitForTimeout(2500);
  await host.keyboard.up('KeyW');
  await host.waitForTimeout(1200);

  const views = await Promise.all(pages.map((page) => page.evaluate(ballPosition)));
  const spread =
    Math.max(...views.map((v) => v?.z ?? 0)) - Math.min(...views.map((v) => v?.z ?? 0));
  check(
    'all four pages agree where the ball is',
    spread < 2,
    views.map((v) => JSON.stringify(v)).join(' '),
  );
  check(
    'every page is ticking',
    (
      await Promise.all(pages.map((page) => page.evaluate(() => window.__stanga.matchState().tick)))
    ).every((tick) => tick > 0),
  );

  console.log('quick chat');
  await host.click('[data-quick-chat="pass"]');
  await friend.waitForFunction(() => !document.getElementById('hud-chat').hidden, null, {
    timeout: 20_000,
  });
  const heard = (await friend.textContent('#hud-chat')) ?? '';
  check('a team-mate hears the phrase', heard.includes('מסור'), heard);

  check(
    'nothing was written to the console',
    consoleErrors.length === 0,
    consoleErrors.join(' | '),
  );
} finally {
  await browser.close();
}

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
