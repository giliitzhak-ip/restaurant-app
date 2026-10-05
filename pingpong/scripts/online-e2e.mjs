// End-to-end online test in real browsers (two separate browser contexts = two devices):
// create room, join by invite link, room-full / bad-code errors, ready, play with the
// mouse, drop one connection and verify automatic reconnection.
// Usage: node scripts/online-e2e.mjs [screenshotDir]   (server must be running, URL env optional)
import { chromium } from 'playwright-core';

const out = process.argv[2] ?? 'screenshots';
const base = process.env.URL ?? 'http://localhost:8080';
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const mk = async (name, lang) => {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
  await ctx.addInitScript(
    ([n, l]) => localStorage.setItem('pingpong3d.settings.v1', JSON.stringify({ lang: l, quality: 'low', name: n, tutorialDone: true, showFps: true })),
    [name, lang],
  );
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  return { page, errs };
};

const A = await mk('Gili', 'he');
const B = await mk('Friend', 'en');
await A.page.goto(base);
await A.page.getByText('שחק עם חבר').click();
await A.page.waitForSelector('.conn-open');
await A.page.getByRole('button', { name: 'צור חדר פרטי' }).click();
await A.page.waitForSelector('.room-code');
const code = (await A.page.textContent('.room-code')).trim();
const link = await A.page.inputValue('.invite input');
console.log('room code', code, 'invite', link);
await A.page.screenshot({ path: `${out}/online-1-lobby-host.png` });

// Friend opens the invite link.
await B.page.goto(link);
await B.page.waitForSelector('.room-code');
await A.page.waitForFunction(() => document.querySelectorAll('.player-card:not(.waiting)').length === 2);
await B.page.screenshot({ path: `${out}/online-2-lobby-guest.png` });

// A third device: room full, then a bad code.
const C = await mk('Third', 'en');
await C.page.goto(`${base}/?room=${code}`);
await C.page.waitForSelector('.alert');
console.log('third player sees:', (await C.page.textContent('.alert')).trim());
await C.page.goto(`${base}/?room=ZZZZZ9`);
await C.page.waitForSelector('.alert');
console.log('unknown code sees:', (await C.page.textContent('.alert')).trim());

// Ready up -> game starts on both.
await A.page.getByRole('button', { name: 'אני מוכן!' }).click();
await B.page.getByRole('button', { name: "I'm ready!" }).click();
await A.page.waitForFunction(() => !!window.__pingpong);
await B.page.waitForFunction(() => !!window.__pingpong);

const play = async (ms) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    for (const pl of [A.page, B.page]) {
      const st = await pl.evaluate(() => {
        const g = window.__pingpong;
        const v = g.view();
        const b = v.ball;
        return { s: g.score(), side: v.mySide, aim: g.screenOf(b.x, Math.max(0.8, Math.min(1.5, b.y)), g.paddleZ()) };
      });
      await pl.mouse.move(st.aim.x, st.aim.y);
      if (st.s.phase === 'serve' && st.s.server === st.side) await pl.mouse.click(st.aim.x, st.aim.y);
    }
  }
};
await play(25000);
const sA = await A.page.evaluate(() => window.__pingpong.score());
const sB = await B.page.evaluate(() => window.__pingpong.score());
console.log('score host view', sA.points, sA.phase, '| guest view', sB.points, sB.phase);
await A.page.screenshot({ path: `${out}/online-3-host-game.png` });
await B.page.screenshot({ path: `${out}/online-4-guest-game.png` });

// Drop the guest's socket: host sees the pause banner, guest reconnects by itself.
await B.page.evaluate(() => window.__pingpong.dropConnection());
try {
  await A.page.waitForSelector('.banner.warn', { timeout: 5000 });
  console.log('host sees:', (await A.page.textContent('.banner.warn')).trim());
  await A.page.screenshot({ path: `${out}/online-5-host-paused.png` });
} catch {
  console.log('no pause banner seen (reconnect was instant)');
}
await A.page.waitForFunction(() => !document.querySelector('.banner.warn'), null, { timeout: 20000 });
console.log('resumed after reconnect');
await play(8000);
const sA2 = await A.page.evaluate(() => window.__pingpong.score());
const sB2 = await B.page.evaluate(() => window.__pingpong.score());
console.log('after reconnect: host', sA2.points, sA2.phase, '| guest', sB2.points, sB2.phase);
console.log('host HUD connection:', (await A.page.textContent('.topbar .conn')).trim());
console.log('page errors', A.errs, B.errs, C.errs);
await browser.close();
