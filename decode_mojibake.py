mojibake = [
    "â ±",
    "â ¸ï¸ ",
    "â ¹",
    "â ",
    "â Œ",
    "âœ",
    "âœ ï¸ ",
    "âš ",
    "âš ï¸ ",
    "ðŸ",
    "ðŸ ",
    "ðŸ ¢",
    "ðŸ ¦",
    "ðŸ¥",
    "ðŸ¥ˆ",
    "ðŸš«",
    "ðŸš€",
    "ðŸŽ",
    "ðŸŽ "
]

with open("decoded.txt", "w", encoding="utf-8") as f:
    for m in mojibake:
        try:
            decoded = m.encode('cp1252').decode('utf-8')
            f.write(f'    "{m}": "{decoded}",\n')
        except Exception as e:
            f.write(f'    "{m}": "ERROR: {e}",\n')
