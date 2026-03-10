import React, { useState } from 'react'
import { View, Text, TouchableOpacity, ScrollView, FlatList, TextInput, Alert, KeyboardAvoidingView, Platform } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@/theme/ThemeContext'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useTicketTypes, useTicketCategories, useTicketSubcategories, useCreateTicket } from '@/features/tickets/useTickets'
import { useCustomerPicker } from '@/features/customers/useCustomers'
import { useStaffPicker } from '@/features/staff/useStaff'

// ─── Zod schema ────────────────────────────────────────────────────────────
const schema = z.object({
  ticket_type: z.number({ required_error: 'Select a ticket type' }),
  ticket_type_name: z.string().optional(),
  customer: z.number({ required_error: 'Select a customer' }),
  customer_name: z.string().optional(),
  category: z.number().optional(),
  subcategory: z.number().optional(),
  assigned_to: z.number().optional(),
  assigned_name: z.string().optional(),
  title: z.string().min(5, 'Title must be at least 5 characters'),
  description: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
})
type FormData = z.infer<typeof schema>

const STEPS = ['Type', 'Customer', 'Details', 'Assign']
const STEP_ICONS = ['pricetag-outline', 'person-outline', 'create-outline', 'people-outline']
const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const

export default function NewTicketModal() {
  const theme = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [step, setStep] = useState(0)
  const [customerSearch, setCustomerSearch] = useState('')
  const [staffSearch, setStaffSearch] = useState('')

  const { control, handleSubmit, setValue, watch, formState: { errors, isValid } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { priority: 'medium', description: '' },
    mode: 'onChange',
  })

  const selectedType = watch('ticket_type')
  const selectedCustomer = watch('customer')
  const selectedCategory = watch('category')

  // ── Data fetches ────────────────────────────────────────────────────────────────────
  const { data: ticketTypes } = useTicketTypes()
  const { data: categories } = useTicketCategories(selectedType)
  const { data: subcategories } = useTicketSubcategories(selectedCategory)
  const { data: customers } = useCustomerPicker(customerSearch)
  const { data: staffList } = useStaffPicker(staffSearch)

  // ── Mutation ──────────────────────────────────────────────────────────────
  const createMutation = useCreateTicket()

  function goNext() { setStep((s) => Math.min(s + 1, STEPS.length - 1)) }
  function goBack() {
    if (step === 0) { router.dismiss(); return }
    setStep((s) => Math.max(s - 1, 0))
  }

  const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
    low: { bg: '#f0fdf4', text: '#166534' },
    medium: { bg: '#eff6ff', text: '#1e40af' },
    high: { bg: '#fff7ed', text: '#9a3412' },
    critical: { bg: '#fef2f2', text: '#991b1b' },
  }

  // ── Step 0: Ticket Type ───────────────────────────────────────────────────
  function TypeStep() {
    return (
      <ScrollView contentContainerStyle={{ gap: 10, padding: 16 }}>
        <Text style={{ fontSize: 13, color: theme.colors.textMuted, marginBottom: 2 }}>
          Select the type of support this ticket requires.
        </Text>
        {(ticketTypes ?? []).map((t: { id: number; name: string; description?: string }) => {
          const selected = selectedType === t.id
          return (
            <TouchableOpacity
              key={t.id}
              onPress={() => { setValue('ticket_type', t.id); setValue('ticket_type_name', t.name); goNext() }}
              activeOpacity={0.7}
              style={{
                backgroundColor: selected ? theme.primary[50] : theme.colors.surface,
                borderWidth: 2,
                borderColor: selected ? theme.primary[500] : theme.colors.border,
                borderRadius: 14,
                padding: 16,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.05,
                shadowRadius: 3,
                elevation: 1,
              }}
            >
              <View style={{
                width: 42, height: 42, borderRadius: 12,
                backgroundColor: selected ? theme.primary[100] : theme.colors.background,
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 1,
                borderColor: selected ? theme.primary[200] : theme.colors.border,
              }}>
                <Ionicons name="pricetag-outline" size={20} color={selected ? theme.primary[600] : theme.colors.textMuted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: theme.fontSize.base, fontWeight: '700', color: selected ? theme.primary[700] : theme.colors.text, marginBottom: 2 }}>
                  {t.name}
                </Text>
                {t.description && (
                  <Text style={{ fontSize: theme.fontSize.xs, color: theme.colors.textMuted, lineHeight: 16 }}>
                    {t.description}
                  </Text>
                )}
              </View>
              <Ionicons name={selected ? 'checkmark-circle' : 'chevron-forward'} size={20} color={selected ? theme.primary[500] : theme.colors.border} />
            </TouchableOpacity>
          )
        })}
      </ScrollView>
    )
  }

  // ── Step 1: Customer ──────────────────────────────────────────────────────
  function CustomerStep() {
    return (
      <View style={{ flex: 1 }}>
        <View style={{ padding: 16, paddingBottom: 8 }}>
          <Input value={customerSearch} onChangeText={setCustomerSearch} placeholder="Search customers..." />
        </View>
        <FlatList
          data={customers ?? []}
          keyExtractor={(c) => String(c.id)}
          renderItem={({ item: c }) => (
            <TouchableOpacity
              onPress={() => { setValue('customer', c.id); setValue('customer_name', c.name); goNext() }}
              activeOpacity={0.7}
              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border, backgroundColor: selectedCustomer === c.id ? theme.primary[50] : undefined }}
            >
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.primary[100], alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: theme.fontWeight.semibold, color: theme.primary[700] }}>{(c.name ?? '?')[0]?.toUpperCase()}</Text>
              </View>
              <View>
                <Text style={{ fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.medium, color: theme.colors.text }}>{c.name}</Text>
                {c.email && <Text style={{ fontSize: theme.fontSize.xs, color: theme.colors.textMuted }}>{c.email}</Text>}
              </View>
            </TouchableOpacity>
          )}
        />
      </View>
    )
  }

  // ── Step 2: Details ───────────────────────────────────────────────────────
  function DetailsStep() {
    const priority = watch('priority')
    return (
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Controller control={control} name="title" render={({ field: { onChange, value } }) => (
          <Input label="Title *" value={value} onChangeText={onChange} placeholder="Brief description of the issue" error={errors.title?.message} />
        )} />
        <Controller control={control} name="description" render={({ field: { onChange, value } }) => (
          <View>
            <Text style={{ fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.medium, color: theme.colors.text, marginBottom: 6 }}>Description</Text>
            <TextInput
              value={value}
              onChangeText={onChange}
              placeholder="Detailed description (optional)..."
              multiline
              numberOfLines={5}
              textAlignVertical="top"
              style={{ backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, padding: 12, fontSize: theme.fontSize.sm, color: theme.colors.text, minHeight: 100 }}
            />
          </View>
        )} />

        <View>
          <Text style={{ fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.medium, color: theme.colors.text, marginBottom: 8 }}>Priority</Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {PRIORITIES.map((p) => (
              <TouchableOpacity
                key={p}
                onPress={() => setValue('priority', p)}
                style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, borderWidth: 2, backgroundColor: priority === p ? PRIORITY_COLORS[p].bg : theme.colors.surface, borderColor: priority === p ? PRIORITY_COLORS[p].text : theme.colors.border }}
              >
                <Text style={{ fontSize: theme.fontSize.xs, fontWeight: theme.fontWeight.semibold, color: priority === p ? PRIORITY_COLORS[p].text : theme.colors.textMuted, textTransform: 'capitalize' }}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Category selection */}
        {(categories ?? []).length > 0 && (
          <View>
            <Text style={{ fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.medium, color: theme.colors.text, marginBottom: 8 }}>Category (optional)</Text>
            <View style={{ gap: 6 }}>
              {(categories ?? []).map((cat: { id: number; name: string }) => (
                <TouchableOpacity
                  key={cat.id}
                  onPress={() => { setValue('category', watch('category') === cat.id ? undefined : cat.id); setValue('subcategory', undefined) }}
                  style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: watch('category') === cat.id ? theme.primary[500] : theme.colors.border, backgroundColor: watch('category') === cat.id ? theme.primary[50] : theme.colors.surface }}
                >
                  <Text style={{ fontSize: theme.fontSize.sm, color: watch('category') === cat.id ? theme.primary[700] : theme.colors.text }}>{cat.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Subcategory selection */}
        {(subcategories ?? []).length > 0 && (
          <View>
            <Text style={{ fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.medium, color: theme.colors.text, marginBottom: 8 }}>Subcategory (optional)</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {(subcategories ?? []).map((sub: { id: number; name: string }) => (
                <TouchableOpacity
                  key={sub.id}
                  onPress={() => setValue('subcategory', watch('subcategory') === sub.id ? undefined : sub.id)}
                  style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: watch('subcategory') === sub.id ? theme.primary[500] : theme.colors.border, backgroundColor: watch('subcategory') === sub.id ? theme.primary[50] : theme.colors.surface }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: watch('subcategory') === sub.id ? theme.primary[700] : theme.colors.textMuted }}>{sub.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <View style={{ marginTop: 8 }}>
          <Button label="Next: Assign Staff" variant="primary" onPress={goNext} disabled={!watch('title') || (watch('title')?.length ?? 0) < 5} fullWidth />
        </View>
      </ScrollView>
    )
  }

  // ── Step 3: Assignment ────────────────────────────────────────────────────
  function AssignStep() {
    const assignedTo = watch('assigned_to')
    return (
      <View style={{ flex: 1 }}>
        <View style={{ padding: 16, paddingBottom: 8 }}>
          <Input value={staffSearch} onChangeText={setStaffSearch} placeholder="Search staff..." />
          <Text style={{ fontSize: theme.fontSize.xs, color: theme.colors.textMuted, marginTop: 6 }}>Leave unassigned to create a queue ticket.</Text>
        </View>
        <FlatList
          data={staffList ?? []}
          keyExtractor={(s) => String(s.id)}
          renderItem={({ item: s }) => (
            <TouchableOpacity
              onPress={() => { setValue('assigned_to', assignedTo === s.id ? undefined : s.id); setValue('assigned_name', s.full_name) }}
              activeOpacity={0.7}
              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border, backgroundColor: assignedTo === s.id ? theme.primary[50] : undefined }}
            >
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.primary[100], alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: theme.fontWeight.semibold, color: theme.primary[700] }}>{(s.full_name ?? '?')[0]?.toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.medium, color: theme.colors.text }}>{s.full_name}</Text>
                {s.department_name && <Text style={{ fontSize: theme.fontSize.xs, color: theme.colors.textMuted }}>{s.department_name}</Text>}
              </View>
              {assignedTo === s.id && <Ionicons name="checkmark-circle" size={20} color={theme.primary[500]} />}
            </TouchableOpacity>
          )}
          ListHeaderComponent={
            <TouchableOpacity
              onPress={() => { setValue('assigned_to', undefined); setValue('assigned_name', undefined) }}
              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.border, backgroundColor: !assignedTo ? theme.primary[50] : undefined }}
            >
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.border, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                <Text style={{ fontSize: 16 }}>—</Text>
              </View>
              <Text style={{ fontSize: theme.fontSize.sm, color: theme.colors.textMuted }}>Unassigned (queue)</Text>
              {!assignedTo && <Ionicons name="checkmark-circle" size={20} color={theme.primary[500]} style={{ marginLeft: 'auto' }} />}
            </TouchableOpacity>
          }
        />
        <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: theme.colors.border, paddingBottom: insets.bottom + 16 }}>
          <Button label="Create Ticket" variant="primary" onPress={handleSubmit((data) => createMutation.mutate({
            ticket_type: data.ticket_type,
            customer: data.customer,
            category: data.category ?? null,
            subcategory: data.subcategory ?? null,
            assigned_to: data.assigned_to ?? null,
            title: data.title,
            description: data.description,
            priority: data.priority,
          }, {
            onSuccess: (newTicket: any) => { router.dismiss(); if (newTicket?.id) router.push(`/(app)/(tabs)/tickets/${newTicket.id}` as never) },
            onError: () => Alert.alert('Error', 'Could not create ticket. Please check the details and try again.'),
          }))} loading={createMutation.isPending} fullWidth />
        </View>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Header */}
      <View style={{
        paddingTop: insets.top + 10,
        paddingHorizontal: 16,
        paddingBottom: 16,
        backgroundColor: theme.colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 3,
      }}>
        {/* Nav row */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <TouchableOpacity
            onPress={goBack}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4, marginLeft: -4 }}
          >
            {step === 0 ? (
              <>
                <Ionicons name="close" size={18} color={theme.colors.textMuted} />
                <Text style={{ color: theme.colors.textMuted, fontSize: 14, fontWeight: '600' }}>Cancel</Text>
              </>
            ) : (
              <>
                <Ionicons name="chevron-back" size={18} color={theme.primary[600]} />
                <Text style={{ color: theme.primary[600], fontSize: 14, fontWeight: '600' }}>Back</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={{ fontSize: 16, fontWeight: '800', color: theme.colors.text }}>New Ticket</Text>

          <Text style={{ fontSize: 12, color: theme.colors.textMuted, fontWeight: '500' }}>
            {step + 1} of {STEPS.length}
          </Text>
        </View>

        {/* Step indicator */}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {STEPS.map((s, i) => {
            const done = i < step
            const current = i === step
            return (
              <React.Fragment key={s}>
                <View style={{ alignItems: 'center', gap: 5 }}>
                  <View style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: done ? theme.primary[600] : current ? theme.primary[50] : theme.colors.background,
                    borderWidth: current ? 2 : done ? 0 : 1.5,
                    borderColor: current ? theme.primary[500] : theme.colors.border,
                  }}>
                    {done ? (
                      <Ionicons name="checkmark" size={16} color="#fff" />
                    ) : (
                      <Ionicons
                        name={STEP_ICONS[i] as never}
                        size={15}
                        color={current ? theme.primary[600] : theme.colors.textMuted}
                      />
                    )}
                  </View>
                  <Text style={{
                    fontSize: 9,
                    fontWeight: '700',
                    color: current ? theme.primary[600] : done ? theme.primary[500] : theme.colors.textMuted,
                    letterSpacing: 0.3,
                  }}>
                    {s.toUpperCase()}
                  </Text>
                </View>
                {i < STEPS.length - 1 && (
                  <View style={{
                    flex: 1,
                    height: 2,
                    backgroundColor: i < step ? theme.primary[400] : theme.colors.border,
                    marginBottom: 18,
                    marginHorizontal: 4,
                  }} />
                )}
              </React.Fragment>
            )
          })}
        </View>
      </View>

      {step === 0 && <TypeStep />}
      {step === 1 && <CustomerStep />}
      {step === 2 && <DetailsStep />}
      {step === 3 && <AssignStep />}
    </KeyboardAvoidingView>
  )
}
