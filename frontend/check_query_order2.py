import re
import glob

files = glob.glob('src/features/**/*.tsx', recursive=True)

for filepath in files:
    lines = open(filepath).read().splitlines()

    # Find useQuery declarations: const { data: varName ... } = useQuery(
    queries = []  # (varname, line_index)
    for i, line in enumerate(lines):
        m = re.match(r'\s*const\s*\{[^}]*\bdata:\s*(\w+)', line)
        if m and any('useQuery' in lines[j] for j in range(i, min(len(lines), i + 6))):
            queries.append((m.group(1), i))

    for varname, q_line in queries:
        # Find the enclosing top-level component function start
        func_start = 0
        for i in range(q_line, -1, -1):
            if re.search(r'export default function|^function\s+\w', lines[i]):
                func_start = i
                break

        for i in range(func_start + 1, q_line):
            stripped = lines[i].strip()
            if not stripped:
                continue
            if stripped.startswith('//') or stripped.startswith('*') or stripped.startswith('import'):
                continue
            # Stop scanning if we hit a nested sub-component or function definition
            if re.match(r'(function\s+\w|const\s+\w+\s*=\s*(function|\(|async))', stripped):
                break
            # Remove string literals to avoid false positives
            no_str = re.sub(r'"[^"]*"|\'[^\']*\'|`[^`]*`', '', lines[i])
            if not re.search(r'\b' + re.escape(varname) + r'\b', no_str):
                continue
            # Skip pure type annotations
            if re.search(r'[<:(]\s*' + re.escape(varname) + r'[\s,>\)]', no_str):
                continue
            print(f'{filepath}:{i+1}: "{varname}" used before useQuery at line {q_line+1}')
            print(f'  {stripped[:100]}')
