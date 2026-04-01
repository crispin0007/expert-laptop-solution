import re
import glob

files = (
    glob.glob('src/features/**/*.tsx', recursive=True) +
    glob.glob('src/features/**/*.ts', recursive=True)
)

for filepath in files:
    src = open(filepath).read()
    lines = src.splitlines()

    # Find all: const { data: varName ... } = useQuery (same line or next few)
    query_vars = {}  # varname -> line index
    for i, line in enumerate(lines):
        m = re.search(r'const\s*\{[^}]*\bdata:\s*(\w+)', line)
        if m:
            context = '\n'.join(lines[i:min(len(lines), i+5)])
            if 'useQuery' in context or 'useInfiniteQuery' in context:
                query_vars[m.group(1)] = i

    for varname, decl_idx in query_vars.items():
        pattern = re.compile(r'\b' + re.escape(varname) + r'\b')
        for i, line in enumerate(lines[:decl_idx]):
            stripped = line.strip()
            if stripped.startswith('//') or stripped.startswith('*') or stripped.startswith('import '):
                continue
            # Remove string literals to avoid matching 'varname' quoted
            line_no_strings = re.sub(r'"[^"]*"|\'[^\']*\'|`[^`]*`', '', line)
            if not pattern.search(line_no_strings):
                continue
            # Skip pure type annotation lines  e.g. ): varname =>
            if re.search(r':\s*' + re.escape(varname) + r'[\s,\)]', line_no_strings):
                continue
            print(f'{filepath}:{i+1}: "{varname}" used before useQuery at line {decl_idx+1}')
            print(f'  {stripped[:100]}')
