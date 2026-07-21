import os

filepath = r"C:\Users\titan\Documents\Titan Diamond\Overdue Inv\SalesPortal\src\components\GlobalTopBar.tsx"
outpath = r"C:\Users\titan\Documents\Titan Diamond\Overdue Inv\SalesPortal\src\components\GlobalTopBar_fixed.tsx"

with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

try:
    # Attempt to reverse the double-encoding
    raw_bytes = content.encode('cp1252')
    fixed_content = raw_bytes.decode('utf-8')
    
    with open(outpath, "w", encoding="utf-8") as f:
        f.write(fixed_content)
    print("Success! Double-encoding reversed.")
except Exception as e:
    print(f"Error reversing: {e}")

# If error occurs, it means there are characters that don't map to cp1252.
# Some characters like 0x8D might have been mapped to something else, or kept as replacement chars.
