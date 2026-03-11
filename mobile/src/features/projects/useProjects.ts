/**
 * Projects service hooks — all data fetching & mutations for the projects module.
 */
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'
import { PROJECTS } from '@/api/endpoints'
import { QK } from '@/constants/queryKeys'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Project {
  id: number
  name: string
  description: string | null
  status: string
  priority: string
  customer_name: string | null
  manager_name: string | null
  start_date: string | null
  end_date: string | null
  progress_percentage: number
  task_count: number
  completed_task_count: number
  created_at: string
}

export interface Task {
  id: number
  title: string
  description: string | null
  status: string
  priority: string
  assigned_to_name: string | null
  due_date: string | null
  is_completed: boolean
  created_at: string
}

export interface Milestone {
  id: number
  title: string
  description: string | null
  due_date: string | null
  is_completed: boolean
}

export interface PaginatedResponse<T> {
  results: T[]
  next: string | null
  previous: string | null
  count?: number
}

export const PROJECT_STATUS_LABELS: Record<string, string> = {
  planning: 'Planning',
  active: 'Active',
  on_hold: 'On Hold',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

function unwrapPage<T>(r: any): PaginatedResponse<T> {
  if (r.data?.meta?.pagination !== undefined) {
    const pag = r.data.meta.pagination
    const results: T[] = Array.isArray(r.data.data) ? r.data.data : []
    return { results, next: pag.next ?? null, previous: pag.previous ?? null, count: pag.total }
  }
  if (Array.isArray(r.data)) {
    return { results: r.data as T[], next: null, previous: null }
  }
  const d = r.data.data ?? r.data
  const results: T[] = Array.isArray(d) ? d : (d?.results ?? [])
  return { results, next: d?.next ?? null, previous: d?.previous ?? null }
}

// ── List ──────────────────────────────────────────────────────────────────────

export interface ProjectFilters {
  search?: string
  status?: string
}

export function useProjectList(filters: ProjectFilters = {}) {
  return useInfiniteQuery<PaginatedResponse<Project>>({
    queryKey: ['projects', 'pg', filters],
    queryFn: ({ pageParam }) =>
      apiClient
        .get(PROJECTS.LIST, { params: { ...filters, page: pageParam ?? 1 } })
        .then((r) => unwrapPage<Project>(r)),
    initialPageParam: 1,
    getNextPageParam: (lastPage, _allPages, lastParam) => {
      if (!lastPage?.next) return undefined
      return (typeof lastParam === 'number' ? lastParam : 1) + 1
    },
    staleTime: 60_000,
  })
}

// ── Detail ────────────────────────────────────────────────────────────────────

export function useProject(id: number | string) {
  const projectId = Number(id)
  return useQuery<Project>({
    queryKey: QK.project(projectId),
    queryFn: () => apiClient.get(PROJECTS.DETAIL(projectId)).then((r) => r.data.data ?? r.data),
    enabled: !isNaN(projectId) && projectId > 0,
    staleTime: 30_000,
  })
}

// ── Create / Update / Delete ──────────────────────────────────────────────────

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiClient.post(PROJECTS.CREATE, payload).then((r) => r.data.data ?? r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: QK.dashboardStats })
    },
  })
}

export function useUpdateProject(projectId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiClient.patch(PROJECTS.DETAIL(projectId), payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.project(projectId) })
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export function useProjectTasks(projectId: number) {
  return useQuery<Task[]>({
    queryKey: QK.projectTasks(projectId),
    queryFn: () =>
      apiClient.get(PROJECTS.TASKS(projectId)).then((r) => r.data.results ?? r.data.data ?? r.data),
    enabled: projectId > 0,
    staleTime: 30_000,
  })
}

export function useCreateTask(projectId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiClient.post(PROJECTS.TASKS(projectId), payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.projectTasks(projectId) })
      qc.invalidateQueries({ queryKey: QK.project(projectId) })
    },
  })
}

export function useUpdateTask(projectId: number, taskId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiClient.patch(PROJECTS.TASK_DETAIL(projectId, taskId), payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.projectTasks(projectId) })
    },
  })
}

// ── Milestones ────────────────────────────────────────────────────────────────

export function useProjectMilestones(projectId: number) {
  return useQuery<Milestone[]>({
    queryKey: QK.projectMilestones(projectId),
    queryFn: () =>
      apiClient.get(PROJECTS.MILESTONES(projectId)).then((r) => r.data.results ?? r.data.data ?? r.data),
    enabled: projectId > 0,
  })
}

export function useToggleMilestone(projectId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (milestoneId: number) =>
      apiClient.post(PROJECTS.MILESTONE_TOGGLE(projectId, milestoneId), {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.projectMilestones(projectId) })
    },
  })
}

// ── Schedules ─────────────────────────────────────────────────────────────────

export interface MemberSchedule {
  id: number
  project: number
  member: number
  member_name: string
  member_initials: string
  work_date: string          // YYYY-MM-DD
  is_present: boolean
  note: string
  created_at: string
}

export function useProjectSchedules(projectId: number) {
  return useQuery<MemberSchedule[]>({
    queryKey: ['project-schedules', projectId],
    queryFn: () =>
      apiClient
        .get(PROJECTS.SCHEDULES(projectId))
        .then((r) => { const d = r.data.data ?? r.data; return Array.isArray(d) ? d : d.results ?? [] }),

    enabled: projectId > 0,
    staleTime: 30_000,
  })
}

export function useCreateSchedule(projectId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { member: number; work_date: string; note?: string }) =>
      apiClient.post(PROJECTS.SCHEDULES(projectId), payload).then((r) => r.data.data ?? r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-schedules', projectId] })
    },
  })
}

export function useDeleteSchedule(projectId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (scheduleId: number) =>
      apiClient.delete(PROJECTS.SCHEDULE_DETAIL(projectId, scheduleId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-schedules', projectId] })
    },
  })
}

export function useMarkPresent(projectId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (scheduleId: number) =>
      apiClient
        .post(PROJECTS.SCHEDULE_MARK_PRESENT(projectId, scheduleId), {})
        .then((r) => r.data.data ?? r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-schedules', projectId] })
    },
  })
}
