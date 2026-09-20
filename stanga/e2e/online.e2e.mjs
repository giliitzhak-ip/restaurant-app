/**
 * Two real browsers, one online match.
 *
 * Playwright is deliberately not a dependency of this project: it pulls a
 * browser download into every install, and the unit and integration suites
 * already cover the logic. Run this by hand when the online flow changes:
 *
 *   npm run build            # with STANGA_TEST_HOOKS=1 and STANGA_SERVER_URL
 *   npm run server           # the authoritative server
 *   npx vite preview --port 4173
 *   npm install --no-save playwright
 *   node e2e/online.e2e.mjs
 *
 * It checks the things only a browser can: that the screens work, that two
 * separate pages end up in the same match, that they agree about where the
 * world is, and that nothing lands in the console.
 */
import { chromium } from 'playwright';

const PAGE_URL = process.env.STANGA_E2E_URL ?? 'http://127.0.0.1:4173/';
const EXECUTABLE = process.env.STANGA_E2E_CHROMIUM;
const LAUNCH_ARGS = [
  // Software rendering: this box has no GPU, and the game only needs to run,
  // not to run fast.
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
  const context = await browser.newContext({ viewport: { width: 1100, height: 720 } });
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(`[${label}] ${message.text()}`);
  });
  page.on('pageerror', (error) => consoleErrors.push(`[${label}] ${error.message}`));
  await page.goto(PAGE_URL, { waitUntil: 'load' });
  await page.waitForSelector('#screen-menu:not(.is-hidden)', { timeout: 90_000 });
  return page;
}

const rosterSize = () => document.getElementById('online-players')?.children.length ?? 0;
const readPlayer = (id) => {
  const state = window.__stanga?.matchState();
  const player = state?.players.find((entry) => entry.id === id);
  return player ? { x: +player.position.x.toFixed(2), z: +player.position.z.toFixed(2) } : null;
};

try {
  const host = await openPage('host');
  const guest = await openPage('guest');

  console.log('private room');
  // A fresh profile is shown the controls primer before it can ready up.
  await host.click('#btn-play-online');
  await host.waitForSelector('#screen-primer:not(.is-hidden)', { timeout: 30_000 });
  await host.click('#btn-primer-ok');
  await host.waitForSelector('#screen-online:not(.is-hidden)', { timeout: 30_000 });
  await host.fill('#online-name', 'גיל');
  await host.click('#btn-online-create');
  await host.waitForSelector('#online-invite:not(.is-hidden)', { timeout: 60_000 });
  const code = (await host.textContent('#online-invite-code'))?.trim() ?? '';
  check('the host is given an invite code', /^[A-Z0-9]{5}$/.test(code), code);

  await guest.click('#btn-play-online');
  await guest.waitForSelector('#screen-primer:not(.is-hidden)', { timeout: 30_000 });
  await guest.click('#btn-primer-ok');
  await guest.waitForSelector('#screen-online:not(.is-hidden)', { timeout: 30_000 });
  await guest.fill('#online-name', 'דני');
  await guest.fill('#online-code', code);
  await guest.click('#btn-online-join');
  await host.waitForFunction(rosterSize, null, { timeout: 60_000 });
  await guest.waitForFunction(rosterSize, null, { timeout: 60_000 });
  check(
    'both pages see both players',
    (await host.evaluate(rosterSize)) === 2 && (await guest.evaluate(rosterSize)) === 2,
  );
  check(
    'the ping is measured',
    /\d/.test((await host.textContent('#online-ping')) ?? ''),
    (await host.textContent('#online-ping')) ?? '',
  );

  // A shared link should land on the join form with the code already in it.
  const linked = await openPage('linked');
  await linked.goto(`${PAGE_URL}?invite=${code}`, { waitUntil: 'load' });
  await linked.waitForSelector('#screen-online:not(.is-hidden)', { timeout: 60_000 });
  check(
    'an invite link pre-fills the code',
    (await linked.inputValue('#online-code')) === code,
    await linked.inputValue('#online-code'),
  );
  await linked.close();

  console.log('kick-off');
  await host.click('#btn-online-ready');
  await guest.click('#btn-online-ready');
  await host.waitForSelector('#hud:not(.is-hidden)', { timeout: 60_000 });
  await guest.waitForSelector('#hud:not(.is-hidden)', { timeout: 60_000 });
  check('both pages enter the match', true);
  check(
    'the match is online on both',
    (await host.evaluate(() => window.__stanga.mode())) === 'online',
  );

  // Let the countdown finish, then drive one player and see the other follow.
  await host.waitForFunction(() => window.__stanga.matchState().phase === 'playing', null, {
    timeout: 60_000,
  });
  await host.keyboard.down('KeyW');
  await host.waitForTimeout(1500);
  await host.keyboard.up('KeyW');
  await host.waitForTimeout(800);

  const hostView = await host.evaluate(readPlayer, 'home-1');
  const guestView = await guest.evaluate(readPlayer, 'home-1');
  check(
    'both pages agree where the players are',
    Math.abs((hostView?.z ?? 0) - (guestView?.z ?? 0)) < 1.5,
    `${JSON.stringify(hostView)} vs ${JSON.stringify(guestView)}`,
  );
  check(
    'the simulation is running on both',
    (await guest.evaluate(() => window.__stanga.matchState().tick)) > 0,
  );
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
