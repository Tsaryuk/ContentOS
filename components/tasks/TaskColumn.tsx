'use client'

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { TaskStatus, TaskWithRelations, STATUS_LABELS, STATUS_COLORS } from '@/lib/tasks/types'
import { TaskCard } from './TaskCard'

interface TaskColumnProps {
  status: TaskStatus
  tasks: TaskWithRelations[]
  onTaskClick: (task: TaskWithRelations) => void
}

export function TaskColumn({ status, tasks, onTaskClick }: TaskColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status })

  return (
    <div className="flex-1 min-w-[240px]">
      <div className="flex items-center gap-2 mb-3 px-1">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${STATUS_COLORS[status]}`}>
          {STATUS_LABELS[status]}
        </span>
        <span className="text-[10px] text-dim">{tasks.length}</span>
      </div>

      <div
        ref={setNodeRef}
        className={`flex flex-col gap-2 min-h-[200px] p-1.5 rounded-lg transition-colors ${
          isOver ? 'bg-accent/5' : ''
        }`}
      >
        <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map(task => (
            <TaskCard key={task.id} task={task} onClick={onTaskClick} />
          ))}
        </SortableContext>

        {tasks.length === 0 && (
          <div className="text-xs text-dim text-center py-8">Нет задач</div>
        )}
      </div>
    </div>
  )
}
