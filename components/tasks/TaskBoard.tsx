'use client'

import { useState } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core'
import { TaskStatus, TaskWithRelations } from '@/lib/tasks/types'
import { TaskColumn } from './TaskColumn'
import { TaskCard } from './TaskCard'

const COLUMNS: TaskStatus[] = ['todo', 'in_progress', 'review', 'done']

interface TaskBoardProps {
  tasks: TaskWithRelations[]
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void
  onTaskClick: (task: TaskWithRelations) => void
}

export function TaskBoard({ tasks, onStatusChange, onTaskClick }: TaskBoardProps) {
  const [activeTask, setActiveTask] = useState<TaskWithRelations | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const tasksByStatus = (status: TaskStatus) =>
    tasks.filter(t => t.status === status)

  function handleDragStart(event: DragStartEvent) {
    const task = event.active.data.current?.task as TaskWithRelations | undefined
    if (task) setActiveTask(task)
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over) return

    const activeTask = active.data.current?.task as TaskWithRelations | undefined
    if (!activeTask) return

    const overId = over.id as string
    const overStatus = COLUMNS.includes(overId as TaskStatus)
      ? (overId as TaskStatus)
      : (over.data.current?.task as TaskWithRelations)?.status

    if (overStatus && activeTask.status !== overStatus) {
      onStatusChange(activeTask.id, overStatus)
    }
  }

  function handleDragEnd(_event: DragEndEvent) {
    setActiveTask(null)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map(status => (
          <TaskColumn
            key={status}
            status={status}
            tasks={tasksByStatus(status)}
            onTaskClick={onTaskClick}
          />
        ))}
      </div>

      <DragOverlay>
        {activeTask && (
          <div className="rotate-[2deg] scale-105">
            <TaskCard task={activeTask} onClick={() => {}} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
