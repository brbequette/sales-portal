import os

src_dir = r"src"

for root, _, files in os.walk(src_dir):
    for f in files:
        if not f.endswith('.tsx') and not f.endswith('.ts'):
            continue
        path = os.path.join(root, f)
        with open(path, "r", encoding="utf-8") as file:
            content = file.read()
        
        # Check if there is the exact bad string:
        bad_str = "import {\nimport { toast } from 'react-hot-toast';\n"
        bad_str_2 = 'import {\nimport { toast } from "react-hot-toast";\n'
        
        if bad_str in content or bad_str_2 in content:
            print(f"Fixing {path}")
            content = content.replace(bad_str, "import { toast } from 'react-hot-toast';\nimport {\n")
            content = content.replace(bad_str_2, "import { toast } from 'react-hot-toast';\nimport {\n")
            with open(path, "w", encoding="utf-8", newline="\n") as file:
                file.write(content)
        
        # Wait, what if the bad string is like:
        # import { 
        # import { toast } from 'react-hot-toast';
        # It has a space after `{`. Let's use regex.
import re

for root, _, files in os.walk(src_dir):
    for f in files:
        if not f.endswith('.tsx') and not f.endswith('.ts'):
            continue
        path = os.path.join(root, f)
        try:
            with open(path, "r", encoding="utf-8") as file:
                content = file.read()
            
            new_content = re.sub(r'import\s*\{\s*\nimport\s*\{\s*toast\s*\}\s*from\s*[\'"]react-hot-toast[\'"];\n', 
                                 "import { toast } from 'react-hot-toast';\nimport {\n", content)
            
            if new_content != content:
                print(f"Fixing bad import in {path}")
                with open(path, "w", encoding="utf-8", newline="\n") as file:
                    file.write(new_content)
        except Exception as e:
            pass

print("Done fixing imports")
