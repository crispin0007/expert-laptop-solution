#!/usr/bin/env python3
path = '/Users/crispin/Downloads/NEXUS_BMS/frontend/src/features/accounting/AccountingPage.tsx'
with open(path, 'r') as f:
    lines = f.readlines()

# Lines 549-572 (0-indexed 548-571) are duplicate orphaned content
# After fix: line 548 should be </td> (end of type td), line 549 should be qty td
print(f"File has {len(lines)} lines")
print(f"Line 548 (0-indexed 547): {repr(lines[547])}")
print(f"Line 573 (0-indexed 572): {repr(lines[572])}")

new_lines = lines[:548] + lines[572:]

print(f"\nNew file will have {len(new_lines)} lines")
print("Resulting lines 545-555:")
for i, l in enumerate(new_lines[544:555], start=545):
    print(f"  {i}: {l}", end='')

with open(path, 'w') as f:
    f.writelines(new_lines)

print("\n\nFile written.")
