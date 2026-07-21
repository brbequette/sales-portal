import os
import re

directories = [
    r"C:\Users\titan\Documents\Titan Diamond\Overdue Inv\SalesPortal\src"
]

found_chars = set()
pattern = re.compile(r"([Ãâ][\x80-\xffÂ-ÿâ€-™œ\w]+|Ã—|â€|â€¢|â€¦|â€œ|â€|â€˜|â€™)")

for directory in directories:
    for root, _, files in os.walk(directory):
        for file in files:
            if file.endswith((".tsx", ".ts", ".css")):
                filepath = os.path.join(root, file)
                try:
                    with open(filepath, "r", encoding="utf-8") as f:
                        content = f.read()
                    
                    matches = pattern.findall(content)
                    if matches:
                        for m in matches:
                            found_chars.add(m)
                        print(f"Found in {file}: {set(matches)}")
                except Exception as e:
                    pass

print(f"\nUnique mojibake strings found:")
for char in found_chars:
    print(repr(char))
