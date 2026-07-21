import os

filepath = r"C:\Users\titan\Documents\Titan Diamond\Overdue Inv\SalesPortal\src\components\GlobalTopBar.tsx"

with open(filepath, "r", encoding="utf-8") as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if "Ã—" in line or "" in line or "ð" in line:
        print(f"Line {i+1}: {repr(line)}")
