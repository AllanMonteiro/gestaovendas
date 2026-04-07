from decimal import Decimal

from django.db import connection
from django.test import TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from apps.accounts.models import Permission, Role, RolePermission, User, UserRole
from apps.catalog.models import Category, Product, ProductPrice
from apps.reports import queries as report_queries
from apps.sales import services
from apps.sales.models import DeliveryOrderMeta, Order, Payment, StoreConfig


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
        StoreConfig.objects.update_or_create(
            id=1,
            defaults={
                'delivery_fee_default': Decimal('10.00'),
                'delivery_fee_rules': [
                    {'label': 'CENTRO', 'fee': '5.00'},
                    {'label': 'BATISTA CAMPOS', 'fee': '6.00'},
                ],
            },
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
        self.assertEqual(response.data['subtotal'], '16.00')
        self.assertEqual(response.data['delivery_fee'], '5.00')
        self.assertEqual(response.data['items'][0]['unit_price'], '8.00')
        self.assertEqual(response.data['items'][0]['total'], '16.00')
        order = Order.objects.get(id=response.data['id'])
        self.assertEqual(order.type, Order.TYPE_DELIVERY)
        self.assertEqual(order.total, Decimal('21.00'))
        self.assertEqual(order.items.count(), 1)
        self.assertEqual(order.delivery_meta.source, DeliveryOrderMeta.SOURCE_WEB)
        self.assertEqual(order.delivery_meta.customer_name, 'Cliente Web')

    def test_delivery_list_returns_breakdown_for_operator_conference(self):
        create_response = self.client.post(
            '/api/orders/public/',
            {
                'customer_name': 'Cliente Conferencia',
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

        response = self.staff_client.get('/api/orders/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['subtotal'], '16.00')
        self.assertEqual(response.data[0]['delivery_fee'], '5.00')
        self.assertEqual(response.data[0]['total'], '21.00')
        self.assertEqual(response.data[0]['items'][0]['unit_price'], '8.00')
        self.assertEqual(response.data[0]['items'][0]['total'], '16.00')

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

    def test_staff_can_delete_delivery_order_with_closed_cash(self):
        services.close_cash(
            user=self.user,
            counted_cash=Decimal('100.00'),
            counted_pix=Decimal('0.00'),
            counted_card=Decimal('0.00'),
        )

        create_response = self.client.post(
            '/api/orders/public/',
            {
                'customer_name': 'Cliente Excluir Caixa Fechado',
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

    def test_operator_with_pdv_permission_can_delete_delivery_order(self):
        operator = User.objects.create_user(email='operador@test.com', password='test', name='Operador Delivery')
        role = Role.objects.create(name='Operador Delivery Teste')
        permission = Permission.objects.create(code='pdv.operate', description='Operar pedidos e vendas no PDV')
        RolePermission.objects.create(role=role, permission=permission)
        UserRole.objects.create(user=operator, role=role)

        operator_client = APIClient()
        operator_client.force_authenticate(user=operator)

        create_response = self.client.post(
            '/api/orders/public/',
            {
                'customer_name': 'Cliente Excluir Operador',
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

        response = operator_client.delete(f"/api/orders/{create_response.data['id']}/")

        self.assertEqual(response.status_code, 200)
        self.assertFalse(Order.objects.filter(id=create_response.data['id']).exists())

    def test_delivery_fee_uses_store_config_rules(self):
        StoreConfig.objects.update_or_create(
            id=1,
            defaults={
                'delivery_fee_default': Decimal('13.00'),
                'delivery_fee_rules': [
                    {'label': 'CENTRO', 'fee': '7.50'},
                ],
            },
        )

        response = self.client.post(
            '/api/orders/public/',
            {
                'customer_name': 'Cliente Taxa',
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

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['subtotal'], '8.00')
        self.assertEqual(response.data['delivery_fee'], '7.50')
        self.assertEqual(response.data['total'], '15.50')


@override_settings(REQUIRE_AUTH=False)
class DeliveryOrdersQueryEfficiencyTests(TestCase):
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
        StoreConfig.objects.update_or_create(
            id=1,
            defaults={'delivery_fee_default': Decimal('5.00')},
        )
        cashier = User.objects.create_superuser(email='cash-delivery@test.com', password='test', name='Cash Delivery')
        services.open_cash(user=cashier, initial_float=Decimal('100.00'))
        for index in range(3):
            response = self.client.post(
                '/api/orders/public/',
                {
                    'customer_name': f'Cliente {index}',
                    'customer_phone': f'9199999000{index}',
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
            self.assertEqual(response.status_code, 201)

    def test_delivery_list_prefetches_items_in_constant_queries(self):
        with CaptureQueriesContext(connection) as queries:
            response = self.client.get('/api/orders/?include_items=1&limit=20')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 3)
        self.assertTrue(all(order['items'] for order in response.data))
        self.assertLessEqual(len(queries), 3)
