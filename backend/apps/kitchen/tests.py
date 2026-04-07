from decimal import Decimal
from uuid import uuid4

from django.db import connection
from django.test import TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.catalog.models import Category, Product, ProductPrice
from apps.kitchen.models import KitchenTicket
from apps.sales import services
from apps.sales.models import Payment


@override_settings(REQUIRE_AUTH=False)
class KitchenQueueQueryEfficiencyTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_superuser(email='kitchen@test.com', password='test', name='Kitchen Admin')
        services.open_cash(user=self.user, initial_float=Decimal('100.00'))
        self.category = Category.objects.create(name='Sorvetes', price=Decimal('7.50'))
        self.product = Product.objects.create(category=self.category, name='Casquinha')
        ProductPrice.objects.create(
            product=self.product,
            store_id=1,
            price=Decimal('7.50'),
            cost=Decimal('0'),
            freight=Decimal('0'),
            other=Decimal('0'),
            tax_pct=Decimal('0'),
            overhead_pct=Decimal('0'),
            margin_pct=Decimal('0'),
        )

        for index in range(3):
            order = services.create_order_idempotent(
                order_type='COUNTER',
                table_label=None,
                customer=None,
                client_request_id=uuid4(),
            )
            services.add_item(order=order, product_id=self.product.id, qty=Decimal('1'), weight_grams=None, notes=f'item {index}')
            Payment.objects.create(order=order, method=Payment.METHOD_PIX, amount=Decimal('7.50'))
            KitchenTicket.objects.create(order=order)

    def test_kitchen_queue_reads_items_and_payments_without_n_plus_one(self):
        with CaptureQueriesContext(connection) as queries:
            response = self.client.get('/api/kitchen/queue')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 3)
        self.assertTrue(all(order['items'] for order in response.data))
        self.assertTrue(all(order['payments'] for order in response.data))
        self.assertLessEqual(len(queries), 4)
