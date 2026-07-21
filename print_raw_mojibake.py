import os
import re

directories = [
    r"C:\Users\titan\Documents\Titan Diamond\Overdue Inv\SalesPortal\src"
]

pattern = re.compile(r"([ðâÃ][\x80-\xffÂ-ÿâ€-™œ\w]+)")

with open("mojibake_locations.txt", "w", encoding="utf-8") as out:
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
                            out.write(f"File {file} has {set(matches)}\n")
                    except Exception as e:
                        pass
