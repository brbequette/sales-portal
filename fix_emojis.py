import os

directories = [
    r"C:\Users\titan\Documents\Titan Diamond\Overdue Inv\SalesPortal\src"
]

replacements = {
    "â ±": "⏱",
    "â ¸ï¸ ": "⏸️",
    "â ¹": "⏹",
    "â Œ": "❌",
    "âœ ï¸ ": "✍️",
    "âœ ": "✍",
    "âš ï¸ ": "⚠️",
    "âš ": "⚠",
    "ðŸ ¢": "🏢",
    "ðŸ ¦": "🏦",
    "ðŸ¥ˆ": "🥈",
    "ðŸš«": "🚫",
    "ðŸš€": "🚀",
    "ðŸŽ ": "🎁",
    "ðŸ’³": "💳",
    "ðŸ“„": "📄",
    "ðŸ”—": "🔗",
    "ðŸ…¿ï¸ ": "🅿️",
    # any missing ones that were matched by just "ðŸ " or "ðŸ":
    "ðŸ’½": "💾",
    "ðŸ‘¤": "👤",
    "ðŸ‘¥": "👥",
    "ðŸ“…": "📅",
    "ðŸ”’": "🔒",
    "ðŸ“ ": "📍",
    "Ã—": "×",
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
                        print(f"Fixed emojis in {file}")
                except Exception as e:
                    pass

print(f"\nDone! Fixed {files_changed} files.")
