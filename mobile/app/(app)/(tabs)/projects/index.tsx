import React, { useCallback, useMemo, useState } from 'react'
import {
  View, Text, TouchableOpacity, ActivityIndicator, RefreshControl,
  Modal, ScrollView, TextInput, KeyboardAvoidingView, Platform, Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { FlashList } from '@shopify/flash-list'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import apiClient from '@/api/client'
import { CUSTOMERS, STAFF } from '@/api/endpoints'
import { useTheme } from '@/theme/ThemeContext'
import { DrawerToggle } from '@/components/ui/AppDrawer'
import { RoleGuard } from '@/guards/RoleGuard'
import { ModuleGuard, ModuleLockedScreen } from '@/guards/ModuleGuard'
import { useProjectList, useCreateProject, type Project } from '@/features/projects/useProjects'
import { useQuery } from '@tanstack/react-query'

// ─── Constants ──────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { color: string; bg: string; icon: string }> = {
  planning:  { color: '#6366f1', bg: '#eef2ff', icon: 'time-outline' },
  active:    { color: '#10b981', bg: '#ecfdf5', icon: 'play-circle-outline' },
  on_hold:   { color: '#f59e0b', bg: '#fffbeb', icon: 'pause-circle-outline' },
  completed: { color: '#64748b', bg: '#f1f5f9', icon: 'checkmark-circle-outline' },
  cancelled: { color: '#ef4444', bg: '#fef2f2', icon: 'close-circle-outline' },
}

const ALL_STATUSES = ['planning', 'active', 'on_hold', 'completed', 'cancelled']

type AnyProject = Project & Record<string, any>

function getTaskCounts(project: AnyProject) {
  const total = project.tasks_count ?? project.tasks_total ?? 0
  const done  = project.done_tasks_count ?? project.tasks_done ?? 0
  return { total, done }
}

// ─── Create Project Modal ────────────────────────────────────────────────────

function CreateProjectModal({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState('planning')
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [managerId, setManagerId] = useState<number | null>(null)
  const [memberIds, setMemberIds] = useState<number[]>([])
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const { data: custData } = useQuery({
    queryKey: ['customers', 'picker'],
    queryFn: () =>
      apiClient.get(CUSTOMERS.LIST, { params: { page_size: 100 } }).then((r) => {
        const d = r.data.data ?? r.data
        return Array.isArray(d) ? d : d?.results ?? []
      }),
    staleTime: 300_000,
    enabled: visible,
  })

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

  const customers: { id: number; name: string }[] = custData ?? []
  const staffList: { id: number; full_name: string }[] = staffData ?? []

  const mutation = useCreateProject()

  const toggleMember = (id: number) =>
    setMemberIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )

  const resetForm = () => {
    setName(''); setDescription(''); setStatus('planning')
    setCustomerId(null); setManagerId(null); setMemberIds([])
    setStartDate(''); setEndDate('')
  }

  const handleCreate = () => {
    if (!name.trim()) { Alert.alert('Validation', 'Project name is required'); return }
    mutation.mutate(
      {
        name: name.trim(),
        description: description.trim() || undefined,
        status,
        customer: customerId,
        manager: managerId,
        team_members: memberIds,
        start_date: startDate || null,
        end_date: endDate || null,
      },
      {
        onSuccess: () => { onCreated(); onClose(); resetForm() },
        onError: (e: any) =>
          Alert.alert('Error', e?.response?.data?.message ?? 'Could not create project'),
      },
    )
  }

  const Label = ({ text }: { text: string }) => (
    <Text
      style={{
        fontSize: 11,
        fontWeight: '700',
        color: theme.colors.textMuted,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        marginBottom: 8,
      }}
    >
      {text}
    </Text>
  )

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, backgroundColor: theme.colors.background }}
      >
        {/* Sheet header */}
        <View
          style={{
            paddingTop: insets.top + 16,
            paddingHorizontal: 20,
            paddingBottom: 14,
            borderBottomWidth: 1,
            borderColor: theme.colors.border,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: theme.colors.text }}>
              New Project
            </Text>
            <Text style={{ fontSize: 12, color: theme.colors.textMuted, marginTop: 2 }}>
              Fill in the project details
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
            <Ionicons name="close" size={22} color={theme.colors.textMuted} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 20, gap: 20 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Name */}
          <View>
            <Label text="Project Name *" />
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Website Redesign"
              placeholderTextColor={theme.colors.textMuted}
              style={{
                backgroundColor: theme.colors.surface,
                borderRadius: 12,
                padding: 14,
                fontSize: 15,
                color: theme.colors.text,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            />
          </View>

          {/* Description */}
          <View>
            <Label text="Description" />
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Brief overview…"
              placeholderTextColor={theme.colors.textMuted}
              multiline
              numberOfLines={3}
              style={{
                backgroundColor: theme.colors.surface,
                borderRadius: 12,
                padding: 14,
                fontSize: 14,
                color: theme.colors.text,
                borderWidth: 1,
                borderColor: theme.colors.border,
                minHeight: 80,
                textAlignVertical: 'top',
              }}
            />
          </View>

          {/* Status */}
          <View>
            <Label text="Status" />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {['planning', 'active', 'on_hold'].map((s) => {
                const meta = STATUS_META[s]
                const isActive = status === s
                return (
                  <TouchableOpacity
                    key={s}
                    onPress={() => setStatus(s)}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 8,
                      borderRadius: 99,
                      backgroundColor: isActive ? meta.color : theme.colors.surface,
                      borderWidth: 1.5,
                      borderColor: isActive ? meta.color : theme.colors.border,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '700',
                        color: isActive ? '#fff' : theme.colors.textMuted,
                        textTransform: 'capitalize',
                      }}
                    >
                      {s.replace('_', ' ')}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>

          {/* Customer */}
          <View>
            <Label text="Customer" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  onPress={() => setCustomerId(null)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 99,
                    backgroundColor: !customerId ? theme.primary[600] : theme.colors.surface,
                    borderWidth: 1,
                    borderColor: !customerId ? theme.primary[600] : theme.colors.border,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '600',
                      color: !customerId ? '#fff' : theme.colors.textMuted,
                    }}
                  >
                    None
                  </Text>
                </TouchableOpacity>
                {customers.slice(0, 30).map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => setCustomerId(customerId === c.id ? null : c.id)}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 99,
                      backgroundColor:
                        customerId === c.id ? theme.primary[600] : theme.colors.surface,
                      borderWidth: 1,
                      borderColor:
                        customerId === c.id ? theme.primary[600] : theme.colors.border,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '600',
                        color: customerId === c.id ? '#fff' : theme.colors.textMuted,
                      }}
                    >
                      {c.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>

          {/* Manager */}
          <View>
            <Label text="Manager" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  onPress={() => setManagerId(null)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 99,
                    backgroundColor: !managerId ? theme.primary[600] : theme.colors.surface,
                    borderWidth: 1,
                    borderColor: !managerId ? theme.primary[600] : theme.colors.border,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '600',
                      color: !managerId ? '#fff' : theme.colors.textMuted,
                    }}
                  >
                    None
                  </Text>
                </TouchableOpacity>
                {staffList.slice(0, 30).map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    onPress={() => setManagerId(managerId === s.id ? null : s.id)}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 99,
                      backgroundColor:
                        managerId === s.id ? theme.primary[600] : theme.colors.surface,
                      borderWidth: 1,
                      borderColor:
                        managerId === s.id ? theme.primary[600] : theme.colors.border,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '600',
                        color: managerId === s.id ? '#fff' : theme.colors.textMuted,
                      }}
                    >
                      {s.full_name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>

          {/* Team Members */}
          <View>
            <Label text={`Team Members (${memberIds.length} selected)`} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {staffList.slice(0, 30).map((s) => {
                  const isActive = memberIds.includes(s.id)
                  return (
                    <TouchableOpacity
                      key={s.id}
                      onPress={() => toggleMember(s.id)}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        borderRadius: 99,
                        backgroundColor: isActive ? theme.primary[600] : theme.colors.surface,
                        borderWidth: 1.5,
                        borderColor: isActive ? theme.primary[600] : theme.colors.border,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: '600',
                          color: isActive ? '#fff' : theme.colors.textMuted,
                        }}
                      >
                        {s.full_name}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </ScrollView>
          </View>

          {/* Dates */}
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Label text="Start Date" />
              <TextInput
                value={startDate}
                onChangeText={setStartDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={theme.colors.textMuted}
                style={{
                  backgroundColor: theme.colors.surface,
                  borderRadius: 12,
                  padding: 14,
                  fontSize: 14,
                  color: theme.colors.text,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Label text="End Date" />
              <TextInput
                value={endDate}
                onChangeText={setEndDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={theme.colors.textMuted}
                style={{
                  backgroundColor: theme.colors.surface,
                  borderRadius: 12,
                  padding: 14,
                  fontSize: 14,
                  color: theme.colors.text,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              />
            </View>
          </View>

          {/* Submit */}
          <TouchableOpacity
            onPress={handleCreate}
            disabled={mutation.isPending}
            style={{
              backgroundColor: theme.primary[600],
              borderRadius: 14,
              padding: 16,
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {mutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="add-circle-outline" size={18} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>
                  Create Project
                </Text>
              </>
            )}
          </TouchableOpacity>

          <View style={{ height: insets.bottom + 20 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ─── Project Card ─────────────────────────────────────────────────────────────

function ProjectCard({
  project,
  onPress,
}: {
  project: AnyProject
  onPress: () => void
}) {
  const theme = useTheme()
  const meta = STATUS_META[project.status] ?? STATUS_META.planning
  const { total, done } = getTaskCounts(project)
  const progress = total > 0 ? done / total : 0

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={{
        backgroundColor: theme.colors.surface,
        marginHorizontal: 16,
        marginVertical: 5,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: theme.colors.border,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
        elevation: 2,
      }}
    >
      {/* Status stripe */}
      <View style={{ height: 4, backgroundColor: meta.color }} />

      <View style={{ padding: 14 }}>
        {/* header row */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 8,
          }}
        >
          <Text
            style={{
              fontSize: 10,
              fontWeight: '700',
              color: theme.colors.textMuted,
              letterSpacing: 0.5,
            }}
          >
            {project.project_number ?? '—'}
          </Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 99,
              backgroundColor: meta.bg,
            }}
          >
            <Ionicons name={meta.icon as any} size={11} color={meta.color} />
            <Text
              style={{
                fontSize: 11,
                fontWeight: '700',
                color: meta.color,
                textTransform: 'capitalize',
              }}
            >
              {project.status.replace('_', ' ')}
            </Text>
          </View>
        </View>

        <Text
          numberOfLines={2}
          style={{
            fontSize: 15,
            fontWeight: '800',
            color: theme.colors.text,
            marginBottom: 6,
          }}
        >
          {project.name}
        </Text>

        {/* meta row */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 10,
            marginBottom: 10,
          }}
        >
          {project.customer_name ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="business-outline" size={12} color={theme.colors.textMuted} />
              <Text style={{ fontSize: 12, color: theme.colors.textMuted }} numberOfLines={1}>
                {project.customer_name}
              </Text>
            </View>
          ) : null}
          {project.manager_name ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="person-outline" size={12} color={theme.colors.textMuted} />
              <Text style={{ fontSize: 12, color: theme.colors.textMuted }} numberOfLines={1}>
                {project.manager_name}
              </Text>
            </View>
          ) : null}
          {project.end_date ? (
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' }}
            >
              <Ionicons name="calendar-outline" size={12} color={theme.colors.textMuted} />
              <Text style={{ fontSize: 12, color: theme.colors.textMuted }}>
                {new Date(project.end_date).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Progress */}
        {total > 0 ? (
          <View>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginBottom: 5,
              }}
            >
              <Text style={{ fontSize: 11, color: theme.colors.textMuted }}>Progress</Text>
              <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.text }}>
                {done}/{total} tasks
              </Text>
            </View>
            <View
              style={{ height: 5, backgroundColor: theme.colors.border, borderRadius: 3 }}
            >
              <View
                style={{
                  height: 5,
                  width: `${progress * 100}%`,
                  backgroundColor: progress >= 1 ? '#10b981' : meta.color,
                  borderRadius: 3,
                }}
              />
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="albums-outline" size={12} color={theme.colors.textMuted} />
            <Text style={{ fontSize: 11, color: theme.colors.textMuted }}>No tasks yet</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  )
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────

function StatsBar({ projects }: { projects: AnyProject[] }) {
  const theme = useTheme()
  const counts = {
    total:     projects.length,
    active:    projects.filter((p) => p.status === 'active').length,
    completed: projects.filter((p) => p.status === 'completed').length,
  }
  const stats = [
    { label: 'Total',     value: counts.total,     color: theme.primary[600] },
    { label: 'Active',    value: counts.active,    color: '#10b981' },
    { label: 'Completed', value: counts.completed, color: '#64748b' },
  ]
  return (
    <View style={{ flexDirection: 'row', gap: 10, marginHorizontal: 16, marginBottom: 12 }}>
      {stats.map(({ label, value, color }) => (
        <View
          key={label}
          style={{
            flex: 1,
            alignItems: 'center',
            paddingVertical: 14,
            backgroundColor: theme.colors.surface,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
          <Text style={{ fontSize: 22, fontWeight: '900', color, marginBottom: 2 }}>
            {value}
          </Text>
          <Text
            style={{
              fontSize: 10,
              fontWeight: '600',
              color: theme.colors.textMuted,
              textTransform: 'uppercase',
              letterSpacing: 0.4,
            }}
          >
            {label}
          </Text>
        </View>
      ))}
    </View>
  )
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ProjectsScreen() {
  const theme = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [activeStatus, setActiveStatus] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const {
    data,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    refetch,
    isRefetching,
  } = useProjectList({ search: search || undefined, status: activeStatus || undefined })

  const allProjects = useMemo(
    () => (data?.pages ?? []).flatMap((p: any) => p.results ?? p ?? []) as AnyProject[],
    [data],
  )

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  return (
    <ModuleGuard module="projects" fallback={<ModuleLockedScreen module="Projects" />}>
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        {/* Header */}
        <View
          style={{
            paddingTop: insets.top + 8,
            paddingHorizontal: 16,
            paddingBottom: 12,
            backgroundColor: theme.colors.surface,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
          }}
        >
          <View
            style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}
          >
            <DrawerToggle />
            <Text
              style={{
                flex: 1,
                fontSize: 20,
                fontWeight: '900',
                color: theme.colors.text,
                marginLeft: 10,
              }}
            >
              Projects
            </Text>
            <RoleGuard permission="projects.manage">
              <TouchableOpacity
                onPress={() => setShowCreate(true)}
                style={{
                  backgroundColor: theme.primary[600],
                  borderRadius: 10,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Ionicons name="add" size={16} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>New</Text>
              </TouchableOpacity>
            </RoleGuard>
          </View>

          {/* Search bar */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: theme.colors.background,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: theme.colors.border,
              paddingHorizontal: 12,
              paddingVertical: 9,
              gap: 8,
            }}
          >
            <Ionicons name="search-outline" size={16} color={theme.colors.textMuted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search projects…"
              placeholderTextColor={theme.colors.textMuted}
              style={{ flex: 1, fontSize: 14, color: theme.colors.text }}
            />
            {search ? (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={16} color={theme.colors.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* Status filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{
            maxHeight: 48,
            backgroundColor: theme.colors.surface,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
          }}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingVertical: 8,
            gap: 8,
            alignItems: 'center',
          }}
        >
          <TouchableOpacity
            onPress={() => setActiveStatus(null)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 5,
              borderRadius: 99,
              backgroundColor: !activeStatus ? theme.primary[600] : theme.colors.background,
              borderWidth: 1,
              borderColor: !activeStatus ? theme.primary[600] : theme.colors.border,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: '700',
                color: !activeStatus ? '#fff' : theme.colors.textMuted,
              }}
            >
              All
            </Text>
          </TouchableOpacity>
          {ALL_STATUSES.map((s) => {
            const meta = STATUS_META[s]
            const isActive = activeStatus === s
            return (
              <TouchableOpacity
                key={s}
                onPress={() => setActiveStatus(isActive ? null : s)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 5,
                  borderRadius: 99,
                  backgroundColor: isActive ? meta.color : theme.colors.background,
                  borderWidth: 1,
                  borderColor: isActive ? meta.color : theme.colors.border,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '700',
                    color: isActive ? '#fff' : theme.colors.textMuted,
                    textTransform: 'capitalize',
                  }}
                >
                  {s.replace('_', ' ')}
                </Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>

        {/* List */}
        {isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color={theme.primary[500]} />
          </View>
        ) : (
          <FlashList
            data={allProjects}
            keyExtractor={(p) => String(p.id)}
            renderItem={({ item }) => (
              <ProjectCard
                project={item}
                onPress={() =>
                  router.push(`/(app)/(tabs)/projects/${item.id}` as any)
                }
              />
            )}
            estimatedItemSize={155}
            onEndReached={handleEndReached}
            onEndReachedThreshold={0.4}
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={refetch}
                tintColor={theme.primary[500]}
              />
            }
            ListHeaderComponent={
              allProjects.length > 0 ? (
                <View style={{ marginTop: 14 }}>
                  <StatsBar projects={allProjects} />
                </View>
              ) : null
            }
            ListEmptyComponent={
              <View style={{ alignItems: 'center', paddingTop: 80, gap: 12 }}>
                <Ionicons name="folder-outline" size={52} color={theme.colors.textMuted} />
                <Text
                  style={{ fontSize: 18, fontWeight: '700', color: theme.colors.text }}
                >
                  No projects found
                </Text>
                <Text
                  style={{
                    fontSize: 14,
                    color: theme.colors.textMuted,
                    textAlign: 'center',
                  }}
                >
                  {search || activeStatus
                    ? 'Try adjusting your filters'
                    : 'Create your first project to get started'}
                </Text>
              </View>
            }
            ListFooterComponent={
              isFetchingNextPage ? (
                <ActivityIndicator
                  style={{ marginVertical: 20 }}
                  color={theme.primary[500]}
                />
              ) : (
                <View style={{ height: insets.bottom + 80 }} />
              )
            }
          />
        )}

        <CreateProjectModal
          visible={showCreate}
          onClose={() => setShowCreate(false)}
          onCreated={() => qc.invalidateQueries({ queryKey: ['projects'] })}
        />
      </View>
    </ModuleGuard>
  )
}
