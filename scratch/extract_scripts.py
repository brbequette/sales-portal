import zipfile
import xml.etree.ElementTree as ET
import os
import glob

def get_docx_text(path):
    try:
        with zipfile.ZipFile(path) as z:
            xml_content = z.read('word/document.xml')
            root = ET.fromstring(xml_content)
            # Namespace map
            ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
            texts = []
            for elem in root.iter():
                # w:t tag contains text
                if elem.tag.endswith('t'):
                    if elem.text:
                        texts.append(elem.text)
                # w:br or w:p can be paragraph boundaries, but let's just join text for now,
                # or add space/newline.
                elif elem.tag.endswith('p'):
                    texts.append('\n')
            return "".join(texts)
    except Exception as e:
        return f"Error reading {path}: {e}"

scripts_dir = r"C:\Users\titan\Documents\Titan Diamond\scripts"
for docx_path in glob.glob(os.path.join(scripts_dir, "*.docx")):
    print("="*40)
    print(os.path.basename(docx_path))
    print("="*40)
    text = get_docx_text(docx_path)
    # Print with utf-8 encoding or safe replacement
    safe_text = text[:800].encode('ascii', errors='replace').decode('ascii')
    print(safe_text)
    print("\n\n")
