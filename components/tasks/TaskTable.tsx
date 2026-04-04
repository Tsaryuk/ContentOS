'use client'

import { useState } from 'react'
import {
  TaskWithRelations,
  STATUS_LABELS, PRIORITY_LABELS,
  STATUS_COLORS, PRIORITY_COLORS,
} from '@/lib/tasks/types'

type SortKey = 'title' | 'status' | 'priority' | 'due_date'

interface TaskTableProps {
  tasks: TaskWithRelations[]
  onTaskClick: (task: TaskWithRelations) => void
}

const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 }

export function TaskTable({ tasks, onTaskClick }: TaskTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('priority')
  const [sortAsc, setSortAsc] = useState(true)

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(prev => !prev)
    } else {
      setSortKey(key)
      setSortAsc(true)
    }
  }

  const sorted = [...tasks].sort((a, b) => {
    const dir = sortAsc ? 1 : -1
    switch (sortKey) {
      case 'title':
        return dir * a.title.localeCompare(b.title, 'ru')
      case 'status':
        return dir * a.status.localeCompare(b.status)
      case 'priority':
        return dir * (PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
      case 'due_date': {
        const da = a.due_date ?? '9999-12-31'
        const db = b.due_date ?? '9999-12-31'
        return dir * da.localeCompare(db)
      }
      default:
        return 0
    }
  })

  const thClass = 'text-left text-[10px] uppercase tracking-wider text-dim font-medium px-3 py-2 cursor-pointer hover:text-muted select-none'
  const arrow = (key: SortKey) => sortKey === key ? (sortAsc ? ' \u2191' : ' \u2193') : ''

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <table className="w-full">
        <thead className="bg-surface">
          <tr>
            <th className={thClass} onClick={() => handleSort('title')}>Название{arrow('title')}</th>
            <th className={thClass} onClick={() => handleSort('status')}>Статус{arrow('status')}</th>
            <th className={thClass} onClick={() => handleSort('priority')}>Приоритет{arrow('priority')}</th>
            <th className={`${thClass} hidden sm:table-cell`}>Исполнитель</th>
            <th className={`${thClass} hidden md:table-cell`}>Проект</th>
            <th className={thClass} onClick={() => handleSort('due_date')}>Дедлайн{arrow('due_date')}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr>
              <td colSpan={6} className="text-center text-xs text-dim py-8">Нет задач</td>
            </tr>
          )}
          {sorted.map(task => {
            const isOverdue = task.due_date && new Date(task.due_date) < new Date(new Date().toDateString())
            return (
              <tr
                key={task.id}
                onClick={() => onTaskClick(task)}
                className="border-t border-border hover:bg-surface/50 cursor-pointer transition-colors"
              >
                <td className="px-3 py-2.5 text-xs text-cream font-medium max-w-[300px] truncate">{task.title}</td>
                <td className="px-3 py-2.5">
                  <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${STATUS_COLORS[task.status]}`}>
                    {STATUS_LABELS[task.status]}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${PRIORITY_COLORS[task.priority]}`}>
                    {PRIORITY_LABELS[task.priority]}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-xs text-muted hidden sm:table-cell">{task.assignee?.name ?? '\u2014'}</td>
                <td className="px-3 py-2.5 hidden md:table-cell">
                  {task.project ? (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-md font-medium"
                      style={{ backgroundColor: task.project.color + '20', color: task.project.color }}
                    >
                      {task.project.name}
                    </span>
                  ) : '\u2014'}
                </td>
                <td className={`px-3 py-2.5 text-xs ${isOverdue ? 'text-red-400' : 'text-dim'}`}>
                  {task.due_date
                    ? new Date(task.due_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
                    : '\u2014'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
