import os
import codecs

for root, dirs, files in os.walk('src'):
    for file in files:
        if file.endswith('.tsx'):
            path = os.path.join(root, file)
            with open(path, 'rb') as f:
                raw = f.read()
            
            raw = raw.replace(codecs.BOM_UTF8, b'')
            
            with open(path, 'wb') as f:
                f.write(raw)
