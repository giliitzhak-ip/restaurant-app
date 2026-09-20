import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The simulator is a deliverable that travels on its own.
 *
 * It is opened from a download, an AirDrop, a file:// URL — never from a
 * server we control — so there is no HTTP header to tell the browser
 * anything about it. Everything the page needs to be read correctly has to
 * be inside the page.
 *
 * It was not. The file was UTF-8 and declared no encoding, so iOS Safari
 * guessed a legacy single-byte one and rendered every Hebrew character as
 * mojibake: "סימולטור הממשק" arrived as "×¡×™×ž×•×œ×˜×•×¨ ×”×ž×ž×©×§".
 * Reproduced by serving the file with an unlabelled Content-Type —
 * document.characterSet came back windows-1252. Only ASCII survived, which
 * is why `matching_events` and `10,000` read correctly in the middle of the
 * wreckage and made it look like a font problem rather than an encoding one.
 *
 * A browser check would not have caught it: Chromium on Linux sniffs its way
 * to UTF-8 and the page looked perfect right up until it was opened on a
 * phone. So the assertions here are on the FILE, which is the thing that
 * ships.
 */
describe('the simulator page carries its own head', () => {
  const PAGE = 'docs/demo/getservice-simulator.html';
  const bytes = readFileSync(PAGE);
  const html = bytes.toString('utf8');

  it('declares UTF-8 inside the first 1024 bytes', () => {
    // The limit is the spec's: a browser stops looking for the declaration
    // after 1024 bytes, so a charset further down is a charset that is not
    // there.
    const head = bytes.subarray(0, 1024).toString('utf8');
    expect(head).toMatch(/<meta\s+charset=["']?utf-8["']?\s*\/?>/i);
  });

  it('is actually UTF-8, so the declaration is true', () => {
    // Round-tripping through a strict decode: invalid sequences become
    // U+FFFD, and a file that survives unchanged is valid UTF-8.
    expect(Buffer.from(html, 'utf8').equals(bytes)).toBe(true);
    expect(html).not.toContain('�');
  });

  it('carries no mojibake, which is what a double-encode would leave', () => {
    // If the file were ever saved through a Latin-1 round trip, Hebrew would
    // come back as these sequences. Cheap to check, and the symptom is
    // invisible to anyone reading the diff in a terminal that renders it.
    expect(html).not.toMatch(/×[\u0080-¿]|Ã[\u0080-¿]{2}/);
  });

  it('still contains Hebrew, so the check above cannot pass vacuously', () => {
    expect(html).toMatch(/[֐-׿]/);
    expect(html).toContain('סימולטור הממשק');
  });

  it('opens in standards mode rather than quirks mode', () => {
    // Without a doctype document.compatMode is "BackCompat", and the CSS
    // below it was written against the standard box model.
    expect(html.slice(0, 200)).toMatch(/^\s*<!doctype html>/i);
  });

  it('tells a phone to lay out at device width', () => {
    // Without this, mobile Safari lays out at ~980px and scales down, so a
    // page designed at phone width arrives shrunken.
    const head = bytes.subarray(0, 1024).toString('utf8');
    expect(head).toMatch(/<meta\s+name=["']viewport["'][^>]*width=device-width/i);
  });

  it('holds a recording, not a placeholder', () => {
    // Guards the other failure mode: a splice that half-wrote the constant.
    const start = html.indexOf('const PROVIDERS = [');
    const end = html.indexOf('\n];', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = html.slice(start, end);
    expect(block.match(/recordedScore:/g)?.length ?? 0).toBeGreaterThanOrEqual(20);
  });
});
