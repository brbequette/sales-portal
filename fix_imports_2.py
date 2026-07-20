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
            
            # Look for lines that contain: import { toast } from 'react-hot-toast';
            # immediately following an `import {` line
            new_content = re.sub(
                r'(import\s*\{[\s\r\n]*)(import\s*\{\s*toast\s*\}\s*from\s*[\'"]react-hot-toast[\'"];[\s\r\n]*)', 
                r"\2\1", 
                content
            )
            
            if new_content != content:
                print(f"Fixing bad import in {path}")
                with open(path, "w", encoding="utf-8", newline="\n") as file:
                    file.write(new_content)
        except Exception as e:
            pass

print("Done fixing imports")
