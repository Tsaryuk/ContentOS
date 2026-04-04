'use client'

import { TaskStatus, TaskPriority, STATUS_LABELS, PRIORITY_LABELS } from '@/lib/tasks/types'

interface TaskUser {
  id: string
  name: string
}

interface TaskProject {
  id: string
  name: string
}

interface TaskFiltersProps {
  status: TaskStatus | null
  priority: TaskPriority | null
  assigneeId: string | null
  projectId: string | null
  users: TaskUser[]
  projects: TaskProject[]
  onStatusChange: (v: TaskStatus | null) => void
  onPriorityChange: (v: TaskPriority | null) => void
  onAssigneeChange: (v: string | null) => void
  onProjectChange: (v: string | null) => void
}

export function TaskFilters({
  status, priority, assigneeId, projectId,
  users, projects,
  onStatusChange, onPriorityChange, onAssigneeChange, onProjectChange,
}: TaskFiltersProps) {
  const selectClass = 'bg-surface border border-border rounded-lg px-2.5 py-1.5 text-xs text-cream outline-none focus:border-accent transition-colors'

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        value={status ?? ''}
        onChange={e => onStatusChange(e.target.value as TaskStatus || null)}
        className={selectClass}
      >
        <option value="">Все статусы</option>
        {(Object.entries(STATUS_LABELS) as [TaskStatus, string][]).map(([k, v]) => (
          <option key={k} value={k}>{v}</option>
        ))}
      </select>

      <select
        value={priority ?? ''}
        onChange={e => onPriorityChange(e.target.value as TaskPriority || null)}
        className={selectClass}
      >
        <option value="">Все приоритеты</option>
        {(Object.entries(PRIORITY_LABELS) as [TaskPriority, string][]).map(([k, v]) => (
          <option key={k} value={k}>{v}</option>
        ))}
      </select>

      <select
        value={assigneeId ?? ''}
        onChange={e => onAssigneeChange(e.target.value || null)}
        className={selectClass}
      >
        <option value="">Все исполнители</option>
        {users.map(u => (
          <option key={u.id} value={u.id}>{u.name}</option>
        ))}
      </select>

      <select
        value={projectId ?? ''}
        onChange={e => onProjectChange(e.target.value || null)}
        className={selectClass}
      >
        <option value="">Все проекты</option>
        {projects.map(p => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
    </div>
  )
}
