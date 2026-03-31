'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Image, Clock, CheckCircle, AlertCircle, Trash2 } from 'lucide-react'

interface CarouselItem {
  id: string
  topic: string
  preset: string
  slide_count: number
  status: string
  illustration_url: string | null
  created_at: string
}

const STATUS_MAP: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  draft:      { label: 'Черновик',      color: 'text-muted',     icon: <Clock className="w-3 h-3" /> },
  generating: { label: 'Генерация...',  color: 'text-yellow-500', icon: <Clock className="w-3 h-3 animate-spin" /> },
  ready:      { label: 'Готово',        color: 'text-green-500',  icon: <CheckCircle className="w-3 h-3" /> },
  exported:   { label: 'Экспортировано', color: 'text-accent',    icon: <CheckCircle className="w-3 h-3" /> },
  error:      { label: 'Ошибка',        color: 'text-red-500',    icon: <AlertCircle className="w-3 h-3" /> },
}

export default function CarouselsPage() {
  const router = useRouter()
  const [carousels, setCarousels] = useState<CarouselItem[]>([])
  const [loading, setLoading] = useState(true)

  function loadCarousels() {
    fetch('/api/carousel/get')
      .then(r => r.json())
      .then(data => setCarousels(data.carousels ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadCarousels() }, [])

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    if (!confirm('Удалить карусель?')) return
    await fetch('/api/carousel/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setCarousels(prev => prev.filter(c => c.id !== id))
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold">Карусели</h1>
          <p className="text-xs text-muted mt-0.5">Instagram / TikTok карусели с автогенерацией</p>
        </div>
        <button
          onClick={() => router.push('/carousels/new')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-xs font-bold hover:opacity-90 transition-opacity"
        >
          <Plus className="w-3.5 h-3.5" />
          Новая карусель
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-muted text-center py-12">Загрузка...</div>
      ) : carousels.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl border-2 border-dashed border-border flex items-center justify-center mx-auto mb-4">
            <Image className="w-7 h-7 text-muted" />
          </div>
          <div className="text-sm font-semibold mb-1">Каруселей пока нет</div>
          <div className="text-xs text-muted mb-4">Создай первую карусель — введи тему и получи готовые слайды</div>
          <button
            onClick={() => router.push('/carousels/new')}
            className="px-4 py-2 rounded-lg bg-accent text-white text-xs font-bold hover:opacity-90"
          >
            Создать карусель
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {carousels.map(c => {
            const st = STATUS_MAP[c.status] ?? STATUS_MAP.draft
            return (
              <button
                key={c.id}
                onClick={() => router.push(`/carousels/${c.id}`)}
                className="bg-bg-surface border border-border rounded-xl p-4 text-left hover:border-gray-400 transition-colors group"
              >
                {/* Preview thumbnail */}
                <div className="w-full aspect-[4/5] rounded-lg mb-3 overflow-hidden bg-bg flex items-center justify-center">
                  {c.illustration_url ? (
                    <img src={c.illustration_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Image className="w-8 h-8 text-muted" />
                  )}
                </div>

                <div className="text-sm font-semibold line-clamp-2 mb-1 group-hover:text-accent transition-colors">
                  {c.topic}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted">{c.slide_count} слайдов</span>
                  <span className={`flex items-center gap-1 text-[10px] font-semibold ${st.color}`}>
                    {st.icon} {st.label}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px] text-muted">
                    {new Date(c.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                  </span>
                  <button
                    onClick={(e) => handleDelete(e, c.id)}
                    className="text-muted hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                    title="Удалить"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
