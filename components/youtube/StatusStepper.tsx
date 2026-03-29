'use client'

import { Check, Loader2 } from 'lucide-react'

const STEPS = [
  { key: 'pending', label: 'Ожидание' },
  { key: 'transcribing', label: 'Транскрипция' },
  { key: 'generating', label: 'AI генерация' },
  { key: 'thumbnail', label: 'Обложка' },
  { key: 'review', label: 'Проверка' },
  { key: 'publishing', label: 'Публикация' },
  { key: 'done', label: 'Готово' },
]

const STATUS_ORDER = STEPS.map(s => s.key)

export function StatusStepper({ status }: { status: string }) {
  const currentIdx = STATUS_ORDER.indexOf(status)
  const isError = status === 'error'

  return (
    <div className="flex items-center gap-1 overflow-x-auto py-2">
      {STEPS.map((step, idx) => {
        const isDone = !isError && (currentIdx > idx || (status === 'done' && currentIdx === idx))
        const isCurrent = !isError && currentIdx === idx && status !== 'done'
        const isActive = isDone || isCurrent

        return (
          <div key={step.key} className="flex items-center">
            <div className="flex items-center gap-1.5">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0 ${
                isDone ? 'bg-emerald-500/20 text-emerald-400' :
                isCurrent ? 'bg-purple-500/20 text-purple-400' :
                'bg-surface text-dim'
              }`}>
                {isDone ? <Check className="w-3.5 h-3.5" /> :
                 isCurrent ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
                 <span>{idx + 1}</span>}
              </div>
              <span className={`text-xs whitespace-nowrap ${
                isActive ? 'text-cream' : 'text-dim'
              }`}>{step.label}</span>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={`w-4 h-px mx-1 ${isDone ? 'bg-emerald-500/30' : 'bg-border'}`} />
            )}
          </div>
        )
      })}
      {isError && (
        <div className="flex items-center gap-1.5 ml-2">
          <div className="w-6 h-6 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center text-xs">!</div>
          <span className="text-xs text-red-400">Ошибка</span>
        </div>
      )}
    </div>
  )
}
