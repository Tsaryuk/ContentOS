'use client'

import { User, Search, Edit3 } from 'lucide-react'
import { useState } from 'react'

interface GuestData {
  name: string
  description: string
  topics: string[]
}

export function GuestInfo({
  guest,
  onUpdate,
}: {
  guest?: GuestData | null
  onUpdate?: (guest: GuestData) => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(guest?.name ?? '')
  const [description, setDescription] = useState(guest?.description ?? '')
  const [topics, setTopics] = useState(guest?.topics?.join(', ') ?? '')

  if (!guest && !editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="w-full p-3 rounded-xl border border-dashed border-white/10 text-xs text-white/30 hover:text-white/50 hover:border-white/20 transition-colors flex items-center justify-center gap-2"
      >
        <User className="w-4 h-4" /> Добавить информацию о госте
      </button>
    )
  }

  if (editing) {
    return (
      <div className="space-y-2">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Имя гостя"
          className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500/50"
        />
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Кто этот человек, чем известен"
          rows={2}
          className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500/50 resize-none"
        />
        <input
          value={topics}
          onChange={e => setTopics(e.target.value)}
          placeholder="Темы через запятую"
          className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500/50"
        />
        <div className="flex gap-2">
          <button
            onClick={() => {
              onUpdate?.({ name, description, topics: topics.split(',').map(t => t.trim()).filter(Boolean) })
              setEditing(false)
            }}
            className="px-3 py-1.5 bg-purple-500/20 text-purple-400 rounded-lg text-xs font-medium hover:bg-purple-500/30 transition-colors"
          >
            Сохранить
          </button>
          <button
            onClick={() => setEditing(false)}
            className="px-3 py-1.5 text-white/40 rounded-lg text-xs hover:text-white/60 transition-colors"
          >
            Отмена
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-3">
      <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center shrink-0">
        <User className="w-5 h-5 text-purple-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-white/90">{guest!.name}</p>
          <button onClick={() => setEditing(true)} className="text-white/20 hover:text-white/50 transition-colors">
            <Edit3 className="w-3 h-3" />
          </button>
        </div>
        <p className="text-[11px] text-white/50 mt-0.5">{guest!.description}</p>
        {guest!.topics?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {guest!.topics.map((t, i) => (
              <span key={i} className="px-1.5 py-0.5 bg-white/5 rounded text-[10px] text-white/40">{t}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
