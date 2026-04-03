import re

path = '/Users/crispin/Downloads/NEXUS_BMS/frontend/src/features/accounting/AccountingPage.tsx'
content = open(path).read()
original = content

# 1. Remove ListFilter from import
content = content.replace(
    '  Zap, Eye, EyeOff, Info, ListFilter, Wallet,',
    '  Zap, Eye, EyeOff, Info, Wallet,'
)

# 2. Remove duplicate data-lpignore="true" (trailing one before />)
content = content.replace(' autoComplete="off" data-lpignore="true" />', ' autoComplete="off" />')

# 3. Fix MonthlyCrossData casts (4 replacements - only 3 unique due to entityKey="item" appearing twice)
content = content.replace(
    '      case \'sales-by-customer-monthly\':\n        return <MonthlyCrossTableView data={d as MonthlyCrossData} entityKey="customer" />\n      case \'sales-by-item-monthly\':\n        return <MonthlyCrossTableView data={d as MonthlyCrossData} entityKey="item" />\n      case \'purchase-by-supplier-monthly\':\n        return <MonthlyCrossTableView data={d as MonthlyCrossData} entityKey="supplier" />\n      case \'purchase-by-item-monthly\':\n        return <MonthlyCrossTableView data={d as MonthlyCrossData} entityKey="item" />',
    '      case \'sales-by-customer-monthly\':\n        return <MonthlyCrossTableView data={d as unknown as MonthlyCrossData} entityKey="customer" />\n      case \'sales-by-item-monthly\':\n        return <MonthlyCrossTableView data={d as unknown as MonthlyCrossData} entityKey="item" />\n      case \'purchase-by-supplier-monthly\':\n        return <MonthlyCrossTableView data={d as unknown as MonthlyCrossData} entityKey="supplier" />\n      case \'purchase-by-item-monthly\':\n        return <MonthlyCrossTableView data={d as unknown as MonthlyCrossData} entityKey="item" />'
)

# 4. Prefix unused tab functions
content = content.replace('\nfunction ReportsTab() {\n', '\nfunction _ReportsTab() {\n')
content = content.replace(
    '\nfunction ComingSoonTab({ title, hint }: { title: string; hint?: string }) {',
    '\nfunction _ComingSoonTab({ title, hint }: { title: string; hint?: string }) {'
)

# 5. Fix useFyStore unused destructures
content = content.replace(
    '  const { fyYear, setFyYear } = useFyStore()',
    '  const { fyYear: _fyYear, setFyYear: _setFyYear } = useFyStore()'
)

# 6. Remove all unused user declarations
replacements = [
    (
        'function InvoicesTab() {\n  const qc = useQueryClient()\n  const confirm = useConfirm()\n  const user = useAuthStore(s => s.user)\n  const { can } = usePermissions()',
        'function InvoicesTab() {\n  const qc = useQueryClient()\n  const confirm = useConfirm()\n  const { can } = usePermissions()'
    ),
    (
        'function BillsTab() {\n  const qc = useQueryClient()\n  const confirm = useConfirm()\n  const user = useAuthStore(s => s.user)\n  const { can } = usePermissions()',
        'function BillsTab() {\n  const qc = useQueryClient()\n  const confirm = useConfirm()\n  const { can } = usePermissions()'
    ),
    (
        'function PaymentsTab() {\n  const qc = useQueryClient()\n  const confirm = useConfirm()\n  const user = useAuthStore(s => s.user)\n  const { can } = usePermissions()',
        'function PaymentsTab() {\n  const qc = useQueryClient()\n  const confirm = useConfirm()\n  const { can } = usePermissions()'
    ),
    (
        'function CreditNotesTab() {\n  const qc = useQueryClient()\n  const confirm = useConfirm()\n  const user = useAuthStore(s => s.user)\n  const { can } = usePermissions()',
        'function CreditNotesTab() {\n  const qc = useQueryClient()\n  const confirm = useConfirm()\n  const { can } = usePermissions()'
    ),
    (
        'function JournalsTab() {\n  const qc = useQueryClient()\n  const { user } = useAuthStore()\n  const { can } = usePermissions()',
        'function JournalsTab() {\n  const qc = useQueryClient()\n  const { can } = usePermissions()'
    ),
    (
        'function BanksTab() {\n  const qc = useQueryClient()\n  const confirm = useConfirm()\n  const user = useAuthStore(s => s.user)\n  const { can } = usePermissions()',
        'function BanksTab() {\n  const qc = useQueryClient()\n  const confirm = useConfirm()\n  const { can } = usePermissions()'
    ),
    (
        'function PayslipsTab() {\n  const qc = useQueryClient()\n  const confirm = useConfirm()\n  const user = useAuthStore(s => s.user)\n  const { can } = usePermissions()',
        'function PayslipsTab() {\n  const qc = useQueryClient()\n  const confirm = useConfirm()\n  const { can } = usePermissions()'
    ),
    (
        'function QuotationsTab() {\n  const qc = useQueryClient()\n  const confirm = useConfirm()\n  const user = useAuthStore(s => s.user)\n  const { can } = usePermissions()',
        'function QuotationsTab() {\n  const qc = useQueryClient()\n  const confirm = useConfirm()\n  const { can } = usePermissions()'
    ),
    (
        'function TDSTab() {\n  const qc = useQueryClient()\n  const confirm = useConfirm()\n  const user = useAuthStore(s => s.user)\n  const { can } = usePermissions()',
        'function TDSTab() {\n  const qc = useQueryClient()\n  const confirm = useConfirm()\n  const { can } = usePermissions()'
    ),
    (
        'function BankReconciliationTab() {\n  const qc = useQueryClient()\n  const confirm = useConfirm()\n  const user = useAuthStore(s => s.user)\n  const { can } = usePermissions()',
        'function BankReconciliationTab() {\n  const qc = useQueryClient()\n  const confirm = useConfirm()\n  const { can } = usePermissions()'
    ),
]

for old, new in replacements:
    if old not in content:
        print(f"WARNING: pattern not found: {old[:60]}")
    content = content.replace(old, new)

if content == original:
    print("ERROR: No changes made!")
else:
    open(path, 'w').write(content)
    # Verify
    remaining_user = sum(1 for line in content.split('\n') if 'const user = useAuthStore' in line or 'const { user } = useAuthStore' in line)
    remaining_dup_lp = content.count('autoComplete="off" data-lpignore="true" />')
    old_casts = content.count('data={d as MonthlyCrossData}')
    print(f"Remaining user vars: {remaining_user}")
    print(f"Remaining duplicate data-lpignore: {remaining_dup_lp}")
    print(f"Remaining old MonthlyCrossData casts: {old_casts}")
    print("Done!")
