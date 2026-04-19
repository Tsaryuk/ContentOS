'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Image, Clock, CheckCircle, AlertCircle, Trash2, Sparkles } from 'lucide-react'

interface CarouselItem {
  id: string
  topic: string
  preset: string
  slide_count: number
  status: string
  illustration_url: string | null
  created_at: string
}

interface VoiceItem {
  id: string
  name: string
  summary: string | null
  created_at: string
}

const STATUS_MAP: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  draft:        { label: 'Черновик',       color: 'text-muted-foreground',      icon: <Clock className="w-3 h-3" /> },
  generating:   { label: 'Генерация...',   color: 'text-yellow-500', icon: <Clock className="w-3 h-3 animate-spin" /> },
  illustrating: { label: 'Иллюстрации...', color: 'text-yellow-500', icon: <Clock className="w-3 h-3 animate-spin" /> },
  ready:        { label: 'Готово',         color: 'text-green-500',  icon: <CheckCircle className="w-3 h-3" /> },
  exported:     { label: 'Экспортировано', color: 'text-accent',     icon: <CheckCircle className="w-3 h-3" /> },
  error:        { label: 'Ошибка',         color: 'text-red-500',    icon: <AlertCircle className="w-3 h-3" /> },
}

export default function CarouselsPage() {
  const router = useRouter()
  const [carousels, setCarousels] = useState<CarouselItem[]>([])
  const [voices, setVoices] = useState<VoiceItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/carousel/get').then(r => r.json()),
      fetch('/api/carousel/train-voice').then(r => r.json()),
    ])
      .then(([cData, vData]) => {
        setCarousels(cData.carousels ?? [])
        setVoices(vData.voices ?? [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

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

  if (loading) return <div className="text-sm text-muted-foreground text-center py-12">Загрузка...</div>

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold">Карусели</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Instagram / TikTok карусели с автогенерацией</p>
        </div>
        <button
          onClick={() => router.push('/carousels/new')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-xs font-bold hover:opacity-90"
        >
          <Plus className="w-3.5 h-3.5" /> Создать
        </button>
      </div>

      {/* Voice styles */}
      {voices.length > 0 && (
        <div className="mb-6">
          <div className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground mb-2">Обученные стили</div>
          <div className="flex gap-2 flex-wrap">
            {voices.map(v => (
              <div key={v.id} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-bg-card border border-border text-xs">
                <Sparkles className="w-3 h-3 text-accent" />
                <span className="font-semibold">{v.name}</span>
                {v.summary && <span className="text-muted-foreground hidden sm:inline">— {v.summary}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {carousels.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl border-2 border-dashed border-border flex items-center justify-center mx-auto mb-4">
            <Image className="w-7 h-7 text-muted-foreground" />
          </div>
          <div className="text-sm font-semibold mb-1">Каруселей пока нет</div>
          <div className="text-xs text-muted-foreground mb-4">Создай первую — выбери источник, настрой стиль, получи готовые слайды</div>
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
                className="bg-bg-card border border-border rounded-xl p-4 text-left hover:border-gray-400 transition-colors group"
              >
                <div className="w-full aspect-[4/5] rounded-lg mb-3 overflow-hidden bg-background flex items-center justify-center">
                  {c.illustration_url ? (
                    <img src={c.illustration_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Image className="w-8 h-8 text-muted-foreground" />
                  )}
                </div>
                <div className="text-sm font-semibold line-clamp-2 mb-1 group-hover:text-accent transition-colors">
                  {c.topic}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">{c.slide_count} слайдов</span>
                  <span className={`flex items-center gap-1 text-[10px] font-semibold ${st.color}`}>
                    {st.icon} {st.label}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(c.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                  </span>
                  <button
                    onClick={(e) => handleDelete(e, c.id)}
                    className="text-muted-foreground hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
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
