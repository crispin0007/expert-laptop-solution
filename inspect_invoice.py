#!/usr/bin/env python3
path = '/Users/crispin/Downloads/NEXUS_BMS/frontend/src/features/accounting/AccountingPage.tsx'
with open(path, 'r') as f:
    lines = f.readlines()

print(f"File has {len(lines)} lines")
print("Lines 545-590:")
for i, l in enumerate(lines[544:590], start=545):
    print(f"  {i}: {repr(l)}")
