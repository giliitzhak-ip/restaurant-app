/**
 * Builds the standalone GET SERVICE simulator.
 *
 * The bundle imports the application's real service modules and UI primitives
 * straight from `lib/` and `components/`; only Next.js' own runtime pieces are
 * aliased to the shims in `simulator/src/shims`, since there is no Next server
 * here. Output lands in `simulator/dist/` and is a plain static page.
 */
import { execFile } from 'node:child_process';
import { copyFile, mkdir, rm, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import * as esbuild from 'esbuild';

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const dist = resolve(here, 'dist');

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const shim = (name) => resolve(here, 'src/shims', name);

await esbuild.build({
  entryPoints: [resolve(here, 'src/main.tsx')],
  outfile: resolve(dist, 'simulator.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2021'],
  jsx: 'automatic',
  minify: true,
  sourcemap: false,
  absWorkingDir: root,
  tsconfig: resolve(root, 'tsconfig.json'),
  define: { 'process.env.NODE_ENV': '"production"' },
  alias: {
    'next/link': shim('link.tsx'),
    'next/image': shim('image.tsx'),
    'next/navigation': shim('navigation.ts'),
    'server-only': shim('empty.ts'),
  },
  logLevel: 'info',
});

// Tailwind scans the simulator plus every app file the bundle pulls in.
await run(
  'npx',
  [
    'tailwindcss',
    '-i', resolve(root, 'app/globals.css'),
    '-o', resolve(dist, 'simulator.css'),
    '--minify',
    '--content',
    [
      resolve(here, 'src/**/*.{ts,tsx}'),
      resolve(root, 'components/**/*.{ts,tsx}'),
      resolve(root, 'lib/**/*.{ts,tsx}'),
    ].join(','),
  ],
  { cwd: root },
);

await copyFile(resolve(here, 'index.html'), resolve(dist, 'index.html'));

for (const file of ['index.html', 'simulator.js', 'simulator.css']) {
  const { size } = await stat(resolve(dist, file));
  console.log(`  ${file.padEnd(14)} ${(size / 1024).toFixed(1)} KB`);
}
console.log('\n✅ simulator/dist ready — open index.html');
