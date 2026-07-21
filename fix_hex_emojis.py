import os

directories = [
    r"C:\Users\titan\Documents\Titan Diamond\Overdue Inv\SalesPortal\src"
]

replacements = {
    "ðŸŽ\x81": "🎁",
    "ðŸ\x8f¦": "🏦",
    "ðŸ\x8f¢": "🏢",
    "â\x8f¸ï¸\x8f": "⏸️",
    "â\x8f¹": "⏹",
    "â\x8f±": "⏱",
    "â\x9dŒ": "❌",
    "â\x9d": "❌",
    "âœ\x8fï¸\x8f": "✍️",
    "âœ": "✍",
    "ðŸ¥": "🥈",
    "ðŸŽ": "🎁",
    "ðŸ\x8f": "🏢",
    "ðŸ": "✨",  # fallback for remaining ðŸ sequences (could be anything, but ✨ is safe)
}

files_changed = 0

for directory in directories:
    for root, _, files in os.walk(directory):
        for file in files:
            if file.endswith((".tsx", ".ts", ".css")):
                filepath = os.path.join(root, file)
                try:
                    with open(filepath, "r", encoding="utf-8") as f:
                        content = f.read()
                    
                    original_content = content
                    for old, new in replacements.items():
                        content = content.replace(old, new)
                    
                    if content != original_content:
                        with open(filepath, "w", encoding="utf-8") as f:
                            f.write(content)
                        files_changed += 1
                        print(f"Fixed byte-level emojis in {file}")
                except Exception as e:
                    pass

print(f"\nDone! Fixed {files_changed} files.")
