import os

with open('supabase_services_seed.sql', 'r', encoding='utf-8') as f:
    content = f.read()

lines = content.split('\n')

# Find INSERT block boundaries
insert_starts = [i for i, l in enumerate(lines) if l.startswith('INSERT INTO')]
# Each block ends with "ON CONFLICT (id) DO NOTHING;" line
block_ends = [i for i, l in enumerate(lines) if l.strip() == 'ON CONFLICT (id) DO NOTHING;']

print(f"Found {len(insert_starts)} INSERT blocks")

# Group into files of ~4 blocks each (~2000 rows per file)
blocks_per_file = 4
output_dir = os.path.join('..', 'supabase_services_parts')
os.makedirs(output_dir, exist_ok=True)

file_num = 1
for i in range(0, len(insert_starts), blocks_per_file):
    chunk_start = insert_starts[i]
    chunk_end_idx = min(i + blocks_per_file - 1, len(block_ends) - 1)
    chunk_end = block_ends[chunk_end_idx] + 1  # include the ON CONFLICT line
    
    # Add header comment
    header = f"-- SOCIALPULSE SERVICES SEED - Part {file_num} of {(len(insert_starts) + blocks_per_file - 1) // blocks_per_file}\n"
    header += f"-- Paste and run this in Supabase SQL Editor\n\n"
    
    chunk_lines = lines[chunk_start:chunk_end]
    chunk_content = header + '\n'.join(chunk_lines) + '\n'
    
    filename = os.path.join(output_dir, f'services_part_{file_num}.sql')
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(chunk_content)
    
    size_kb = len(chunk_content.encode('utf-8')) / 1024
    print(f"Part {file_num}: {len(chunk_lines)} lines, {size_kb:.0f} KB -> {filename}")
    file_num += 1

print(f"\nDone! {file_num - 1} files created in {output_dir}")
