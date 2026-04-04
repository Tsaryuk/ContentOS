'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { TaskWithRelations, PRIORITY_DOT_COLORS } from '@/lib/tasks/types'

interface TaskCardProps {
  task: TaskWithRelations
  onClick: (task: TaskWithRelations) => void
}

export function TaskCard({ task, onClick }: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, data: { task } })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const isOverdue = task.due_date && new Date(task.due_date) < new Date(new Date().toDateString())

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onClick(task)}
      className={`bg-surface border border-border rounded-lg p-3 cursor-grab active:cursor-grabbing transition-shadow hover:shadow-surface ${
        isDragging ? 'opacity-50 shadow-lg scale-[1.02]' : ''
      }`}
    >
      <div className="flex items-start gap-2">
        <span className={`w-2 h-2 rounded-full mt-1 shrink-0 ${PRIORITY_DOT_COLORS[task.priority]}`} />
        <span className="text-xs text-cream font-medium line-clamp-2">{task.title}</span>
      </div>

      <div className="flex items-center gap-2 mt-2">
        {task.assignee && (
          <span className="w-5 h-5 rounded-full bg-accent/20 text-accent text-[10px] font-bold flex items-center justify-center shrink-0">
            {task.assignee.name.charAt(0).toUpperCase()}
          </span>
        )}

        {task.due_date && (
          <span className={`text-[10px] ${isOverdue ? 'text-red-400' : 'text-dim'}`}>
            {new Date(task.due_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
          </span>
        )}

        {task.project && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-md font-medium ml-auto"
            style={{ backgroundColor: task.project.color + '20', color: task.project.color }}
          >
            {task.project.name}
          </span>
        )}
      </div>
    </div>
  )
}
