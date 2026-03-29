'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Check, FolderOpen } from 'lucide-react'

interface Project { id: string; name: string; color: string }

export function ProjectSwitcher() {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/projects').then(r => r.json()),
      fetch('/api/auth/session').then(r => r.json()),
    ]).then(([{ projects: p }, session]) => {
      setProjects(p ?? [])
      const active = session.activeProjectId ?? p?.[0]?.id ?? null
      setActiveProjectId(active)
      // Auto-set session if not set
      if (!session.activeProjectId && p?.[0]) {
        fetch('/api/auth/switch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: p[0].id }),
        })
      }
    })
  }, [])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  async function switchProject(id: string) {
    setActiveProjectId(id)
    setOpen(false)
    await fetch('/api/auth/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: id }),
    })
    window.location.reload()
  }

  const active = projects.find(p => p.id === activeProjectId)

  if (projects.length === 0) return (
    <a href="/settings" className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface transition-colors">
      <FolderOpen className="w-4 h-4 text-dim shrink-0" />
      <span className="text-[11px] text-dim truncate">Создать проект</span>
    </a>
  )

  return (
    <div ref={ref} className="relative w-full px-1.5">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface transition-colors"
      >
        <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: active?.color ?? '#a67ff0' }} />
        <span className="text-[11px] text-cream truncate flex-1 text-left font-medium">
          {active?.name ?? 'Проект'}
        </span>
        <ChevronDown className={`w-3 h-3 text-dim shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && projects.length > 1 && (
        <div className="absolute left-1.5 right-1.5 top-full mt-1 bg-bg border border-border rounded-xl shadow-xl z-50 overflow-hidden">
          {projects.map(proj => (
            <button
              key={proj.id}
              onClick={() => switchProject(proj.id)}
              className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-surface transition-colors text-left"
            >
              <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: proj.color }} />
              <span className="text-xs text-cream flex-1 truncate">{proj.name}</span>
              {proj.id === activeProjectId && <Check className="w-3.5 h-3.5 text-accent shrink-0" />}
            </button>
          ))}
          <div className="border-t border-border">
            <a href="/settings?section=projects" onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 hover:bg-surface transition-colors text-xs text-dim">
              Управление проектами
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
