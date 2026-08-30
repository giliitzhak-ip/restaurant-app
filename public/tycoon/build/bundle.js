#!/usr/bin/env node
/**
 * Inline every stylesheet and script into one self-contained HTML file.
 *
 * Two flavours:
 *   node build/bundle.js                 → dist/meridian-fieldops.html (full page)
 *   node build/bundle.js --fragment      → dist/meridian-fieldops.fragment.html
 *
 * The fragment form omits <!doctype>/<html>/<head>/<body> for hosts that supply
 * their own document skeleton, and carries the html/body styling those tags
 * would otherwise have provided via class attributes.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'dist');
const fragment = process.argv.includes('--fragment');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Guard against a stylesheet or script accidentally closing its own tag. */
const safe = (code) => code.replace(/<\/(style|script)>/gi, '<\\/$1>');

// ── Collect assets in document order ────────────────────────────────────────
const styles = [...html.matchAll(/<link[^>]+href="((?:css|js)\/[^"]+)"[^>]*>/g)].map((m) => m[1]);
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);

if (!styles.length || !scripts.length) {
  throw new Error('Bundler found no local styles or scripts — has index.html changed shape?');
}

const css = styles.map((rel) => `/* ${rel} */\n${read(rel)}`).join('\n');
const js = scripts.map((rel) => `/* ${rel} */\n${read(rel)}`).join('\n;\n');

// ── Rewrite the document body ───────────────────────────────────────────────
let body = html
  .replace(/<link[^>]+href="(?:css|js)\/[^"]+"[^>]*>\s*/g, '')
  .replace(/<script src="[^"]+"><\/script>\s*/g, '');

const bodyMatch = body.match(/<body([^>]*)>([\s\S]*)<\/body>/);
if (!bodyMatch) throw new Error('Could not locate <body> in index.html');
const bodyClass = (bodyMatch[1].match(/class="([^"]*)"/) || [, ''])[1];
const markup = bodyMatch[2];

const title = (html.match(/<title>([^<]*)<\/title>/) || [, 'Meridian Field Ops'])[1];
const fonts = [...html.matchAll(/<link[^>]+href="(https:\/\/fonts\.[^"]+)"[^>]*>/g)]
  .map((m) => m[0])
  .join('\n');

// Rules the <html class> and <body class> attributes carried in the multi-file
// build, restated as CSS so a host-supplied skeleton needs no attributes.
const shell = `
/* bundled shell */
html, body { height: 100%; }
body {
  margin: 0;
  overflow: hidden;
  background: #060a13;
  color: #e2e8f0;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
}
`;

const head = `<title>${title}</title>\n${fonts}\n<style>\n${safe(css)}${shell}</style>`;
const tail = `<script>\n${safe(js)}\n</script>`;

let out;
if (fragment) {
  out = `${head}\n<div id="fieldops-root" class="${bodyClass}">${markup}</div>\n${tail}\n`;
  // The app positions its overlays against the viewport, so the wrapper must
  // not become a containing block; it is a pass-through, not a layout box.
  out = out.replace('/* bundled shell */', '/* bundled shell */\n#fieldops-root { display: contents; }');
} else {
  out = `<!DOCTYPE html>
<html lang="en" class="h-full">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#060a13">
<meta name="mobile-web-app-capable" content="yes">
${head}
</head>
<body class="${bodyClass}">
${markup}
${tail}
</body>
</html>
`;
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const file = path.join(OUT_DIR, fragment ? 'meridian-fieldops.fragment.html' : 'meridian-fieldops.html');
fs.writeFileSync(file, out);

const kb = (Buffer.byteLength(out) / 1024).toFixed(0);
console.log(`Wrote ${path.relative(process.cwd(), file)} (${kb} KB, ${styles.length} stylesheets, ${scripts.length} scripts)`);
