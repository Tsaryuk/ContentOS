import Link from 'next/link'
import { DollarSign, Users, Activity, ArrowRight } from 'lucide-react'
import { Card } from '@/components/ui/card'

export const metadata = { title: 'Админка · ContentOS' }

interface CardItem {
  href: string
  title: string
  description: string
  icon: JSX.Element
  accent: string
  comingSoon?: boolean
}

const CARDS: CardItem[] = [
  {
    href: '/admin/costs',
    title: 'Стоимость AI',
    description: 'Расходы на Claude, Whisper, fal, Recraft — по дням, задачам и проектам',
    icon: <DollarSign className="w-5 h-5" />,
    accent: 'text-emerald-500',
  },
  {
    href: '/admin/status',
    title: 'Состояние системы',
    description: 'Статус подключённых сервисов: Supabase, Redis, AI-провайдеры',
    icon: <Activity className="w-5 h-5" />,
    accent: 'text-sky-500',
  },
  {
    href: '#',
    title: 'Пользователи и доступы',
    description: 'Управление учётными записями команды и ролями (admin / manager)',
    icon: <Users className="w-5 h-5" />,
    accent: 'text-violet-500',
    comingSoon: true,
  },
]

export default function AdminHome() {
  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <header className="mb-10">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-2 uppercase tracking-wider">
          ContentOS
          <span className="w-1 h-1 rounded-full bg-border" />
          <span className="normal-case tracking-normal">Администрирование</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-semibold text-foreground tracking-tight">Админка</h1>
        <p className="text-sm text-muted-foreground mt-2">Управление платформой ContentOS — стоимость, статус, доступы.</p>
      </header>

      <div className="grid md:grid-cols-2 gap-4">
        {CARDS.map(c => {
          const inner = (
            <>
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-xl bg-muted/40 flex items-center justify-center ${c.accent}`}>
                  {c.icon}
                </div>
                <h3 className="text-base font-semibold text-foreground tracking-tight">{c.title}</h3>
                {c.comingSoon && (
                  <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">Скоро</span>
                )}
                {!c.comingSoon && (
                  <ArrowRight className="ml-auto w-4 h-4 text-muted-foreground/50 group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
                )}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{c.description}</p>
            </>
          )
          if (c.comingSoon) {
            return (
              <Card key={c.title} className="p-5 opacity-60">
                {inner}
              </Card>
            )
          }
          return (
            <Link key={c.href} href={c.href} className="group">
              <Card className="p-5 hover:shadow-card-hover transition-shadow">
                {inner}
              </Card>
            </Link>
          )
        })}
      </div>

      <p className="text-xs text-muted-foreground mt-10">
        Доступ только для пользователей с ролью <code className="text-foreground/70 bg-muted/50 px-1.5 py-0.5 rounded">admin</code>.
      </p>
    </div>
  )
}
