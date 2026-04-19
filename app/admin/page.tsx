import Link from 'next/link'
import { DollarSign, Users, Activity } from 'lucide-react'

export const metadata = { title: 'Админка · ContentOS' }

interface Card {
  href: string
  title: string
  description: string
  icon: JSX.Element
  accent: string
  comingSoon?: boolean
}

const CARDS: Card[] = [
  {
    href: '/admin/costs',
    title: 'Стоимость AI',
    description: 'Расходы на Claude, Whisper, fal, Recraft — по дням, задачам и проектам',
    icon: <DollarSign className="w-5 h-5" />,
    accent: 'from-emerald-500/20 to-emerald-500/5',
  },
  {
    href: '#',
    title: 'Пользователи и доступы',
    description: 'Управление учётными записями команды и ролями (admin / manager)',
    icon: <Users className="w-5 h-5" />,
    accent: 'from-violet-500/20 to-violet-500/5',
    comingSoon: true,
  },
  {
    href: '/admin/status',
    title: 'Состояние системы',
    description: 'Статус подключённых сервисов: Supabase, Redis, AI-провайдеры',
    icon: <Activity className="w-5 h-5" />,
    accent: 'from-sky-500/20 to-sky-500/5',
  },
]

export default function AdminHome() {
  return (
    <div className="p-8 max-w-5xl mx-auto">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-cream">Админка</h1>
        <p className="text-sm text-muted mt-1">Управление платформой ContentOS</p>
      </header>

      <div className="grid md:grid-cols-2 gap-4">
        {CARDS.map(c => (
          c.comingSoon ? (
            <div
              key={c.title}
              className={`relative rounded-xl border border-border bg-gradient-to-br ${c.accent} p-5 opacity-50`}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-surface flex items-center justify-center text-cream">
                  {c.icon}
                </div>
                <h3 className="text-base font-medium text-cream">{c.title}</h3>
                <span className="ml-auto text-[10px] uppercase tracking-wider text-dim">Скоро</span>
              </div>
              <p className="text-xs text-muted leading-relaxed">{c.description}</p>
            </div>
          ) : (
            <Link
              key={c.href}
              href={c.href}
              className={`group relative rounded-xl border border-border bg-gradient-to-br ${c.accent} p-5 hover:border-accent/50 transition-colors`}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg bg-surface flex items-center justify-center text-cream">
                  {c.icon}
                </div>
                <h3 className="text-base font-medium text-cream">{c.title}</h3>
              </div>
              <p className="text-xs text-muted leading-relaxed">{c.description}</p>
            </Link>
          )
        ))}
      </div>

      <p className="text-xs text-dim mt-8">
        Доступ только для пользователей с ролью <code className="text-muted">admin</code>.
      </p>
    </div>
  )
}
