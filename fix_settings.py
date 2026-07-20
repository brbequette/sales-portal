import os

path = 'src/app/admin/settings/page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('import SalesFlowBuilder from "@/components/SalesFlowBuilder"\n', '')
content = content.replace('<SalesFlowBuilder />\n', '')

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
