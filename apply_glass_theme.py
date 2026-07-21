import os
import re

directories = [
    r"C:\Users\titan\Documents\Titan Diamond\Overdue Inv\SalesPortal\src\app",
    r"C:\Users\titan\Documents\Titan Diamond\Overdue Inv\SalesPortal\src\components",
]

replacements = [
    # Backgrounds -> Glass Panels
    (r"bg-neutral-900", "glass-panel"),
    (r"bg-neutral-850", "glass-panel"),
    (r"bg-\[\#121316\]", "glass-panel"),
    (r"bg-\[\#1a1b21\]", "glass-panel"),
    
    # Very dark backgrounds -> Strong Glass Panels or transparent if it's the main wrapper
    (r"bg-neutral-950", "bg-black/20"),
    (r"bg-\[\#09090b\]", "bg-black/20"),
    (r"bg-\[\#0d0e12\]", "glass-panel-strong"),

    # Borders
    (r"border-neutral-800", "border-white/10"),
    (r"border-white/5", "border-white/10"),
    
    # Hovers
    (r"hover:bg-neutral-800", "hover:bg-white/10 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"),
    (r"hover:bg-white/\[0\.02\]", "hover:bg-white/10 hover:shadow-lg transition-all duration-300"),
    (r"hover:bg-white/\[0\.05\]", "hover:bg-white/15 hover:shadow-lg transition-all duration-300"),
    
    # Glows
    (r"glow-emerald", "glow-white"),
]

files_changed = 0

for directory in directories:
    for root, _, files in os.walk(directory):
        for file in files:
            if file.endswith(".tsx") or file.endswith(".ts"):
                filepath = os.path.join(root, file)
                with open(filepath, "r", encoding="utf-8") as f:
                    content = f.read()
                
                original_content = content
                for old, new in replacements:
                    content = re.sub(old, new, content)
                
                if content != original_content:
                    with open(filepath, "w", encoding="utf-8") as f:
                        f.write(content)
                    files_changed += 1
                    print(f"Updated {file}")

print(f"\nDone! Updated {files_changed} files.")
