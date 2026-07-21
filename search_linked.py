import os

directory = r"C:\Users\titan\Documents\Titan Diamond\Overdue Inv\SalesPortal\src"
target = "Linked Document"
target2 = "Linked"

for root, _, files in os.walk(directory):
    for file in files:
        if file.endswith(".tsx") or file.endswith(".ts"):
            filepath = os.path.join(root, file)
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    content = f.read()
                    if target.lower() in content.lower() or target2.lower() in content.lower():
                        print(f"Found in {file}")
            except Exception:
                pass
