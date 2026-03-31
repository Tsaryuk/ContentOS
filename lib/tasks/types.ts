export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type RelatedType = 'video' | 'clip' | 'carousel'

export interface Task {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  assignee_id: string | null
  creator_id: string | null
  project_id: string | null
  due_date: string | null
  related_type: RelatedType | null
  related_id: string | null
  created_at: string
  updated_at: string
}

export interface TaskUser {
  id: string
  name: string
  email?: string
}

export interface TaskProject {
  id: string
  name: string
  color: string
}

export interface TaskWithRelations extends Task {
  assignee: TaskUser | null
  creator: TaskUser | null
  project: TaskProject | null
}

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'К выполнению',
  in_progress: 'В работе',
  review: 'На проверке',
  done: 'Готово',
}

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Низкий',
  medium: 'Средний',
  high: 'Высокий',
  urgent: 'Срочный',
}

export const STATUS_COLORS: Record<TaskStatus, string> = {
  todo: 'bg-blue-500/15 text-blue-400',
  in_progress: 'bg-accent/15 text-accent',
  review: 'bg-purple/15 text-purple',
  done: 'bg-green/15 text-green',
}

export const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: 'bg-dim/20 text-dim',
  medium: 'bg-blue-500/15 text-blue-400',
  high: 'bg-orange-500/15 text-orange-400',
  urgent: 'bg-red-500/15 text-red-400',
}

export const PRIORITY_DOT_COLORS: Record<TaskPriority, string> = {
  low: 'bg-dim',
  medium: 'bg-blue-400',
  high: 'bg-orange-400',
  urgent: 'bg-red-400',
}
