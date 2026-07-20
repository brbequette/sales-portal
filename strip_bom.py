import os
import codecs

for root, dirs, files in os.walk('src'):
    for file in files:
        if file.endswith('.tsx'):
            path = os.path.join(root, file)
            with open(path, 'rb') as f:
                raw = f.read()
            if raw.startswith(codecs.BOM_UTF8):
                raw = raw[len(codecs.BOM_UTF8):]
                with open(path, 'wb') as f:
                    f.write(raw)
