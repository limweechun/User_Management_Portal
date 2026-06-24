import type { Config } from 'tailwindcss'

// Premium-SaaS density per the blueprint: tight tracking, slate text, emerald accents.
// Emerald + slate are Tailwind defaults, so the blueprint's utility classes work as-is.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config
