import React, { useMemo, useState } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView, ActivityIndicator,
  Alert, TextInput, Modal, Platform, KeyboardAvoidingView, SectionList,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/theme/ThemeContext'
import { RoleGuard } from '@/guards/RoleGuard'
import { ModuleGuard, ModuleLockedScreen } from '@/guards/ModuleGuard'
import {
  useProject,
  useProjectTasks,
  useProjectMilestones,
  useCreateTask,
  useUpdateTask,
  useToggleMilestone,
  useProjectSchedules,
  useCreateSchedule,
  useDeleteSchedule,
  useMarkPresent,
  type Task,
  type MemberSchedule,
} from '@/features/projects/useProjects'
import apiClient from '@/api/client'
import { STAFF } from '@/api/endpoints'
import { useQuery } from '@tanstack/react-query'

// ─── Types & Constants ────────────────────────────────────────────────────────

type Tab = 'overview' | 'tasks' | 'team' | 'schedule'

const STATUS_META: Record<string, { color: string; bg: string; label: string }> = {
  planning:  { color: '#6366f1', bg: '#eef2ff', label: 'Planning' },
  active:    { color: '#10b981', bg: '#ecfdf5', label: 'Active' },
  on_hold:   { color: '#f59e0b', bg: '#fffbeb', label: 'On Hold' },
  completed: { color: '#64748b', bg: '#f1f5f9', label: 'Completed' },
  cancelled: { color: '#ef4444', bg: '#fef2f2', label: 'Cancelled' },
}

const TASK_STATUS_ORDER = ['todo', 'in_progress', 'blocked', 'done']
const TASK_STATUS_LABELS: Record<string, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  done: 'Done',
}
const TASK_STATUS_COLORS: Record<string, string> = {
  todo: '#94a3b8',
  in_progress: '#6366f1',
  blocked: '#ef4444',
  done: '#10b981',
}
const PRIORITY_COLORS: Record<string, string> = {
  low: '#94a3b8',
  medium: '#f59e0b',
  high: '#ef4444',
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function Initials({ name, size = 34, color }: { name: string; size?: number; color: string }) {
  const letters = name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.38 }}>{letters}</Text>
    </View>
  )
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ projectId }: { projectId: number }) {
  const theme = useTheme()
  const { data: project } = useProject(projectId)
  const { data: milestones = [] } = useProjectMilestones(projectId)
  const toggleMilestone = useToggleMilestone(projectId)

  if (!project) return null

  const statusMeta = STATUS_META[project.status] ?? STATUS_META.planning
  const progress = project.progress_percentage ?? 0

  const Row = ({ icon, label, value }: { icon: string; label: string; value: string }) => (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderColor: theme.colors.border,
        gap: 10,
      }}
    >
      <Ionicons name={icon as any} size={15} color={theme.primary[500]} />
      <Text style={{ fontSize: 13, color: theme.colors.textMuted, width: 80 }}>{label}</Text>
      <Text style={{ fontSize: 13, fontWeight: '600', color: theme.colors.text, flex: 1 }}>
        {value}
      </Text>
    </View>
  )

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      {/* Status + progress */}
      <View
        style={{
          backgroundColor: theme.colors.surface,
          borderRadius: 16,
          padding: 16,
          borderWidth: 1,
          borderColor: theme.colors.border,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <View
            style={{
              paddingHorizontal: 12,
              paddingVertical: 5,
              borderRadius: 99,
              backgroundColor: statusMeta.bg,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: statusMeta.color }}>
              {statusMeta.label}
            </Text>
          </View>
          <Text style={{ marginLeft: 'auto', fontSize: 13, fontWeight: '700', color: theme.colors.text }}>
            {progress}%
          </Text>
        </View>
        <View style={{ height: 8, backgroundColor: theme.colors.border, borderRadius: 4 }}>
          <View
            style={{
              height: 8,
              width: `${progress}%`,
              backgroundColor: progress >= 100 ? '#10b981' : statusMeta.color,
              borderRadius: 4,
            }}
          />
        </View>
        <Text style={{ fontSize: 12, color: theme.colors.textMuted, marginTop: 6 }}>
          {project.completed_task_count ?? 0} / {project.task_count ?? 0} tasks completed
        </Text>
      </View>

      {/* Description */}
      {project.description ? (
        <View
          style={{
            backgroundColor: theme.colors.surface,
            borderRadius: 16,
            padding: 16,
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
          <Text
            style={{
              fontSize: 12,
              fontWeight: '700',
              color: theme.colors.textMuted,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              marginBottom: 8,
            }}
          >
            Description
          </Text>
          <Text style={{ fontSize: 14, color: theme.colors.text, lineHeight: 22 }}>
            {project.description}
          </Text>
        </View>
      ) : null}

      {/* Details */}
      <View
        style={{
          backgroundColor: theme.colors.surface,
          borderRadius: 16,
          padding: 16,
          borderWidth: 1,
          borderColor: theme.colors.border,
        }}
      >
        <Text
          style={{
            fontSize: 12,
            fontWeight: '700',
            color: theme.colors.textMuted,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            marginBottom: 4,
          }}
        >
          Details
        </Text>
        {project.customer_name ? (
          <Row icon="business-outline" label="Customer" value={project.customer_name} />
        ) : null}
        {project.manager_name ? (
          <Row icon="person-outline" label="Manager" value={project.manager_name} />
        ) : null}
        {project.start_date ? (
          <Row
            icon="play-outline"
            label="Start"
            value={new Date(project.start_date).toLocaleDateString('en-US', {
              month: 'short', day: 'numeric', year: 'numeric',
            })}
          />
        ) : null}
        {project.end_date ? (
          <Row
            icon="flag-outline"
            label="Deadline"
            value={new Date(project.end_date).toLocaleDateString('en-US', {
              month: 'short', day: 'numeric', year: 'numeric',
            })}
          />
        ) : null}
        <Row icon="bar-chart-outline" label="Priority" value={project.priority ?? '—'} />
      </View>

      {/* Milestones */}
      {milestones.length > 0 ? (
        <View
          style={{
            backgroundColor: theme.colors.surface,
            borderRadius: 16,
            padding: 16,
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
          <Text
            style={{
              fontSize: 12,
              fontWeight: '700',
              color: theme.colors.textMuted,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              marginBottom: 12,
            }}
          >
            Milestones ({milestones.filter((m) => m.is_completed).length}/{milestones.length})
          </Text>
          {milestones.map((m, idx) => (
            <TouchableOpacity
              key={m.id}
              onPress={() => toggleMilestone.mutate(m.id)}
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: 10,
                paddingVertical: 8,
                borderBottomWidth: idx < milestones.length - 1 ? 1 : 0,
                borderColor: theme.colors.border,
              }}
            >
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  borderWidth: 2,
                  borderColor: m.is_completed ? '#10b981' : theme.colors.border,
                  backgroundColor: m.is_completed ? '#10b981' : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 1,
                }}
              >
                {m.is_completed ? (
                  <Ionicons name="checkmark" size={12} color="#fff" />
                ) : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '600',
                    color: m.is_completed ? theme.colors.textMuted : theme.colors.text,
                    textDecorationLine: m.is_completed ? 'line-through' : 'none',
                  }}
                >
                  {m.title}
                </Text>
                {m.due_date ? (
                  <Text style={{ fontSize: 11, color: theme.colors.textMuted, marginTop: 2 }}>
                    Due {new Date(m.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Text>
                ) : null}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <View style={{ height: 40 }} />
    </ScrollView>
  )
}

// ─── Tasks Tab ────────────────────────────────────────────────────────────────

function CreateTaskModal({
  visible,
  onClose,
  projectId,
}: {
  visible: boolean
  onClose: () => void
  projectId: number
}) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('medium')
  const [dueDate, setDueDate] = useState('')
  const [assigneeId, setAssigneeId] = useState<number | null>(null)

  const { data: staffData } = useQuery({
    queryKey: ['staff', 'picker'],
    queryFn: () =>
      apiClient.get(STAFF.LIST, { params: { page_size: 100 } }).then((r) => {
        const d = r.data.data ?? r.data
        return Array.isArray(d) ? d : d?.results ?? []
      }),
    staleTime: 300_000,
    enabled: visible,
  })
  const staffList: { id: number; full_name: string }[] = staffData ?? []

  const mutation = useCreateTask(projectId)

  const handleCreate = () => {
    if (!title.trim()) { Alert.alert('Validation', 'Task title is required'); return }
    mutation.mutate(
      {
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        due_date: dueDate || null,
        assigned_to: assigneeId,
      },
      {
        onSuccess: () => { onClose(); setTitle(''); setDescription(''); setAssigneeId(null) },
        onError: (e: any) =>
          Alert.alert('Error', e?.response?.data?.message ?? 'Could not create task'),
      },
    )
  }

  const Label = ({ text }: { text: string }) => (
    <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.textMuted,
      letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>{text}</Text>
  )

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, backgroundColor: theme.colors.background }}
      >
        <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 14,
          borderBottomWidth: 1, borderColor: theme.colors.border,
          flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: theme.colors.text }}>New Task</Text>
          </View>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={theme.colors.textMuted} /></TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
          <View>
            <Label text="Title *" />
            <TextInput value={title} onChangeText={setTitle} placeholder="Task title"
              placeholderTextColor={theme.colors.textMuted}
              style={{ backgroundColor: theme.colors.surface, borderRadius: 12, padding: 14,
                fontSize: 15, color: theme.colors.text, borderWidth: 1, borderColor: theme.colors.border }} />
          </View>

          <View>
            <Label text="Description" />
            <TextInput value={description} onChangeText={setDescription} placeholder="Details…"
              placeholderTextColor={theme.colors.textMuted} multiline numberOfLines={3}
              style={{ backgroundColor: theme.colors.surface, borderRadius: 12, padding: 14,
                fontSize: 14, color: theme.colors.text, borderWidth: 1, borderColor: theme.colors.border,
                minHeight: 70, textAlignVertical: 'top' }} />
          </View>

          <View>
            <Label text="Priority" />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {['low', 'medium', 'high'].map((p) => {
                const isActive = priority === p
                const col = PRIORITY_COLORS[p]
                return (
                  <TouchableOpacity key={p} onPress={() => setPriority(p)}
                    style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center',
                      backgroundColor: isActive ? col : theme.colors.surface,
                      borderWidth: 1.5, borderColor: isActive ? col : theme.colors.border }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: isActive ? '#fff' : theme.colors.textMuted, textTransform: 'capitalize' }}>
                      {p}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>

          <View>
            <Label text="Due Date" />
            <TextInput value={dueDate} onChangeText={setDueDate} placeholder="YYYY-MM-DD"
              placeholderTextColor={theme.colors.textMuted}
              style={{ backgroundColor: theme.colors.surface, borderRadius: 12, padding: 14,
                fontSize: 14, color: theme.colors.text, borderWidth: 1, borderColor: theme.colors.border }} />
          </View>

          <View>
            <Label text="Assign To" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity onPress={() => setAssigneeId(null)}
                  style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99,
                    backgroundColor: !assigneeId ? theme.primary[600] : theme.colors.surface,
                    borderWidth: 1, borderColor: !assigneeId ? theme.primary[600] : theme.colors.border }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: !assigneeId ? '#fff' : theme.colors.textMuted }}>None</Text>
                </TouchableOpacity>
                {staffList.slice(0, 30).map((s) => (
                  <TouchableOpacity key={s.id} onPress={() => setAssigneeId(assigneeId === s.id ? null : s.id)}
                    style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99,
                      backgroundColor: assigneeId === s.id ? theme.primary[600] : theme.colors.surface,
                      borderWidth: 1, borderColor: assigneeId === s.id ? theme.primary[600] : theme.colors.border }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: assigneeId === s.id ? '#fff' : theme.colors.textMuted }}>{s.full_name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>

          <TouchableOpacity onPress={handleCreate} disabled={mutation.isPending}
            style={{ backgroundColor: theme.primary[600], borderRadius: 14, padding: 16,
              alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
            {mutation.isPending
              ? <ActivityIndicator color="#fff" />
              : <><Ionicons name="add-circle-outline" size={18} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Add Task</Text></>}
          </TouchableOpacity>

          <View style={{ height: insets.bottom + 20 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

function TaskRow({
  task,
  projectId,
}: {
  task: Task
  projectId: number
}) {
  const theme = useTheme()
  const statusOrder = TASK_STATUS_ORDER
  const updateTask = useUpdateTask(projectId, task.id)

  const cycleStatus = () => {
    const idx = statusOrder.indexOf(task.status)
    const next = statusOrder[(idx + 1) % statusOrder.length]
    updateTask.mutate({ status: next })
  }

  const statusColor = TASK_STATUS_COLORS[task.status] ?? '#94a3b8'
  const priorityColor = PRIORITY_COLORS[task.priority] ?? '#94a3b8'

  return (
    <View
      style={{
        backgroundColor: task.status === 'done' ? 'transparent' : undefined,
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingHorizontal: 16,
        paddingVertical: 10,
        gap: 12,
        borderBottomWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      <TouchableOpacity
        onPress={cycleStatus}
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          borderWidth: 2,
          borderColor: statusColor,
          backgroundColor: task.status === 'done' ? statusColor : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 1,
        }}
      >
        {task.status === 'done' ? (
          <Ionicons name="checkmark" size={12} color="#fff" />
        ) : task.status === 'in_progress' ? (
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: statusColor,
            }}
          />
        ) : task.status === 'blocked' ? (
          <Ionicons name="close" size={12} color={statusColor} />
        ) : null}
      </TouchableOpacity>

      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 14,
            fontWeight: '600',
            color: task.status === 'done' ? theme.colors.textMuted : theme.colors.text,
            textDecorationLine: task.status === 'done' ? 'line-through' : 'none',
          }}
        >
          {task.title}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <View
            style={{
              paddingHorizontal: 7,
              paddingVertical: 2,
              borderRadius: 6,
              backgroundColor: priorityColor + '22',
            }}
          >
            <Text style={{ fontSize: 10, fontWeight: '700', color: priorityColor, textTransform: 'capitalize' }}>
              {task.priority}
            </Text>
          </View>
          {task.assigned_to_name ? (
            <Text style={{ fontSize: 11, color: theme.colors.textMuted }}>
              @ {task.assigned_to_name}
            </Text>
          ) : null}
          {task.due_date ? (
            <Text style={{ fontSize: 11, color: theme.colors.textMuted, marginLeft: 'auto' }}>
              {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  )
}

function TasksTab({ projectId }: { projectId: number }) {
  const theme = useTheme()
  const { data: tasks = [], isLoading } = useProjectTasks(projectId)
  const [showCreate, setShowCreate] = useState(false)

  const sections = useMemo(() => {
    return TASK_STATUS_ORDER.map((status) => ({
      title: TASK_STATUS_LABELS[status],
      status,
      data: tasks.filter((t) => t.status === status),
    })).filter((s) => s.data.length > 0)
  }, [tasks])

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.primary[500]} />
      </View>
    )
  }

  return (
    <View style={{ flex: 1 }}>
      <SectionList
        sections={sections}
        keyExtractor={(t) => String(t.id)}
        renderItem={({ item }) => <TaskRow task={item} projectId={projectId} />}
        renderSectionHeader={({ section }) => {
          const color = TASK_STATUS_COLORS[section.status] ?? '#94a3b8'
          return (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 16,
                paddingVertical: 8,
                backgroundColor: theme.colors.background,
                borderBottomWidth: 1,
                borderColor: theme.colors.border,
                gap: 8,
              }}
            >
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
              <Text style={{ fontSize: 12, fontWeight: '800', color, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {section.title}
              </Text>
              <Text style={{ fontSize: 12, color: theme.colors.textMuted, marginLeft: 2 }}>
                ({section.data.length})
              </Text>
            </View>
          )
        }}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingTop: 60, gap: 10 }}>
            <Ionicons name="checkmark-done-outline" size={44} color={theme.colors.textMuted} />
            <Text style={{ fontSize: 16, fontWeight: '700', color: theme.colors.text }}>No tasks yet</Text>
            <Text style={{ fontSize: 13, color: theme.colors.textMuted }}>Tap + to add the first task</Text>
          </View>
        }
        ListFooterComponent={<View style={{ height: 100 }} />}
      />

      <RoleGuard permission="projects.manage">
        <TouchableOpacity
          onPress={() => setShowCreate(true)}
          style={{
            position: 'absolute',
            bottom: 28,
            right: 20,
            width: 52,
            height: 52,
            borderRadius: 26,
            backgroundColor: theme.primary[600],
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.2,
            shadowRadius: 8,
            elevation: 6,
          }}
        >
          <Ionicons name="add" size={26} color="#fff" />
        </TouchableOpacity>
      </RoleGuard>

      <CreateTaskModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        projectId={projectId}
      />
    </View>
  )
}

// ─── Team Tab ─────────────────────────────────────────────────────────────────

function TeamTab({ projectId }: { projectId: number }) {
  const theme = useTheme()
  const { data: project } = useProject(projectId)
  const { data: tasks = [] } = useProjectTasks(projectId)

  const teamMembers: Array<{ id: number; name: string }> = useMemo(() => {
    const proj = project as any
    if (!proj) return []
    if (Array.isArray(proj.team_members_details)) return proj.team_members_details
    if (Array.isArray(proj.team_members)) {
      return proj.team_members.map((id: number) => ({ id, name: `Member ${id}` }))
    }
    return []
  }, [project])

  const taskCountByMember = useMemo(() => {
    const counts: Record<number, { total: number; done: number }> = {}
    tasks.forEach((t: any) => {
      const aid = t.assigned_to ?? t.assigned_to_id
      if (!aid) return
      if (!counts[aid]) counts[aid] = { total: 0, done: 0 }
      counts[aid].total += 1
      if (t.status === 'done' || t.is_completed) counts[aid].done += 1
    })
    return counts
  }, [tasks])

  const AVATAR_COLORS = [
    theme.primary[600], '#10b981', '#f59e0b', '#6366f1', '#ef4444', '#8b5cf6',
  ]

  if (teamMembers.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        <Ionicons name="people-outline" size={44} color={theme.colors.textMuted} />
        <Text style={{ fontSize: 16, fontWeight: '700', color: theme.colors.text }}>No team members</Text>
        <Text style={{ fontSize: 13, color: theme.colors.textMuted }}>Add members when editing the project</Text>
      </View>
    )
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
      {teamMembers.map((member: any, idx: number) => {
        const name = member.full_name ?? member.name ?? `Member ${member.id}`
        const counts = taskCountByMember[member.id]
        const avatarColor = AVATAR_COLORS[idx % AVATAR_COLORS.length]
        return (
          <View
            key={member.id}
            style={{
              backgroundColor: theme.colors.surface,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: theme.colors.border,
              padding: 14,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
            }}
          >
            <Initials name={name} size={44} color={avatarColor} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: theme.colors.text }}>{name}</Text>
              {member.role ?? member.department_name ? (
                <Text style={{ fontSize: 12, color: theme.colors.textMuted, marginTop: 2 }}>
                  {member.role ?? member.department_name ?? ''}
                </Text>
              ) : null}
            </View>
            {counts ? (
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 18, fontWeight: '900', color: theme.primary[600] }}>
                  {counts.done}/{counts.total}
                </Text>
                <Text style={{ fontSize: 10, color: theme.colors.textMuted }}>tasks done</Text>
              </View>
            ) : (
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 18, fontWeight: '900', color: theme.colors.textMuted }}>0</Text>
                <Text style={{ fontSize: 10, color: theme.colors.textMuted }}>tasks</Text>
              </View>
            )}
          </View>
        )
      })}
      <View style={{ height: 40 }} />
    </ScrollView>
  )
}

// ─── Schedule Tab ─────────────────────────────────────────────────────────────

function AddScheduleModal({
  visible,
  onClose,
  projectId,
}: {
  visible: boolean
  onClose: () => void
  projectId: number
}) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const [memberId, setMemberId] = useState<number | null>(null)
  const [workDate, setWorkDate] = useState('')
  const [note, setNote] = useState('')

  const { data: staffData } = useQuery({
    queryKey: ['staff', 'picker'],
    queryFn: () =>
      apiClient.get(STAFF.LIST, { params: { page_size: 100 } }).then((r) => {
        const d = r.data.data ?? r.data
        return Array.isArray(d) ? d : d?.results ?? []
      }),
    staleTime: 300_000,
    enabled: visible,
  })
  const staffList: { id: number; full_name: string }[] = staffData ?? []

  const mutation = useCreateSchedule(projectId)

  const handleAdd = () => {
    if (!memberId) { Alert.alert('Validation', 'Select a team member'); return }
    if (!workDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      Alert.alert('Validation', 'Enter date as YYYY-MM-DD')
      return
    }
    mutation.mutate(
      { member: memberId, work_date: workDate, note: note || undefined },
      {
        onSuccess: () => { onClose(); setMemberId(null); setWorkDate(''); setNote('') },
        onError: (e: any) =>
          Alert.alert('Error', e?.response?.data?.message ?? 'Could not add schedule entry'),
      },
    )
  }

  const Label = ({ text }: { text: string }) => (
    <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.textMuted,
      letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>{text}</Text>
  )

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, backgroundColor: theme.colors.background }}
      >
        <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 14,
          borderBottomWidth: 1, borderColor: theme.colors.border,
          flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: theme.colors.text }}>Add Schedule Entry</Text>
            <Text style={{ fontSize: 12, color: theme.colors.textMuted, marginTop: 2 }}>
              Assign a member to a work date
            </Text>
          </View>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={theme.colors.textMuted} /></TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
          <View>
            <Label text="Team Member *" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {staffList.slice(0, 30).map((s) => {
                  const isActive = memberId === s.id
                  return (
                    <TouchableOpacity key={s.id} onPress={() => setMemberId(isActive ? null : s.id)}
                      style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99,
                        backgroundColor: isActive ? theme.primary[600] : theme.colors.surface,
                        borderWidth: 1.5, borderColor: isActive ? theme.primary[600] : theme.colors.border }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: isActive ? '#fff' : theme.colors.textMuted }}>
                        {s.full_name}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </ScrollView>
          </View>

          <View>
            <Label text="Work Date *" />
            <TextInput value={workDate} onChangeText={setWorkDate} placeholder="YYYY-MM-DD"
              placeholderTextColor={theme.colors.textMuted}
              style={{ backgroundColor: theme.colors.surface, borderRadius: 12, padding: 14,
                fontSize: 14, color: theme.colors.text, borderWidth: 1, borderColor: theme.colors.border }} />
          </View>

          <View>
            <Label text="Note (optional)" />
            <TextInput value={note} onChangeText={setNote} placeholder="e.g. Onsite work"
              placeholderTextColor={theme.colors.textMuted}
              style={{ backgroundColor: theme.colors.surface, borderRadius: 12, padding: 14,
                fontSize: 14, color: theme.colors.text, borderWidth: 1, borderColor: theme.colors.border }} />
          </View>

          <TouchableOpacity onPress={handleAdd} disabled={mutation.isPending}
            style={{ backgroundColor: theme.primary[600], borderRadius: 14, padding: 16,
              alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
            {mutation.isPending
              ? <ActivityIndicator color="#fff" />
              : <><Ionicons name="calendar-outline" size={18} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Add Entry</Text></>}
          </TouchableOpacity>

          <View style={{ height: insets.bottom + 20 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

function ScheduleTab({ projectId }: { projectId: number }) {
  const theme = useTheme()
  const { data: schedules = [], isLoading } = useProjectSchedules(projectId)
  const markPresent = useMarkPresent(projectId)
  const deleteSchedule = useDeleteSchedule(projectId)
  const [showAdd, setShowAdd] = useState(false)

  // Group schedules by date
  const grouped = useMemo(() => {
    const map: Record<string, MemberSchedule[]> = {}
    schedules.forEach((s) => {
      if (!map[s.work_date]) map[s.work_date] = []
      map[s.work_date].push(s)
    })
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
  }, [schedules])

  // Days worked per member
  const memberDays = useMemo(() => {
    const counts: Record<string, { name: string; initials: string; total: number; present: number }> = {}
    schedules.forEach((s) => {
      const key = String(s.member)
      if (!counts[key]) {
        counts[key] = { name: s.member_name, initials: s.member_initials, total: 0, present: 0 }
      }
      counts[key].total += 1
      if (s.is_present) counts[key].present += 1
    })
    return Object.values(counts)
  }, [schedules])

  const handleDelete = (id: number) => {
    Alert.alert('Remove Entry', 'Remove this schedule entry?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => deleteSchedule.mutate(id) },
    ])
  }

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.primary[500]} />
      </View>
    )
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>

        {/* Summary */}
        {memberDays.length > 0 ? (
          <View style={{ backgroundColor: theme.colors.surface, borderRadius: 16, padding: 14,
            borderWidth: 1, borderColor: theme.colors.border }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: theme.colors.textMuted,
              textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
              Attendance Summary
            </Text>
            {memberDays.map((m) => (
              <View key={m.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
                paddingVertical: 7, borderBottomWidth: 1, borderColor: theme.colors.border }}>
                <Initials name={m.name} size={30} color={theme.primary[600]} />
                <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: theme.colors.text }}>{m.name}</Text>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: theme.primary[600] }}>
                    {m.present}/{m.total} days
                  </Text>
                  <Text style={{ fontSize: 10, color: theme.colors.textMuted }}>present / scheduled</Text>
                </View>
              </View>
            ))}
            <Text style={{ fontSize: 11, color: theme.colors.textMuted, marginTop: 8 }}>
              Coin calculation is based on tasks completed + days present.
            </Text>
          </View>
        ) : null}

        {/* Date groups */}
        {grouped.length === 0 ? (
          <View style={{ alignItems: 'center', paddingTop: 40, gap: 10 }}>
            <Ionicons name="calendar-outline" size={44} color={theme.colors.textMuted} />
            <Text style={{ fontSize: 16, fontWeight: '700', color: theme.colors.text }}>No schedule yet</Text>
            <Text style={{ fontSize: 13, color: theme.colors.textMuted }}>Tap + to assign members to work dates</Text>
          </View>
        ) : (
          grouped.map(([date, entries]) => (
            <View key={date} style={{ backgroundColor: theme.colors.surface, borderRadius: 16,
              borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden' }}>
              <View style={{ backgroundColor: theme.primary[50] ?? '#eef2ff', paddingHorizontal: 14, paddingVertical: 10,
                borderBottomWidth: 1, borderColor: theme.colors.border, flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="calendar-outline" size={14} color={theme.primary[600]} />
                <Text style={{ fontSize: 13, fontWeight: '800', color: theme.primary[700] ?? theme.primary[600], marginLeft: 6 }}>
                  {new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
                    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
                  })}
                </Text>
                <Text style={{ marginLeft: 'auto', fontSize: 11, color: theme.colors.textMuted }}>
                  {entries.filter((e) => e.is_present).length}/{entries.length} present
                </Text>
              </View>

              {entries.map((entry, idx) => (
                <View key={entry.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12,
                  paddingHorizontal: 14, paddingVertical: 10,
                  borderBottomWidth: idx < entries.length - 1 ? 1 : 0, borderColor: theme.colors.border }}>
                  <Initials name={entry.member_name} size={32} color={entry.is_present ? '#10b981' : '#94a3b8'} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: theme.colors.text }}>
                      {entry.member_name}
                    </Text>
                    {entry.note ? (
                      <Text style={{ fontSize: 11, color: theme.colors.textMuted }}>{entry.note}</Text>
                    ) : null}
                  </View>

                  {/* Present toggle */}
                  <TouchableOpacity
                    onPress={() => markPresent.mutate(entry.id)}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 99,
                      backgroundColor: entry.is_present ? '#dcfce7' : theme.colors.border + '44',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <Ionicons
                      name={entry.is_present ? 'checkmark-circle' : 'ellipse-outline'}
                      size={15}
                      color={entry.is_present ? '#10b981' : '#94a3b8'}
                    />
                    <Text style={{ fontSize: 11, fontWeight: '700',
                      color: entry.is_present ? '#10b981' : '#94a3b8' }}>
                      {entry.is_present ? 'Present' : 'Absent'}
                    </Text>
                  </TouchableOpacity>

                  {/* Delete */}
                  <TouchableOpacity onPress={() => handleDelete(entry.id)} style={{ padding: 4 }}>
                    <Ionicons name="trash-outline" size={15} color={theme.colors.textMuted} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ))
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        onPress={() => setShowAdd(true)}
        style={{
          position: 'absolute', bottom: 28, right: 20,
          width: 52, height: 52, borderRadius: 26,
          backgroundColor: theme.primary[600],
          alignItems: 'center', justifyContent: 'center',
          shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.2, shadowRadius: 8, elevation: 6,
        }}
      >
        <Ionicons name="add" size={26} color="#fff" />
      </TouchableOpacity>

      <AddScheduleModal visible={showAdd} onClose={() => setShowAdd(false)} projectId={projectId} />
    </View>
  )
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'overview',  label: 'Overview',  icon: 'grid-outline' },
  { key: 'tasks',     label: 'Tasks',     icon: 'checkmark-done-outline' },
  { key: 'team',      label: 'Team',      icon: 'people-outline' },
  { key: 'schedule',  label: 'Schedule',  icon: 'calendar-outline' },
]

export default function ProjectDetailScreen() {
  const theme = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { id } = useLocalSearchParams<{ id: string }>()
  const projectId = Number(id)
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  const { data: project, isLoading } = useProject(projectId)

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={theme.primary[500]} />
      </View>
    )
  }

  if (!project) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Ionicons name="alert-circle-outline" size={48} color={theme.colors.textMuted} />
        <Text style={{ fontSize: 16, fontWeight: '700', color: theme.colors.text, marginTop: 12 }}>
          Project not found
        </Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: theme.primary[500], fontWeight: '600' }}>Go back</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const statusMeta = STATUS_META[project.status] ?? STATUS_META.planning

  return (
    <ModuleGuard module="projects" fallback={<ModuleLockedScreen module="Projects" />}>
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        {/* Header */}
        <View
          style={{
            paddingTop: insets.top + 8,
            paddingHorizontal: 16,
            paddingBottom: 14,
            backgroundColor: theme.colors.surface,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 10, padding: 4 }}>
              <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: theme.colors.textMuted, letterSpacing: 0.5 }}>
                {(project as any).project_number ?? 'PROJECT'}
              </Text>
              <Text numberOfLines={1} style={{ fontSize: 17, fontWeight: '900', color: theme.colors.text }}>
                {project.name}
              </Text>
            </View>
            <View
              style={{
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 99,
                backgroundColor: statusMeta.bg,
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: statusMeta.color }}>
                {statusMeta.label}
              </Text>
            </View>
          </View>

          {/* Progress bar */}
          <View>
            <View style={{ height: 4, backgroundColor: theme.colors.border, borderRadius: 2 }}>
              <View
                style={{
                  height: 4,
                  width: `${project.progress_percentage ?? 0}%`,
                  backgroundColor: (project.progress_percentage ?? 0) >= 100 ? '#10b981' : statusMeta.color,
                  borderRadius: 2,
                }}
              />
            </View>
          </View>
        </View>

        {/* Tab bar */}
        <View
          style={{
            flexDirection: 'row',
            backgroundColor: theme.colors.surface,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
          }}
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key
            return (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  paddingVertical: 10,
                  borderBottomWidth: 2,
                  borderBottomColor: isActive ? theme.primary[600] : 'transparent',
                  gap: 2,
                }}
              >
                <Ionicons
                  name={tab.icon as any}
                  size={17}
                  color={isActive ? theme.primary[600] : theme.colors.textMuted}
                />
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: '700',
                    color: isActive ? theme.primary[600] : theme.colors.textMuted,
                    letterSpacing: 0.2,
                  }}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>

        {/* Tab content */}
        <View style={{ flex: 1 }}>
          {activeTab === 'overview'  && <OverviewTab  projectId={projectId} />}
          {activeTab === 'tasks'     && <TasksTab     projectId={projectId} />}
          {activeTab === 'team'      && <TeamTab      projectId={projectId} />}
          {activeTab === 'schedule'  && <ScheduleTab  projectId={projectId} />}
        </View>
      </View>
    </ModuleGuard>
  )
}
