import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: '#0e0e0f',
        surface: '#161618',
        border: 'rgba(255,255,255,0.07)',
        muted: '#7a7875',
        dim: '#4a4845',
        cream: '#f0ede8',
        gold: '#c4a96a',
        accent: '#6b9ff0',
        purple: '#a67ff0',
        green: '#4caf82',
        warn: '#f0b84a',
        danger: '#e05a5a',
      },
    },
  },
  plugins: [],
}
export default config
