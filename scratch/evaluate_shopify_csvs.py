import csv
from collections import Counter

f1 = r'C:\Users\titan\Documents\Titan Diamond\invoices\Shopify Products - products_export_1 (3).csv'
f2 = r'C:\Users\titan\Documents\Titan Diamond\invoices\Shopify Products - products_export_1 (9) (1).csv'

def evaluate_csv(filepath, label):
    with open(filepath, 'r', encoding='utf-8-sig') as f:
        reader = list(csv.DictReader(f))
    
    print(f'=== {label} === ({len(reader)} rows)')
    
    types = Counter(r['Type'] for r in reader if r.get('Type'))
    categories = Counter(r['Product Category'] for r in reader if r.get('Product Category'))
    vendors = Counter(r['Vendor'] for r in reader if r.get('Vendor'))
    diameters = Counter(r.get('Blade Diameter (product.metafields.custom.blade_diameter)', '') for r in reader if r.get('Blade Diameter (product.metafields.custom.blade_diameter)'))
    equipments = Counter(r.get('Equipment (product.metafields.custom.equipment)', '') for r in reader if r.get('Equipment (product.metafields.custom.equipment)'))
    materials = Counter(r.get('Suitable for material type (product.metafields.shopify.suitable-for-material-type)', '') for r in reader if r.get('Suitable for material type (product.metafields.shopify.suitable-for-material-type)'))
    
    tag_counts = Counter()
    for r in reader:
        if r.get('Tags'):
            for t in r['Tags'].split(','):
                if t.strip():
                    tag_counts[t.strip()] += 1

    print('\n[Product Types]:')
    for k, v in types.most_common():
        print(f'  - {k}: {v}')
        
    print('\n[Product Categories]:')
    for k, v in categories.most_common():
        print(f'  - {k}: {v}')

    print('\n[Top 10 Blade Diameters]:')
    for k, v in diameters.most_common(10):
        print(f'  - {k}": {v}')

    print('\n[Top 5 Equipment Types]:')
    for k, v in equipments.most_common(5):
        eq_single = k.replace('\n', ' / ')
        print(f'  - {eq_single[:70]}: {v}')

    print('\n[Top 5 Suitable Material Types]:')
    for k, v in materials.most_common(5):
        print(f'  - {k[:70]}: {v}')

    print('\n[Top 15 Tags]:')
    for k, v in tag_counts.most_common(15):
        print(f'  - {k}: {v}')

if __name__ == '__main__':
    evaluate_csv(f1, 'Shopify Export 1 (3) - 1,485 rows')
    print('\n' + '='*60 + '\n')
    evaluate_csv(f2, 'Shopify Export 1 (9) (1) - 1,624 rows')
