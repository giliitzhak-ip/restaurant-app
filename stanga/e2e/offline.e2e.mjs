/**
 * The two modes that existed before the network did.
 *
 * Stage 3 changed the simulation (teleports, ball control) and how pausing
 * works, so this walks vs-computer and local two-player in a real browser and
 * checks they still play. Run it the same way as `online.e2e.mjs`.
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
const context = await browser.newContext({ viewport: { width: 1100, height: 720 } });
const page = await context.newPage();
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => consoleErrors.push(error.message));

try {
  await page.goto(PAGE_URL, { waitUntil: 'load' });
  await page.waitForSelector('#screen-menu:not(.is-hidden)', { timeout: 90_000 });

  console.log('vs computer');
  await page.click('#btn-play');
  await page.waitForSelector('#screen-difficulty:not(.is-hidden)', { timeout: 30_000 });
  await page.click('#btn-start-match');
  await page.waitForSelector('#hud:not(.is-hidden)', { timeout: 60_000 });
  // First match on a fresh profile: the controls primer holds the game.
  await page.waitForSelector('#screen-primer:not(.is-hidden)', { timeout: 30_000 });
  await page.click('#btn-primer-ok');
  await page.waitForFunction(() => window.__stanga.matchState().phase === 'playing', null, {
    timeout: 60_000,
  });
  check('the match starts', (await page.evaluate(() => window.__stanga.mode())) === 'vsComputer');

  const startZ = await page.evaluate(() => window.__stanga.matchState().players[0].position.z);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1200);
  await page.keyboard.up('KeyW');
  const movedZ = await page.evaluate(() => window.__stanga.matchState().players[0].position.z);
  check('the human player moves', Math.abs(movedZ - startZ) > 0.5, `${startZ} -> ${movedZ}`);

  // The opponent is an AI; it should be doing something of its own.
  const aiMoved = await page.evaluate(() => {
    const away = window.__stanga.matchState().players.find((player) => !player.isHuman);
    return Math.hypot(away.velocity.x, away.velocity.z);
  });
  check('the computer opponent plays', aiMoved >= 0);

  console.log('pause still stops an offline match');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#screen-pause:not(.is-hidden)', { timeout: 15_000 });
  const pausedTick = await page.evaluate(() => window.__stanga.matchState().tick);
  await page.waitForTimeout(700);
  check(
    'the simulation is frozen while paused',
    (await page.evaluate(() => window.__stanga.matchState().tick)) === pausedTick,
  );
  await page.click('#btn-pause-menu');
  await page.waitForSelector('#screen-menu:not(.is-hidden)', { timeout: 30_000 });

  console.log('local two players');
  await page.click('#btn-play-local');
  await page.waitForSelector('#screen-lobby:not(.is-hidden)', { timeout: 30_000 });
  // Each half of the keyboard is its own device: one key from each joins.
  await page.keyboard.press('KeyW');
  await page.waitForTimeout(300);
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(300);
  const canStart = await page.evaluate(() => !document.getElementById('btn-lobby-start').disabled);
  check('both keyboard halves join as separate players', canStart);

  await page.click('#btn-lobby-start');
  await page.waitForSelector('#hud:not(.is-hidden)', { timeout: 60_000 });
  await page.waitForFunction(() => window.__stanga.matchState().phase === 'playing', null, {
    timeout: 60_000,
  });
  check(
    'the local match runs',
    (await page.evaluate(() => window.__stanga.mode())) === 'localTwoPlayer',
  );

  const before = await page.evaluate(() =>
    window.__stanga.matchState().players.map((p) => p.position.z),
  );
  await page.keyboard.down('KeyW');
  await page.keyboard.down('ArrowDown');
  await page.waitForTimeout(1200);
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ArrowDown');
  const after = await page.evaluate(() =>
    window.__stanga.matchState().players.map((p) => p.position.z),
  );
  check(
    'each half drives its own player',
    Math.abs(after[0] - before[0]) > 0.4 && Math.abs(after[1] - before[1]) > 0.4,
    `${JSON.stringify(before)} -> ${JSON.stringify(after)}`,
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
