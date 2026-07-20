import os
import re

src_dir = r"src"

for root, _, files in os.walk(src_dir):
    for f in files:
        if not f.endswith('.tsx') and not f.endswith('.ts'):
            continue
        path = os.path.join(root, f)
        try:
            with open(path, "r", encoding="utf-8") as file:
                content = file.read()
            
            new_content = content.replace("import { toast } from 'react-hot-toast';\n  Fi", "import { toast } from 'react-hot-toast';\nimport {\n  Fi")
            
            if new_content != content:
                print(f"Fixing bad import in {path}")
                with open(path, "w", encoding="utf-8", newline="\n") as file:
                    file.write(new_content)
        except Exception as e:
            pass

print("Done fixing imports")
