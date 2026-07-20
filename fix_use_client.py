import os

for root, dirs, files in os.walk('src'):
    for file in files:
        if file.endswith('.tsx'):
            path = os.path.join(root, file)
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            if '"use client"' in content or "'use client'" in content:
                content = content.replace('"use client"', '').replace("'use client'", '')
                content = '"use client"\n' + content.lstrip()
                with open(path, 'w', encoding='utf-8') as f:
                    f.write(content)
