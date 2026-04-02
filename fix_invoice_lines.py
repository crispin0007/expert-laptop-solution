#!/usr/bin/env python3
path = '/Users/crispin/Downloads/NEXUS_BMS/frontend/src/features/accounting/AccountingPage.tsx'
with open(path, 'r') as f:
    lines = f.readlines()

# Verify target lines (0-indexed 515-525 = display lines 516-526)
print("BEFORE (lines 516-526):")
for i, l in enumerate(lines[515:526], start=516):
    print(f"  {i}: {repr(l)}")

# Lines 515-524 (0-indexed) = lines 516-525 in editor
# These are: <td description input> and <td line_type select> (2 tds, 10 lines)
replacement = [
    '                    <td className="px-2 py-1.5">\n',
    '                      {l.line_type === \'product\' ? (\n',
    '                        <select\n',
    '                          value={l.product_id ?? \'\'}\n',
    '                          onChange={e => e.target.value\n',
    '                            ? selectProduct(i, Number(e.target.value))\n',
    '                            : setLine(i, \'product_id\', undefined)\n',
    '                          }\n',
    '                          className="w-full border-0 outline-none text-xs bg-transparent"\n',
    '                        >\n',
    '                          <option value="">— Select product —</option>\n',
    '                          {products.map(p => (\n',
    '                            <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : \'\'}</option>\n',
    '                          ))}\n',
    '                        </select>\n',
    '                      ) : (\n',
    '                        <input value={l.description} onChange={e => setLine(i, \'description\', e.target.value)}\n',
    '                          placeholder="Item description" className="w-full border-0 outline-none text-xs bg-transparent" required />\n',
    '                      )}\n',
    '                    </td>\n',
    '                    <td className="px-2 py-1.5">\n',
    '                      <select value={l.line_type} onChange={e => {\n',
    '                        const t = e.target.value as \'service\' | \'product\'\n',
    '                        setLines(ls => ls.map((ln, j) => j === i\n',
    '                          ? { ...ln, line_type: t, product_id: undefined, description: \'\', unit_price: \'\' }\n',
    '                          : ln\n',
    '                        ))\n',
    '                      }}\n',
    '                        className="w-full border-0 outline-none text-xs bg-transparent">\n',
    '                        <option value="service">Service</option>\n',
    '                        <option value="product">Product</option>\n',
    '                      </select>\n',
    '                    </td>\n',
]

new_lines = lines[:515] + replacement + lines[525:]

with open(path, 'w') as f:
    f.writelines(new_lines)

print(f"\nDone. Original: {len(lines)} lines, New: {len(new_lines)} lines")
print("\nAFTER (new lines 516-548):")
with open(path, 'r') as f:
    new = f.readlines()
for i, l in enumerate(new[515:548], start=516):
    print(f"  {i}: {l}", end='')
