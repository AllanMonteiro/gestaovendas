from decimal import Decimal

from django.db import connection
from django.test import TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.audit.models import AuditLog
from apps.catalog.models import Category, Product, ProductPrice, ProductStockEntry


@override_settings(REQUIRE_AUTH=False)
class CategoryApplyPriceTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email='admin-catalog@test.com',
            password='test123',
            name='Admin Catalogo',
            is_superuser=True,
            is_staff=True,
        )
        self.client.force_authenticate(user=self.user)
        self.category = Category.objects.create(name='Picole Premium', price=Decimal('10.00'))

    def test_apply_price_updates_existing_product_prices_for_all_store_ids(self):
        product = Product.objects.create(category=self.category, name='Morango', active=True)
        ProductPrice.objects.create(
            product=product,
            store_id=1,
            price=Decimal('8.00'),
            cost=Decimal('2.00'),
            freight=Decimal('0.50'),
            other=Decimal('0.25'),
            tax_pct=Decimal('5.00'),
            overhead_pct=Decimal('4.00'),
            margin_pct=Decimal('30.00'),
        )
        ProductPrice.objects.create(
            product=product,
            store_id=2,
            price=Decimal('9.50'),
            cost=Decimal('2.10'),
            freight=Decimal('0.40'),
            other=Decimal('0.10'),
            tax_pct=Decimal('6.00'),
            overhead_pct=Decimal('3.00'),
            margin_pct=Decimal('28.00'),
        )

        response = self.client.post(f'/api/categories/{self.category.id}/apply-price', {'price': '12.00'}, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['updated_products'], 1)
        self.category.refresh_from_db()
        self.assertEqual(self.category.price, Decimal('12.00'))
        self.assertEqual(
            list(ProductPrice.objects.filter(product=product).order_by('store_id').values_list('price', flat=True)),
            [Decimal('12.00'), Decimal('12.00')],
        )

    def test_apply_price_creates_default_price_when_product_has_no_price_row(self):
        product = Product.objects.create(category=self.category, name='Chocolate', active=True)

        response = self.client.post(f'/api/categories/{self.category.id}/apply-price', {'price': '13.50'}, format='json')

        self.assertEqual(response.status_code, 200)
        created_price = ProductPrice.objects.get(product=product, store_id=1)
        self.assertEqual(created_price.price, Decimal('13.50'))


@override_settings(REQUIRE_AUTH=False)
class ProductCompactListTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        category = Category.objects.create(name='Linha Fit', price=Decimal('12.00'))
        for index in range(5):
            Product.objects.create(
                category=category,
                name=f'Produto {index}',
                active=True,
                sold_by_weight=index % 2 == 0,
                stock=Decimal('10.000'),
                description='descricao grande que nao precisa ir no modo compacto',
                image_url='https://example.com/produto.png',
            )

    def test_compact_product_list_uses_small_payload_query(self):
        with CaptureQueriesContext(connection) as queries:
            response = self.client.get('/api/products?compact=1')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 5)
        self.assertLessEqual(len(queries), 1)
        self.assertEqual(
            sorted(response.data[0].keys()),
            ['active', 'category', 'id', 'name', 'sold_by_weight', 'stock'],
        )


@override_settings(REQUIRE_AUTH=True)
class ProductPricePublicAccessTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        category = Category.objects.create(name='Linha Publica', price=Decimal('12.00'))
        self.product = Product.objects.create(category=category, name='Produto Publico', active=True)
        ProductPrice.objects.create(
            product=self.product,
            store_id=1,
            price=Decimal('12.50'),
            cost=Decimal('0'),
            freight=Decimal('0'),
            other=Decimal('0'),
            tax_pct=Decimal('0'),
            overhead_pct=Decimal('0'),
            margin_pct=Decimal('0'),
        )

    def test_price_list_is_accessible_without_auth(self):
        response = self.client.get(f'/api/products/prices?product_ids={self.product.id}')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['product'], self.product.id)
        self.assertEqual(response.data[0]['price'], '12.50')


@override_settings(REQUIRE_AUTH=False)
class ProductStockEntryTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        category = Category.objects.create(name='Estoque', price=Decimal('10.00'))
        self.product = Product.objects.create(
            category=category,
            name='Pote 1L',
            active=True,
            stock=Decimal('4.000'),
        )

    def test_create_stock_entry_increases_product_stock(self):
        response = self.client.post(
            f'/api/products/{self.product.id}/stock-entries',
            {
                'arrival_date': '2026-04-19',
                'quantity': '6.500',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, Decimal('10.500'))
        self.assertEqual(ProductStockEntry.objects.count(), 1)
        self.assertEqual(response.data['current_stock'], '10.500')
        audit = AuditLog.objects.get(action='product_stock_entry.create', entity='product_stock_entry')
        self.assertEqual(audit.after['stock_after'], '10.500')

    def test_list_stock_entries_returns_latest_entries_first(self):
        ProductStockEntry.objects.create(product=self.product, arrival_date='2026-04-01', quantity=Decimal('2.000'))
        ProductStockEntry.objects.create(product=self.product, arrival_date='2026-04-10', quantity=Decimal('1.000'))

        response = self.client.get(f'/api/products/{self.product.id}/stock-entries')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 2)
        self.assertEqual(response.data[0]['arrival_date'], '2026-04-10')

    def test_update_stock_entry_reconciles_stock_and_logs_audit(self):
        entry = ProductStockEntry.objects.create(product=self.product, arrival_date='2026-04-01', quantity=Decimal('2.000'))
        self.product.stock = Decimal('6.000')
        self.product.save(update_fields=['stock'])

        response = self.client.put(
            f'/api/products/{self.product.id}/stock-entries/{entry.id}',
            {
                'arrival_date': '2026-04-20',
                'quantity': '3.500',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.product.refresh_from_db()
        entry.refresh_from_db()
        self.assertEqual(self.product.stock, Decimal('7.500'))
        self.assertEqual(entry.arrival_date.isoformat(), '2026-04-20')
        self.assertEqual(entry.quantity, Decimal('3.500'))
        audit = AuditLog.objects.get(action='product_stock_entry.update', entity='product_stock_entry', entity_id=str(entry.id))
        self.assertEqual(audit.before['quantity'], '2.000')
        self.assertEqual(audit.after['stock_after'], '7.500')

    def test_delete_stock_entry_reconciles_stock_and_logs_audit(self):
        entry = ProductStockEntry.objects.create(product=self.product, arrival_date='2026-04-01', quantity=Decimal('2.000'))
        self.product.stock = Decimal('6.000')
        self.product.save(update_fields=['stock'])

        response = self.client.delete(f'/api/products/{self.product.id}/stock-entries/{entry.id}')

        self.assertEqual(response.status_code, 200)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, Decimal('4.000'))
        self.assertFalse(ProductStockEntry.objects.filter(id=entry.id).exists())
        audit = AuditLog.objects.get(action='product_stock_entry.delete', entity='product_stock_entry', entity_id=str(entry.id))
        self.assertEqual(audit.before['quantity'], '2.000')
        self.assertEqual(audit.after['deleted'], True)
