'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus, LayoutGrid, List } from 'lucide-react'
import { TaskWithRelations, TaskStatus, TaskPriority } from '@/lib/tasks/types'
import { TaskBoard } from '@/components/tasks/TaskBoard'
import { TaskTable } from '@/components/tasks/TaskTable'
import { TaskDrawer, TaskFormData } from '@/components/tasks/TaskDrawer'
import { TaskFilters } from '@/components/tasks/TaskFilters'

type ViewMode = 'kanban' | 'table'

interface User { id: string; name: string; email?: string }
interface Project { id: string; name: string; color: string }

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskWithRelations[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('tasks-view') as ViewMode) || 'kanban'
    }
    return 'kanban'
  })

  const [filterStatus, setFilterStatus] = useState<TaskStatus | null>(null)
  const [filterPriority, setFilterPriority] = useState<TaskPriority | null>(null)
  const [filterAssignee, setFilterAssignee] = useState<string | null>(null)
  const [filterProject, setFilterProject] = useState<string | null>(null)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<TaskWithRelations | null>(null)

  const [currentUserId, setCurrentUserId] = useState('')
  const [currentUserRole, setCurrentUserRole] = useState('manager')
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)

  const fetchTasks = useCallback(async () => {
    const params = new URLSearchParams()
    if (filterStatus) params.set('status', filterStatus)
    if (filterPriority) params.set('priority', filterPriority)
    if (filterAssignee) params.set('assignee_id', filterAssignee)
    if (filterProject) params.set('project_id', filterProject)

    const res = await fetch(`/api/tasks?${params}`)
    const data = await res.json()
    if (data.tasks) setTasks(data.tasks)
  }, [filterStatus, filterPriority, filterAssignee, filterProject])

  useEffect(() => {
    async function init() {
      const [usersRes, projectsRes, sessionRes] = await Promise.all([
        fetch('/api/users').then(r => r.json()),
        fetch('/api/projects').then(r => r.json()),
        fetch('/api/auth/session').then(r => r.json()),
      ])
      setUsers(usersRes.users ?? [])
      setProjects(projectsRes.projects ?? [])
      setCurrentUserId(sessionRes.userId ?? '')
      setCurrentUserRole(sessionRes.userRole ?? 'manager')
      const projId = sessionRes.activeProjectId ?? null
      setActiveProjectId(projId)
      if (projId) setFilterProject(projId)
      setLoading(false)
    }
    init()
  }, [])

  useEffect(() => {
    if (!loading) fetchTasks()
  }, [loading, fetchTasks])

  function switchView(v: ViewMode) {
    setView(v)
    localStorage.setItem('tasks-view', v)
  }

  function openCreate() {
    setEditingTask(null)
    setDrawerOpen(true)
  }

  function openEdit(task: TaskWithRelations) {
    setEditingTask(task)
    setDrawerOpen(true)
  }

  async function handleSave(data: TaskFormData) {
    if (editingTask) {
      await fetch(`/api/tasks/${editingTask.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    } else {
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
    }
    setDrawerOpen(false)
    setEditingTask(null)
    await fetchTasks()
  }

  async function handleDelete(taskId: string) {
    await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' })
    setDrawerOpen(false)
    setEditingTask(null)
    await fetchTasks()
  }

  async function handleStatusChange(taskId: string, newStatus: TaskStatus) {
    setTasks(prev =>
      prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t)
    )
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    if (!res.ok) {
      await fetchTasks()
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-xs text-dim">Загрузка...</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-6 h-full">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-cream">Задачи</h1>
        <div className="flex items-center gap-2">
          <div className="flex items-center border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => switchView('kanban')}
              className={`p-1.5 transition-colors ${
                view === 'kanban' ? 'bg-accent/10 text-accent' : 'text-dim hover:text-muted'
              }`}
              title="Kanban"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => switchView('table')}
              className={`p-1.5 transition-colors ${
                view === 'table' ? 'bg-accent/10 text-accent' : 'text-dim hover:text-muted'
              }`}
              title="Таблица"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 bg-accent hover:bg-accent/90 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Задача
          </button>
        </div>
      </div>

      <TaskFilters
        status={filterStatus}
        priority={filterPriority}
        assigneeId={filterAssignee}
        projectId={filterProject}
        users={users}
        projects={projects}
        onStatusChange={setFilterStatus}
        onPriorityChange={setFilterPriority}
        onAssigneeChange={setFilterAssignee}
        onProjectChange={setFilterProject}
      />

      <div className="flex-1 overflow-auto">
        {view === 'kanban' ? (
          <TaskBoard
            tasks={tasks}
            onStatusChange={handleStatusChange}
            onTaskClick={openEdit}
          />
        ) : (
          <TaskTable
            tasks={tasks}
            onTaskClick={openEdit}
          />
        )}
      </div>

      <TaskDrawer
        task={editingTask}
        open={drawerOpen}
        users={users}
        projects={projects}
        currentUserId={currentUserId}
        currentUserRole={currentUserRole}
        defaultProjectId={activeProjectId}
        onClose={() => { setDrawerOpen(false); setEditingTask(null) }}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  )
}
