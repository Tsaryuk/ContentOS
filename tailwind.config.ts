import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--bg-surface)',
        'bg-sidebar': 'var(--bg-sidebar)',
        border: 'var(--border)',
        cream: 'var(--text-primary)',
        muted: 'var(--text-secondary)',
        dim: 'var(--text-tertiary)',
        accent: 'var(--accent)',
        purple: 'var(--purple)',
        green: 'var(--green)',
        warn: 'var(--warn)',
        gold: '#c4a96a',
        danger: '#e05a5a',
      },
      boxShadow: {
        'surface': 'var(--shadow)',
      },
    },
  },
  plugins: [],
}
export default config
