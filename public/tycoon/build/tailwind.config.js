/**
 * Tailwind build configuration for Meridian Field Ops.
 * The compiled stylesheet is committed at css/tailwind.css so the game runs
 * with no build step and no CDN. Regenerate with build/build-css.sh.
 */
module.exports = {
  content: [
    './public/tycoon/index.html',
    './public/tycoon/js/**/*.js'
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace']
      },
      colors: {
        ink: { 950: '#060a13', 900: '#0a1020', 850: '#0d1526', 800: '#111c31', 700: '#1a2942' }
      }
    }
  },
  plugins: []
};
