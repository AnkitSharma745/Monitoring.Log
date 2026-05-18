/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{html,ts,tsx}', './src/preload/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"Cascadia Mono"', '"SFMono-Regular"', 'Consolas', 'monospace'],
      },
      boxShadow: {
        panel: '0 18px 48px rgb(0 0 0 / 0.28)',
        glow: '0 0 0 1px rgb(77 163 255 / 0.18), 0 18px 48px rgb(0 0 0 / 0.24)',
      },
    },
  },
};
