from decimal import Decimal

from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.catalog.models import Category, Product, ProductPrice
from apps.reports import queries as report_queries
from apps.sales import services
from apps.sales.models import DeliveryOrderMeta, Order, Payment


class PublicDeliveryOrderCreateTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_superuser(email='delivery@test.com', password='test', name='Delivery User')
        self.staff_client = APIClient()
        self.staff_client.force_authenticate(user=self.user)
        services.open_cash(user=self.user, initial_float=Decimal('100.00'))
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
        self.assertEqual(order.total, Decimal('21.00'))
        self.assertEqual(order.items.count(), 1)
        self.assertEqual(order.delivery_meta.source, DeliveryOrderMeta.SOURCE_WEB)
        self.assertEqual(order.delivery_meta.customer_name, 'Cliente Web')

    def test_delivered_delivery_generates_payment_and_enters_reports(self):
        create_response = self.client.post(
            '/api/orders/public/',
            {
                'customer_name': 'Cliente Delivery',
                'customer_phone': '91999990000',
                'address': 'Rua das Flores, 10',
                'neighborhood': 'Centro',
                'payment_method': 'Dinheiro',
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

        self.assertEqual(create_response.status_code, 201)

        patch_response = self.staff_client.patch(
            f"/api/orders/{create_response.data['id']}/",
            {'status': DeliveryOrderMeta.STATUS_DELIVERED},
            format='json',
        )

        self.assertEqual(patch_response.status_code, 200)

        order = Order.objects.get(id=create_response.data['id'])
        payment = Payment.objects.get(order=order)

        self.assertEqual(order.status, Order.STATUS_PAID)
        self.assertEqual(order.delivery_meta.status, DeliveryOrderMeta.STATUS_DELIVERED)
        self.assertEqual(payment.method, Payment.METHOD_CASH)
        self.assertEqual(payment.amount, order.total)

        summary = report_queries.summary()
        by_payment = report_queries.by_payment()

        self.assertEqual(summary['total_sales'], order.total)
        self.assertTrue(any(row['payment_method'] == Payment.METHOD_CASH and row['total'] == order.total for row in by_payment))

    def test_delivered_delivery_with_accented_card_payment_maps_correctly(self):
        create_response = self.client.post(
            '/api/orders/public/',
            {
                'customer_name': 'Cliente Cartao',
                'customer_phone': '91999990000',
                'address': 'Rua das Flores, 10',
                'neighborhood': 'Centro',
                'payment_method': 'Crédito',
                'items': [
                    {
                        'product_id': self.product.id,
                        'product_name': 'Cascao',
                        'quantity': 1,
                    }
                ],
            },
            format='json',
        )

        patch_response = self.staff_client.patch(
            f"/api/orders/{create_response.data['id']}/",
            {'status': DeliveryOrderMeta.STATUS_DELIVERED},
            format='json',
        )

        self.assertEqual(patch_response.status_code, 200)

        order = Order.objects.get(id=create_response.data['id'])
        payment = Payment.objects.get(order=order)
        by_payment = report_queries.by_payment()

        self.assertEqual(payment.method, Payment.METHOD_CARD)
        self.assertEqual(payment.meta, {'card_type': 'CREDIT'})
        self.assertTrue(any(row['payment_method'] == 'CARD_CREDIT' and row['total'] == order.total for row in by_payment))

    def test_delivered_delivery_requires_open_cash_session(self):
        services.close_cash(
            user=self.user,
            counted_cash=Decimal('100.00'),
            counted_pix=Decimal('0.00'),
            counted_card=Decimal('0.00'),
        )

        create_response = self.client.post(
            '/api/orders/public/',
            {
                'customer_name': 'Cliente Sem Caixa',
                'customer_phone': '91999990000',
                'address': 'Rua das Flores, 10',
                'neighborhood': 'Centro',
                'payment_method': 'Dinheiro',
                'items': [
                    {
                        'product_id': self.product.id,
                        'product_name': 'Cascao',
                        'quantity': 1,
                    }
                ],
            },
            format='json',
        )

        patch_response = self.staff_client.patch(
            f"/api/orders/{create_response.data['id']}/",
            {'status': DeliveryOrderMeta.STATUS_DELIVERED},
            format='json',
        )

        self.assertEqual(patch_response.status_code, 400)
        self.assertIn('Caixa fechado', patch_response.data['detail'])

    def test_staff_can_delete_delivery_order(self):
        create_response = self.client.post(
            '/api/orders/public/',
            {
                'customer_name': 'Cliente Excluir',
                'customer_phone': '91999990000',
                'address': 'Rua das Flores, 10',
                'neighborhood': 'Centro',
                'payment_method': 'PIX',
                'items': [
                    {
                        'product_id': self.product.id,
                        'product_name': 'Cascao',
                        'quantity': 1,
                    }
                ],
            },
            format='json',
        )

        response = self.staff_client.delete(f"/api/orders/{create_response.data['id']}/")

        self.assertEqual(response.status_code, 200)
        self.assertFalse(Order.objects.filter(id=create_response.data['id']).exists())
