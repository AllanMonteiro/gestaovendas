from uuid import uuid4
from decimal import Decimal
import os
from django.test import TestCase
from rest_framework.test import APIClient
from apps.accounts.models import User
from apps.audit.models import AuditLog
from apps.loyalty.models import Customer, LoyaltyAccount, LoyaltyMove
from apps.sales.models import Order, StoreConfig
from apps.sales import services


class OrderIdempotencyTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email='cash@test.com', password='test', name='Cash User')
        services.open_cash(user=self.user, initial_float=Decimal('100.00'))

    def test_create_order_idempotent(self):
        client_request_id = uuid4()
        order1 = services.create_order_idempotent(order_type='COUNTER', table_label=None, customer=None, client_request_id=client_request_id)
        order2 = services.create_order_idempotent(order_type='COUNTER', table_label=None, customer=None, client_request_id=client_request_id)
        self.assertEqual(order1.id, order2.id)


class OrderRequiresOpenCashTests(TestCase):
    def test_create_order_requires_open_cash(self):
        with self.assertRaisesMessage(ValueError, 'Caixa fechado'):
            services.create_order_idempotent(order_type='COUNTER', table_label=None, customer=None, client_request_id=uuid4())

    def test_cancel_order_requires_open_cash(self):
        order = Order.objects.create()
        with self.assertRaisesMessage(ValueError, 'Caixa fechado'):
            services.cancel_order(order=order, reason='teste')


class OrderApiValidationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(email='cash3@test.com', password='test', name='Cash User 3')
        services.open_cash(user=self.user, initial_float=Decimal('50.00'))

    def test_create_counter_order_requires_customer_phone(self):
        response = self.client.post('/api/orders', {'type': 'COUNTER'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data.get('detail'), 'customer_phone required')


class LoyaltyEarnOnCloseOrderTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email='cash2@test.com', password='test', name='Cash User 2')
        services.open_cash(user=self.user, initial_float=Decimal('100.00'))
        self.customer = Customer.objects.create(name='Cliente Teste', phone='559999000000')

    def test_close_order_earns_loyalty_points_once(self):
        order = services.create_order_idempotent(
            order_type='COUNTER',
            table_label=None,
            customer=self.customer,
            client_request_id=uuid4(),
        )
        order.subtotal = Decimal('12.50')
        order.total = Decimal('12.50')
        order.save(update_fields=['subtotal', 'total'])

        closed = services.close_order(
            order=order,
            discount=Decimal('0'),
            payments=[{'method': 'CASH', 'amount': '12.50'}],
            use_loyalty_points=False,
            client_request_id=uuid4(),
            user=self.user,
        )
        self.assertEqual(closed.status, Order.STATUS_PAID)

        account = LoyaltyAccount.objects.get(customer=self.customer)
        self.assertEqual(account.points_balance, 13)
        self.assertEqual(LoyaltyMove.objects.filter(order=order, type=LoyaltyMove.TYPE_EARN).count(), 1)

        closed_again = services.close_order(
            order=order,
            discount=Decimal('0'),
            payments=[{'method': 'CASH', 'amount': '12.50'}],
            use_loyalty_points=False,
            client_request_id=uuid4(),
            user=self.user,
        )
        self.assertEqual(closed_again.status, Order.STATUS_PAID)
        account.refresh_from_db()
        self.assertEqual(account.points_balance, 13)
        self.assertEqual(LoyaltyMove.objects.filter(order=order, type=LoyaltyMove.TYPE_EARN).count(), 1)


class LoyaltyRedeemOnCloseOrderTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email='cash4@test.com', password='test', name='Cash User 4')
        services.open_cash(user=self.user, initial_float=Decimal('100.00'))
        self.customer = Customer.objects.create(name='Cliente Pontos', phone='559999111111')
        LoyaltyAccount.objects.create(customer=self.customer, points_balance=120)
        StoreConfig.objects.update_or_create(
            id=1,
            defaults={
                'point_value_real': Decimal('0.10'),
                'min_redeem_points': 10,
                'points_per_real': 1,
            },
        )

    def test_close_order_with_points_discount(self):
        order = services.create_order_idempotent(
            order_type='COUNTER',
            table_label=None,
            customer=self.customer,
            client_request_id=uuid4(),
        )
        order.subtotal = Decimal('10.00')
        order.total = Decimal('10.00')
        order.save(update_fields=['subtotal', 'total'])

        closed = services.close_order(
            order=order,
            discount=Decimal('0'),
            payments=[{'method': 'CASH', 'amount': '5.00'}],
            use_loyalty_points=True,
            points_to_redeem=50,
            client_request_id=uuid4(),
            user=self.user,
        )
        self.assertEqual(closed.status, Order.STATUS_PAID)
        self.assertEqual(closed.discount, Decimal('5.00'))
        self.assertEqual(closed.total, Decimal('5.00'))

        account = LoyaltyAccount.objects.get(customer=self.customer)
        self.assertEqual(account.points_balance, 70)
        self.assertEqual(LoyaltyMove.objects.filter(order=order, type=LoyaltyMove.TYPE_REDEEM).count(), 1)
        self.assertEqual(LoyaltyMove.objects.filter(order=order, type=LoyaltyMove.TYPE_EARN).count(), 0)

    def test_close_order_fully_paid_with_points_no_cash_payment(self):
        order = services.create_order_idempotent(
            order_type='COUNTER',
            table_label=None,
            customer=self.customer,
            client_request_id=uuid4(),
        )
        order.subtotal = Decimal('8.00')
        order.total = Decimal('8.00')
        order.save(update_fields=['subtotal', 'total'])

        closed = services.close_order(
            order=order,
            discount=Decimal('0'),
            payments=[],
            use_loyalty_points=True,
            points_to_redeem=80,
            client_request_id=uuid4(),
            user=self.user,
        )
        self.assertEqual(closed.status, Order.STATUS_PAID)
        self.assertEqual(closed.total, Decimal('0.00'))

    def test_close_order_with_points_without_explicit_amount_uses_open_order_max(self):
        order = services.create_order_idempotent(
            order_type='COUNTER',
            table_label=None,
            customer=self.customer,
            client_request_id=uuid4(),
        )
        order.subtotal = Decimal('6.00')
        order.total = Decimal('6.00')
        order.save(update_fields=['subtotal', 'total'])

        closed = services.close_order(
            order=order,
            discount=Decimal('0'),
            payments=[],
            use_loyalty_points=True,
            points_to_redeem=None,
            client_request_id=uuid4(),
            user=self.user,
        )
        self.assertEqual(closed.status, Order.STATUS_PAID)
        self.assertEqual(closed.discount, Decimal('6.00'))
        self.assertEqual(closed.total, Decimal('0.00'))


class CancelPermissionTests(TestCase):
    def setUp(self):
        self._prev_require_auth = os.environ.get('DJANGO_REQUIRE_AUTH')
        os.environ['DJANGO_REQUIRE_AUTH'] = '1'
        self.client = APIClient()
        self.user = User.objects.create_user(email='user@test.com', password='test', name='User')
        self.client.force_authenticate(user=self.user)
        self.order = Order.objects.create()

    def tearDown(self):
        if self._prev_require_auth is None:
            os.environ.pop('DJANGO_REQUIRE_AUTH', None)
        else:
            os.environ['DJANGO_REQUIRE_AUTH'] = self._prev_require_auth

    def test_cancel_requires_permission(self):
        resp = self.client.post(f'/api/orders/{self.order.id}/cancel', {'reason': 'test'}, format='json')
        self.assertEqual(resp.status_code, 403)


class CancelOrderAuditTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email='cash5@test.com', password='test', name='Cash User 5')
        services.open_cash(user=self.user, initial_float=Decimal('100.00'))

    def test_cancel_order_requires_reason(self):
        order = services.create_order_idempotent(order_type='COUNTER', table_label=None, customer=None, client_request_id=uuid4())

        with self.assertRaisesMessage(ValueError, 'Cancellation reason is required'):
            services.cancel_order(order=order, reason='   ', user=self.user)

    def test_cancel_order_logs_reason_in_audit(self):
        order = services.create_order_idempotent(order_type='COUNTER', table_label=None, customer=None, client_request_id=uuid4())

        canceled = services.cancel_order(order=order, reason='Cliente desistiu da compra', user=self.user)

        self.assertEqual(canceled.status, Order.STATUS_CANCELED)
        self.assertEqual(canceled.canceled_reason, 'Cliente desistiu da compra')
        audit = AuditLog.objects.get(action='order.cancel', entity='order', entity_id=str(order.id))
        self.assertEqual(audit.before['status'], Order.STATUS_OPEN)
        self.assertEqual(audit.after['status'], Order.STATUS_CANCELED)
        self.assertEqual(audit.after['canceled_reason'], 'Cliente desistiu da compra')
