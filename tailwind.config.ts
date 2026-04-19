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
        // ── shadcn-compatible layer ────────────────────────────────────
        background:      'var(--background)',
        foreground:      'var(--foreground)',
        card: {
          DEFAULT:       'var(--card)',
          foreground:    'var(--card-foreground)',
        },
        popover: {
          DEFAULT:       'var(--popover)',
          foreground:    'var(--popover-foreground)',
        },
        primary: {
          DEFAULT:       'var(--primary)',
          foreground:    'var(--primary-foreground)',
        },
        destructive: {
          DEFAULT:       'var(--destructive)',
          foreground:    'var(--destructive-foreground)',
        },
        input: 'var(--input)',
        ring:  'var(--ring)',
        sidebar: {
          DEFAULT:         'var(--sidebar)',
          foreground:      'var(--sidebar-foreground)',
          accent:          'var(--sidebar-accent)',
          'accent-foreground': 'var(--sidebar-accent-foreground)',
          border:          'var(--sidebar-border)',
          ring:            'var(--sidebar-ring)',
          primary:         'var(--sidebar-primary)',
          'primary-foreground': 'var(--sidebar-primary-foreground)',
        },
        chart: {
          1: 'var(--chart-1)',
          2: 'var(--chart-2)',
          3: 'var(--chart-3)',
          4: 'var(--chart-4)',
          5: 'var(--chart-5)',
        },
        // subtle hover/item surface (shadcn calls this 'accent' but we keep
        // `accent` as brand blue below for legacy consumers)
        'accent-surface': {
          DEFAULT:    'var(--accent-surface)',
          foreground: 'var(--accent-surface-foreground)',
        },
        brand: {
          DEFAULT:    'var(--accent)',   // same token as legacy brand blue
          foreground: '#fafafa',
        },
        success: 'var(--success)',
        info:    'var(--info)',
        warn:    'var(--warn)',

        // ── legacy (preserved meaning) ─────────────────────────────────
        bg:              'var(--bg)',
        surface:         'var(--bg-surface)',
        'bg-sidebar':    'var(--bg-sidebar)',
        border:          'var(--border)',
        cream:           'var(--text-primary)',
        // text-muted keeps OLD meaning (a text color), not shadcn's muted surface
        muted:           'var(--text-secondary)',
        'muted-foreground': 'var(--muted-foreground)',
        dim:             'var(--text-tertiary)',
        accent:          'var(--accent)',   // legacy brand blue
        purple:          'var(--purple)',
        green:           'var(--green)',
        gold:            '#c4a96a',
        danger:          'var(--destructive)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        'surface':    'var(--shadow)',
        'card':       '0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.06)',
        'card-hover': '0 6px 16px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.04)',
        'pop':        '0 8px 32px rgba(0,0,0,0.12)',
      },
    },
  },
  plugins: [],
}
export default config
