// מעתיק את canvaskit.wasm לתיקיית public כדי ש-Skia יעבוד גם בדפדפן (תצוגה מקדימה/בדיקות).
const fs = require('fs');
const path = require('path');
try {
  const src = require.resolve('canvaskit-wasm/bin/full/canvaskit.wasm');
  const dest = path.join(__dirname, '..', 'public', 'canvaskit.wasm');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log('canvaskit.wasm copied to public/');
} catch (e) {
  console.warn('Could not copy canvaskit.wasm (web preview only):', e.message);
}
