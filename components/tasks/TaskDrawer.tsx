'use client'

import { useEffect, useState } from 'react'
import { X, Trash2 } from 'lucide-react'
import {
  TaskWithRelations, TaskStatus, TaskPriority,
  STATUS_LABELS, PRIORITY_LABELS,
} from '@/lib/tasks/types'

interface DrawerUser {
  id: string
  name: string
}

interface DrawerProject {
  id: string
  name: string
}

interface Video {
  id: string
  title: string
}

interface TaskDrawerProps {
  task: TaskWithRelations | null
  open: boolean
  users: DrawerUser[]
  projects: DrawerProject[]
  currentUserId: string
  currentUserRole: string
  defaultProjectId: string | null
  onClose: () => void
  onSave: (data: TaskFormData) => void
  onDelete: (taskId: string) => void
}

export interface TaskFormData {
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  assignee_id: string | null
  project_id: string | null
  due_date: string | null
  related_type: string | null
  related_id: string | null
}

const EMPTY_FORM: TaskFormData = {
  title: '',
  description: '',
  status: 'todo',
  priority: 'medium',
  assignee_id: null,
  project_id: null,
  due_date: null,
  related_type: null,
  related_id: null,
}

export function TaskDrawer({
  task, open, users, projects,
  currentUserId, currentUserRole, defaultProjectId,
  onClose, onSave, onDelete,
}: TaskDrawerProps) {
  const [form, setForm] = useState<TaskFormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [videos, setVideos] = useState<Video[]>([])

  useEffect(() => {
    if (open) {
      fetch('/api/youtube/videos-list')
        .then(r => r.ok ? r.json() : { videos: [] })
        .then(d => setVideos(d.videos ?? []))
        .catch(() => setVideos([]))
    }
  }, [open])

  useEffect(() => {
    if (task) {
      setForm({
        title: task.title,
        description: task.description ?? '',
        status: task.status,
        priority: task.priority,
        assignee_id: task.assignee_id,
        project_id: task.project_id,
        due_date: task.due_date,
        related_type: task.related_type,
        related_id: task.related_id,
      })
    } else {
      setForm({ ...EMPTY_FORM, project_id: defaultProjectId })
    }
  }, [task, open, defaultProjectId])

  function updateField<K extends keyof TaskFormData>(key: K, value: TaskFormData[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) return
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  const canDelete = task && (task.creator_id === currentUserId || currentUserRole === 'admin')
  const isEdit = !!task

  const inputClass = 'w-full bg-surface border border-border rounded-lg px-3 py-2 text-xs text-cream outline-none focus:border-accent transition-colors'
  const labelClass = 'text-[10px] uppercase tracking-wider text-dim font-medium'

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-[400px] max-w-full bg-bg border-l border-border z-50 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-cream">
            {isEdit ? 'Редактировать задачу' : 'Новая задача'}
          </h2>
          <button onClick={onClose} className="text-dim hover:text-muted transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          <div>
            <label className={labelClass}>Название *</label>
            <input
              type="text"
              value={form.title}
              onChange={e => updateField('title', e.target.value)}
              className={inputClass}
              placeholder="Что нужно сделать?"
              required
            />
          </div>

          <div>
            <label className={labelClass}>Описание</label>
            <textarea
              value={form.description}
              onChange={e => updateField('description', e.target.value)}
              className={`${inputClass} min-h-[80px] resize-y`}
              placeholder="Подробности..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Статус</label>
              <select
                value={form.status}
                onChange={e => updateField('status', e.target.value as TaskStatus)}
                className={inputClass}
              >
                {(Object.entries(STATUS_LABELS) as [TaskStatus, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Приоритет</label>
              <select
                value={form.priority}
                onChange={e => updateField('priority', e.target.value as TaskPriority)}
                className={inputClass}
              >
                {(Object.entries(PRIORITY_LABELS) as [TaskPriority, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>Исполнитель</label>
            <select
              value={form.assignee_id ?? ''}
              onChange={e => updateField('assignee_id', e.target.value || null)}
              className={inputClass}
            >
              <option value="">Не назначен</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Проект</label>
            <select
              value={form.project_id ?? ''}
              onChange={e => updateField('project_id', e.target.value || null)}
              className={inputClass}
            >
              <option value="">Без проекта</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Дедлайн</label>
            <input
              type="date"
              value={form.due_date ?? ''}
              onChange={e => updateField('due_date', e.target.value || null)}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Привязка к материалу</label>
            <div className="flex gap-2">
              <select
                value={form.related_type ?? ''}
                onChange={e => {
                  updateField('related_type', e.target.value || null)
                  if (!e.target.value) updateField('related_id', null)
                }}
                className={`${inputClass} w-[120px] shrink-0`}
              >
                <option value="">Нет</option>
                <option value="video">Видео</option>
                <option value="clip">Клип</option>
                <option value="carousel">Карусель</option>
              </select>
              {form.related_type === 'video' && (
                <select
                  value={form.related_id ?? ''}
                  onChange={e => updateField('related_id', e.target.value || null)}
                  className={inputClass}
                >
                  <option value="">Выберите видео</option>
                  {videos.map(v => (
                    <option key={v.id} value={v.id}>{v.title}</option>
                  ))}
                </select>
              )}
              {form.related_type && form.related_type !== 'video' && (
                <input
                  type="text"
                  value={form.related_id ?? ''}
                  onChange={e => updateField('related_id', e.target.value || null)}
                  className={inputClass}
                  placeholder="ID материала"
                />
              )}
            </div>
          </div>

          <div className="mt-auto pt-4 flex items-center gap-2">
            <button
              type="submit"
              disabled={saving || !form.title.trim()}
              className="flex-1 bg-accent hover:bg-accent/90 text-white text-xs font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? 'Сохранение...' : isEdit ? 'Сохранить' : 'Создать'}
            </button>

            {canDelete && (
              <button
                type="button"
                onClick={() => onDelete(task!.id)}
                className="p-2.5 text-dim hover:text-red-400 transition-colors rounded-lg hover:bg-red-400/10"
                title="Удалить"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </form>
      </div>
    </>
  )
}
