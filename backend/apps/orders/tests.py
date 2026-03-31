from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from apps.catalog.models import Category, Product, ProductPrice
from apps.sales.models import DeliveryOrderMeta, Order


class PublicDeliveryOrderCreateTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.category = Category.objects.create(name='Sorvetes', price=Decimal('8.00'))
        self.product = Product.objects.create(category=self.category, name='Cascao')
        ProductPrice.objects.create(
            product=self.product,
            store_id=1,
            price=Decimal('8.00'),
            cost=Decimal('0'),
            freight=Decimal('0'),
            other=Decimal('0'),
            tax_pct=Decimal('0'),
            overhead_pct=Decimal('0'),
            margin_pct=Decimal('0'),
        )

    def test_public_menu_creates_delivery_order(self):
        response = self.client.post(
            '/api/orders/public/',
            {
                'customer_name': 'Cliente Web',
                'customer_phone': '91999990000',
                'address': 'Rua das Flores, 10',
                'neighborhood': 'Centro',
                'payment_method': 'PIX',
                'items': [
                    {
                        'product_id': self.product.id,
                        'product_name': 'Cascao',
                        'quantity': 2,
                    }
                ],
            },
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        order = Order.objects.get(id=response.data['id'])
        self.assertEqual(order.type, Order.TYPE_DELIVERY)
        self.assertEqual(order.total, Decimal('16.00'))
        self.assertEqual(order.items.count(), 1)
        self.assertEqual(order.delivery_meta.source, DeliveryOrderMeta.SOURCE_WEB)
        self.assertEqual(order.delivery_meta.customer_name, 'Cliente Web')
