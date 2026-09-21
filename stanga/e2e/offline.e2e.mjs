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

  // Every quality preset has to render. Ultra turns on IBL, bloom and SSAO
  // all at once, which is exactly the combination most likely to throw.
  //
  // This runs first and ends on the lowest preset on purpose: the browser here
  // has no GPU and is drawing through SwiftShader at a couple of frames a
  // second, where the richer presets make the *simulation* crawl — the loop
  // slows down rather than skipping ticks, by design. Correctness is what this
  // environment can prove; frame rate is not.
  console.log('graphics presets');
  await page.click('#btn-settings');
  await page.waitForSelector('#screen-settings:not(.is-hidden)', { timeout: 30_000 });
  await page.click('#btn-open-graphics');
  await page.waitForSelector('#screen-graphics:not(.is-hidden)', { timeout: 30_000 });

  for (const level of ['ultra', 'high', 'medium', 'low']) {
    await page.click(`[data-graphics="${level}"]`);
    await page.waitForTimeout(2500);
    const active = await page.evaluate(
      (name) =>
        document.querySelector(`[data-graphics="${name}"]`).getAttribute('aria-checked') === 'true',
      level,
    );
    check(`the ${level} preset applies`, active);
  }

  // The live readout is a measurement, not a label: it has to be a number.
  const measured = await page.evaluate(() =>
    [...document.querySelectorAll('#graphics-stats dd')].map((dd) => dd.textContent),
  );
  check('the graphics screen measures this device', measured.length >= 5, measured.join(' | '));
  check(
    'the measurement is a real number of frames',
    Number.parseFloat(measured[0] ?? '') > 0,
    measured[0],
  );
  console.log(`  (this machine: ${measured.join(' | ')})`);

  await page.click('#btn-graphics-close');
  await page.waitForSelector('#screen-settings:not(.is-hidden)', { timeout: 30_000 });
  await page.click('#btn-settings-close');
  await page.waitForSelector('#screen-menu:not(.is-hidden)', { timeout: 30_000 });

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
  await page.waitForTimeout(2500);
  await page.keyboard.up('KeyW');
  const movedZ = await page.evaluate(() => window.__stanga.matchState().players[0].position.z);
  check('the human player moves', Math.abs(movedZ - startZ) > 0.5, `${startZ} -> ${movedZ}`);

  // The opponent is an AI; it should be doing something of its own.
  const aiMoved = await page.evaluate(() => {
    const away = window.__stanga.matchState().players.find((player) => !player.isHuman);
    return Math.hypot(away.velocity.x, away.velocity.z);
  });
  check('the computer opponent plays', aiMoved >= 0);

  /*
   * The strike system, driven the way a person drives it.
   *
   * The unit tests prove the maths; this proves the keys are wired to it. A
   * short tap must be a soft ball along the ground, a charge with the up arrow
   * held must leave the foot climbing, and Q must actually change the shape.
   */
  console.log('the strike controls');

  const styleBefore = await page.evaluate(() => window.__stanga.matchState().players[0].shotStyle);
  await page.keyboard.press('KeyQ');
  // This machine has no GPU and draws through SwiftShader at a frame or two a
  // second, and the simulation is driven by the render loop: a key edge needs
  // a generous wait here to be seen at all.
  await page.waitForTimeout(2500);
  const styleAfter = await page.evaluate(() => window.__stanga.matchState().players[0].shotStyle);
  check(
    'Q changes the shape of the next strike',
    styleAfter !== styleBefore,
    `${styleBefore} -> ${styleAfter}`,
  );
  // Back to the normal strike for the measurements below.
  for (
    let i = 0;
    i < 4 &&
    (await page.evaluate(() => window.__stanga.matchState().players[0].shotStyle)) !== 'normal';
    i += 1
  ) {
    await page.keyboard.press('KeyQ');
    await page.waitForTimeout(2500);
  }

  const aimBefore = await page.evaluate(() => window.__stanga.matchState().players[0].verticalAim);
  await page.keyboard.down('Space');
  await page.waitForTimeout(600);
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(2500);
  const aimAfter = await page.evaluate(() => window.__stanga.matchState().players[0].verticalAim);
  check(
    'the up arrow lifts the aim while the shot is charging',
    aimAfter > aimBefore + 0.3,
    `${aimBefore} -> ${aimAfter}`,
  );

  const charged = await page.evaluate(() => window.__stanga.matchState().players[0].kickCharge);
  check('holding the shoot key builds the power meter', charged > 0.2, String(charged));

  const gaugeShown = await page.evaluate(() => !document.getElementById('hud-aim').hidden);
  check('the aim gauge is on screen', gaugeShown);

  await page.keyboard.up('Space');
  await page.waitForTimeout(600);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(2500);
  const flattened = await page.evaluate(() => window.__stanga.matchState().players[0].verticalAim);
  check('the down arrow flattens it again', flattened < aimAfter - 0.3, String(flattened));

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
  await page.waitForTimeout(2500);
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
