"""
Canonical permission key registry for custom roles.

Every key here can be toggled True/False in a Role.permissions JSON blob.
The permission_map endpoint exposes this to the frontend so the role editor
UI can render checkboxes without hardcoding keys.

Usage in ViewSets
-----------------
Set ``required_permission`` on the ViewSet class to enable JSON-based
permission checks for users with role='custom':

    class TicketViewSet(TenantMixin, viewsets.ModelViewSet):
        required_permission = 'tickets.view'   # checked for custom-role users

TenantRolePermission in core/permissions.py reads this attribute and checks
the matching key in the custom role's permissions dict.
"""

# ── Canonical permission map ──────────────────────────────────────────────────
# Structure: { "module.action": "Human-readable description" }
# Keys are intentionally dot-namespaced: <module>.<action>

PERMISSION_MAP: dict[str, str] = {
    # ── Tickets ───────────────────────────────────────────────────────────────
    "tickets.view":      "View all tickets in the workspace",
    "tickets.create":    "Create new tickets",
    "tickets.update":    "Edit ticket details, priority and status",
    "tickets.delete":    "Delete tickets",
    "tickets.assign":    "Assign tickets to staff members",
    "tickets.transfer":  "Transfer tickets between staff or departments",
    "tickets.close":     "Close and resolve tickets",
    "tickets.comment":   "Add comments to tickets",

    # ── Customers ─────────────────────────────────────────────────────────────
    "customers.view":    "View customer list and contact details",
    "customers.create":  "Add new customers",
    "customers.update":  "Edit customer information",
    "customers.delete":  "Archive / soft-delete customers",

    # ── Inventory ─────────────────────────────────────────────────────────────
    "inventory.view":       "View products, categories and stock levels",
    "inventory.manage":     "Add, edit and delete products and categories",
    "inventory.movements":  "Record manual stock movements",

    # ── Finance / Accounting ──────────────────────────────────────────────────
    "accounting.view_coins":      "View coin transactions",
    "accounting.manage_coins":    "Approve, reject and manually award coins",
    "accounting.view_invoices":   "View invoices",
    "accounting.manage_invoices": "Create, issue, void and mark invoices as paid",
    "accounting.view_payslips":   "View staff payslips",
    "accounting.manage_payslips": "Create and manage payslips",

    # ── Projects ──────────────────────────────────────────────────────────────
    "projects.view":         "View projects and task lists",
    "projects.create":       "Create new projects",
    "projects.update":       "Edit project details and milestones",
    "projects.delete":       "Delete projects",
    "projects.manage_tasks": "Create, update, assign and change task status",

    # ── Staff / HR ────────────────────────────────────────────────────────────
    "staff.view":   "View staff list, profiles and availability",
    "staff.manage": "Invite, update, deactivate and reset passwords for staff",

    # ── HRM ───────────────────────────────────────────────────────────────────
    "hrm.view":               "View staff directory and leave calendar",
    "hrm.manage":             "Manage leave types and HR configuration",
    "hrm.leave.apply":        "Submit leave requests",
    "hrm.leave.approve":      "Approve or reject leave requests",
    "hrm.attendance.view":    "View attendance records",
    "hrm.attendance.manage":  "Edit and add attendance records",
    "hrm.performance.view":   "View performance reviews",
    "hrm.performance.manage": "Create and submit performance reviews",

    # ── Reports ───────────────────────────────────────────────────────────────
    "reports.view": "Access reports and analytics dashboard",
}

# Grouped for the frontend role-editor UI (renders sections with checkboxes)
PERMISSION_GROUPS: list[dict] = [
    {
        "group": "Tickets",
        "keys": [k for k in PERMISSION_MAP if k.startswith("tickets.")],
    },
    {
        "group": "Customers",
        "keys": [k for k in PERMISSION_MAP if k.startswith("customers.")],
    },
    {
        "group": "Inventory",
        "keys": [k for k in PERMISSION_MAP if k.startswith("inventory.")],
    },
    {
        "group": "Finance & Accounting",
        "keys": [k for k in PERMISSION_MAP if k.startswith("accounting.")],
    },
    {
        "group": "Projects",
        "keys": [k for k in PERMISSION_MAP if k.startswith("projects.")],
    },
    {
        "group": "Staff & HR",
        "keys": [k for k in PERMISSION_MAP if k.startswith("staff.")],
    },
    {
        "group": "HRM",
        "keys": [k for k in PERMISSION_MAP if k.startswith("hrm.")],
    },
    {
        "group": "Reports",
        "keys": [k for k in PERMISSION_MAP if k.startswith("reports.")],
    },
]


# ── Preload role templates ────────────────────────────────────────────────────
# These are seeded automatically into every new tenant.
# Admins can edit or delete them; they can also create new roles from scratch.
# is_system_role=True means the name is protected from being changed (but
# permissions can still be customised per-tenant).

PRELOAD_ROLES: list[dict] = [
    {
        "name": "Finance",
        "description": "Access to all financial data — invoices, payslips, coins.",
        "is_system_role": True,
        "permissions": {
            "customers.view":             True,
            "accounting.view_coins":      True,
            "accounting.manage_coins":    True,
            "accounting.view_invoices":   True,
            "accounting.manage_invoices": True,
            "accounting.view_payslips":   True,
            "accounting.manage_payslips": True,
            "reports.view":               True,
        },
    },
    {
        "name": "Technician",
        "description": "Field technician — creates/works tickets, reads inventory.",
        "is_system_role": True,
        "permissions": {
            "tickets.view":    True,
            "tickets.create":  True,
            "tickets.update":  True,
            "tickets.comment": True,
            "customers.view":  True,
            "inventory.view":  True,
        },
    },
    {
        "name": "HR",
        "description": "Human resources — staff management and payslips.",
        "is_system_role": True,
        "permissions": {
            "staff.view":                 True,
            "staff.manage":               True,
            "accounting.view_payslips":   True,
            "accounting.manage_payslips": True,
            "reports.view":               True,
        },
    },
    {
        "name": "Support Agent",
        "description": "Customer support — full ticket and customer access.",
        "is_system_role": True,
        "permissions": {
            "tickets.view":    True,
            "tickets.create":  True,
            "tickets.update":  True,
            "tickets.comment": True,
            "tickets.close":   True,
            "customers.view":  True,
            "customers.create": True,
            "customers.update": True,
        },
    },
    {
        "name": "Project Manager",
        "description": "Full project and task management access.",
        "is_system_role": True,
        "permissions": {
            "projects.view":         True,
            "projects.create":       True,
            "projects.update":       True,
            "projects.delete":       True,
            "projects.manage_tasks": True,
            "customers.view":        True,
            "staff.view":            True,
            "reports.view":          True,
        },
    },
    {
        "name": "Read Only",
        "description": "View-only access across all modules. Cannot create or modify anything.",
        "is_system_role": True,
        "permissions": {
            "tickets.view":           True,
            "customers.view":         True,
            "inventory.view":         True,
            "accounting.view_coins":  True,
            "accounting.view_invoices": True,
            "accounting.view_payslips": True,
            "projects.view":          True,
            "staff.view":             True,
            "reports.view":           True,
        },
    },
]
