from django.core.management.base import BaseCommand
from apps.catalog.models import Category, Product, ProductPrice


class Command(BaseCommand):
    help = 'Seed demo data for catalog'

    def handle(self, *args, **options):
        categories = [
            'Cerveja',
            'Hamburguer',
            'Milkshake',
            'Picole Gourmet',
            'Acai',
            'Sorvetes',
        ]
        cat_objs = []
        for i, name in enumerate(categories):
            cat, _ = Category.objects.get_or_create(name=name, defaults={'sort_order': i})
            cat_objs.append(cat)

        sample_products = [
            ('Cerveja Pilsen', 12.00),
            ('Hamburguer Classico', 28.00),
            ('Milkshake Chocolate', 18.00),
            ('Picole Gourmet Morango', 10.00),
            ('Acai 500ml', 22.00),
            ('Sorvete 2 bolas', 15.00),
        ]

        for idx, (name, price) in enumerate(sample_products):
            category = cat_objs[idx % len(cat_objs)]
            prod, _ = Product.objects.get_or_create(name=name, category=category)
            ProductPrice.objects.get_or_create(
                product=prod,
                store_id=1,
                defaults={
                    'price': price,
                    'cost': price * 0.5,
                    'freight': 0,
                    'other': 0,
                    'tax_pct': 0,
                    'overhead_pct': 0,
                    'margin_pct': 30,
                },
            )

        self.stdout.write(self.style.SUCCESS('Seeded demo data'))
