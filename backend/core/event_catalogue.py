"""
NEXUS BMS — Canonical Event Catalogue
Single source of truth for all domain event names.

Rules:
  - Format: [module].[noun].[verb]  e.g. ticket.status.changed
  - Never invent names outside this file.
  - To add a new event: add it here first, then use it.
  - Payloads always include {'id': ..., 'tenant_id': ...} at minimum.
  - Decimal fields in payloads → str() always (JSON safety).
"""

EVENT_CATALOGUE: dict[str, str] = {
    # ── TICKETS ───────────────────────────────────────────────────────────────
    'ticket.created':            'New ticket created',
    'ticket.assigned':           'Ticket assigned to staff',
    'ticket.status.changed':     'Ticket status changed',
    'ticket.resolved':           'Ticket resolved',
    'ticket.closed':             'Ticket closed',
    'ticket.reopened':           'Ticket reopened',
    'ticket.overdue':            'Ticket past SLA deadline',
    'ticket.escalated':          'Ticket escalated',
    'ticket.comment.added':      'Comment added to ticket',

    # ── CUSTOMERS ─────────────────────────────────────────────────────────────
    'customer.created':          'New customer added',
    'customer.updated':          'Customer profile updated',
    'customer.deleted':          'Customer soft deleted',
    'customer.birthday':         'Customer birthday today',
    'customer.inactive':         'Customer inactive 30+ days',

    # ── DEPARTMENTS ───────────────────────────────────────────────────────────
    'department.created':        'New department created',
    'department.updated':        'Department updated',
    'department.deleted':        'Department deleted',

    # ── INVENTORY ─────────────────────────────────────────────────────────────
    'inventory.product.created': 'New product added',
    'inventory.product.updated': 'Product updated',
    'inventory.product.deleted': 'Product deleted',
    'inventory.stock.low':       'Stock below threshold',
    'inventory.stock.out':       'Product out of stock',
    'inventory.stock.added':     'Stock quantity increased',
    'inventory.product.published': 'Product published to website',

    # ── ACCOUNTING ────────────────────────────────────────────────────────────
    'invoice.created':           'Invoice generated',
    'invoice.sent':              'Invoice sent to customer',
    'invoice.paid':              'Invoice paid',
    'invoice.overdue':           'Invoice overdue',
    'invoice.cancelled':         'Invoice cancelled',
    'expense.created':           'Expense recorded',
    'expense.approved':          'Expense approved',
    'payroll.processed':         'Payroll run completed',
    'payroll.payslip.generated': 'Payslip generated',

    # ── STAFF / HR ────────────────────────────────────────────────────────────
    'staff.created':             'New staff added',
    'staff.updated':             'Staff profile updated',
    'staff.deleted':             'Staff removed',
    'staff.absent':              'Staff absent',
    'staff.leave.requested':     'Leave requested',
    'staff.leave.approved':      'Leave approved',
    'staff.leave.rejected':      'Leave rejected',

    # ── CMS (Phase 3) ─────────────────────────────────────────────────────────
    'cms.site.generated':        'AI generated website designs',
    'cms.design.selected':       'Tenant selected design',
    'cms.site.published':        'Website published',
    'cms.site.unpublished':      'Website taken offline',
    'cms.page.updated':          'CMS page updated',
    'cms.blog.published':        'Blog post published',
    'cms.domain.verified':       'Custom domain verified',
    'cms.order.placed':          'Order via website',

    # ── APPOINTMENTS (Phase 2) ────────────────────────────────────────────────
    'appointment.created':       'Appointment booked',
    'appointment.confirmed':     'Appointment confirmed',
    'appointment.cancelled':     'Appointment cancelled',
    'appointment.rescheduled':   'Appointment rescheduled',
    'appointment.reminder.24h':  'Appointment in 24 hours',
    'appointment.reminder.1h':   'Appointment in 1 hour',
    'appointment.completed':     'Appointment completed',
    'appointment.noshow':        'No show',

    # ── CRM (Phase 2) ─────────────────────────────────────────────────────────
    'lead.created':              'New lead added',
    'lead.assigned':             'Lead assigned',
    'lead.converted':            'Lead converted to customer',
    'deal.created':              'Deal created',
    'deal.stage.changed':        'Deal stage changed',
    'deal.won':                  'Deal won',
    'deal.lost':                 'Deal lost',

    # ── PROJECTS ──────────────────────────────────────────────────────────────
    'project.created':           'Project created',
    'project.completed':         'Project completed',
    'task.created':              'Task created',
    'task.assigned':             'Task assigned',
    'task.completed':            'Task completed',
    'task.overdue':              'Task overdue',

    # ── WHATSAPP (Phase 2) ────────────────────────────────────────────────────
    'whatsapp.message.received': 'Inbound WhatsApp message',
    'whatsapp.message.failed':   'WhatsApp delivery failed',

    # ── AI ASSISTANT (Phase 3) ────────────────────────────────────────────────
    'ai.command.executed':       'AI command executed',
    'ai.command.failed':         'AI command failed',
    'ai.generation.completed':   'AI website generation done',

    # ── SYSTEM ────────────────────────────────────────────────────────────────
    'tenant.created':            'New tenant onboarded',
    'tenant.suspended':          'Tenant suspended',
    'subscription.changed':      'Plan changed',
    'module.enabled':            'Module enabled for tenant',
    'module.disabled':           'Module disabled for tenant',
    'user.login':                'User logged in',
    'user.logout':               'User logged out',
    'user.password.changed':     'Password changed',
}
