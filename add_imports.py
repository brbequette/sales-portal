import os

src_dir = r"src"

for root, _, files in os.walk(src_dir):
    for f in files:
        if not f.endswith('.tsx') and not f.endswith('.ts'):
            continue
        path = os.path.join(root, f)
        try:
            with open(path, "r", encoding="utf-8") as file:
                content = file.read()
            
            new_content = content
            
            # fix toastConfirm
            if 'toastConfirm(' in new_content and 'import { toastConfirm }' not in new_content:
                new_content = "import { toastConfirm } from '@/lib/toastConfirm'\n" + new_content
                
            # fix StandaloneOrderBuilder import in AccountSlideout
            if 'StandaloneOrderBuilder' in new_content and 'import { StandaloneOrderBuilder }' not in new_content:
                new_content = "import { StandaloneOrderBuilder } from '@/components/StandaloneOrderBuilder'\n" + new_content

            if new_content != content:
                print(f"Fixing imports in {path}")
                with open(path, "w", encoding="utf-8", newline="\n") as file:
                    file.write(new_content)
        except Exception as e:
            pass

print("Done fixing missing imports")
