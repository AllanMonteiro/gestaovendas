from uuid import uuid4
from decimal import Decimal
import os
from django.db import connection
from django.test import TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient
from apps.accounts.models import User
from apps.audit.models import AuditLog
from apps.catalog.models import Category, Product, ProductPrice
from apps.loyalty.models import Customer, LoyaltyAccount, LoyaltyMove
from apps.sales.models import CashMove, Order, Payment, StoreConfig
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
        self.client.force_authenticate(user=self.user)
        services.open_cash(user=self.user, initial_float=Decimal('50.00'))

    def test_create_counter_order_requires_customer_phone(self):
        response = self.client.post('/api/orders', {'type': 'COUNTER'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data.get('detail'), 'customer_phone required')

    def test_close_order_with_loyalty_points_requires_bound_customer(self):
        order = services.create_order_idempotent(
            order_type='COUNTER',
            table_label=None,
            customer=None,
            client_request_id=uuid4(),
        )
        order.subtotal = Decimal('10.00')
        order.total = Decimal('10.00')
        order.save(update_fields=['subtotal', 'total'])

        response = self.client.post(
            f'/api/orders/{order.id}/close',
            {
                'discount': '0',
                'payments': [{'method': 'CASH', 'amount': '5.00'}],
                'use_loyalty_points': True,
                'points_to_redeem': 50,
                'client_request_id': str(uuid4()),
            },
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data.get('detail'), 'Order customer required for loyalty redemption')


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


class CashPaymentMetaTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email='cash-meta@test.com', password='test', name='Cash Meta User')
        services.open_cash(user=self.user, initial_float=Decimal('100.00'))

    def test_close_order_persists_cash_change_meta(self):
        order = services.create_order_idempotent(
            order_type='COUNTER',
            table_label=None,
            customer=None,
            client_request_id=uuid4(),
        )
        order.subtotal = Decimal('12.50')
        order.total = Decimal('12.50')
        order.save(update_fields=['subtotal', 'total'])

        services.close_order(
            order=order,
            discount=Decimal('0'),
            payments=[{
                'method': 'CASH',
                'amount': '12.50',
                'meta': {'cash_received': '20.00', 'change_amount': '7.50'},
            }],
            use_loyalty_points=False,
            client_request_id=uuid4(),
            user=self.user,
        )

        payment = Payment.objects.get(order=order)
        self.assertEqual(payment.meta, {'cash_received': '20.00', 'change_amount': '7.50'})


class CashMoveDeleteApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_superuser(email='cash-delete@test.com', password='test123', name='Cash Delete Admin')
        self.client.force_authenticate(user=self.user)
        services.open_cash(user=self.user, initial_float=Decimal('100.00'))

    def test_delete_cash_move_removes_open_session_move(self):
        move = services.cash_move(
            user=self.user,
            move_type=CashMove.TYPE_SANGRIA,
            amount=Decimal('12.50'),
            reason='Digitado errado',
        )

        response = self.client.delete(f'/api/cash/move/{move.id}')

        self.assertEqual(response.status_code, 200)
        self.assertFalse(CashMove.objects.filter(id=move.id).exists())
        audit = AuditLog.objects.get(action='cash.move.delete', entity='cash_session')
        self.assertEqual(audit.before['move_id'], move.id)
        self.assertEqual(audit.before['type'], CashMove.TYPE_SANGRIA)

    def test_delete_cash_move_rejects_closed_session_move(self):
        move = services.cash_move(
            user=self.user,
            move_type=CashMove.TYPE_REFORCO,
            amount=Decimal('10.00'),
            reason='Aporte',
        )
        services.close_cash(
            user=self.user,
            counted_cash=Decimal('110.00'),
            counted_pix=Decimal('0.00'),
            counted_card=Decimal('0.00'),
        )

        response = self.client.delete(f'/api/cash/move/{move.id}')

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data.get('detail'), 'Somente movimentacoes da sessao aberta podem ser excluidas.')


class CashCloseCardSplitTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_superuser(email='cash-close-split@test.com', password='test123', name='Cash Close Split')
        services.open_cash(user=self.user, initial_float=Decimal('50.00'))
        self.order = services.create_order_idempotent(
            order_type='COUNTER',
            table_label=None,
            customer=None,
            client_request_id=uuid4(),
        )
        self.order.subtotal = Decimal('30.00')
        self.order.total = Decimal('30.00')
        self.order.save(update_fields=['subtotal', 'total'])
        services.close_order(
            order=self.order,
            discount=Decimal('0'),
            payments=[
                {'method': 'CARD', 'amount': '18.00', 'meta': {'card_type': 'CREDIT'}},
                {'method': 'CARD', 'amount': '12.00', 'meta': {'card_type': 'DEBIT'}},
            ],
            use_loyalty_points=False,
            client_request_id=uuid4(),
            user=self.user,
        )

    def test_close_cash_preserves_credit_and_debit_breakdown(self):
        reconciliation = services.close_cash(
            user=self.user,
            counted_cash=Decimal('50.00'),
            counted_pix=Decimal('0.00'),
            counted_card_credit=Decimal('18.00'),
            counted_card_debit=Decimal('12.00'),
            counted_card=Decimal('30.00'),
        )

        self.assertEqual(reconciliation['expected']['card_credit'], 18.0)
        self.assertEqual(reconciliation['expected']['card_debit'], 12.0)
        self.assertEqual(reconciliation['expected']['card'], 30.0)
        self.assertEqual(reconciliation['counted']['card_credit'], 18.0)
        self.assertEqual(reconciliation['counted']['card_debit'], 12.0)
        self.assertEqual(reconciliation['counted']['card'], 30.0)
        self.assertEqual(reconciliation['divergence']['card_credit'], 0.0)
        self.assertEqual(reconciliation['divergence']['card_debit'], 0.0)
        self.assertEqual(reconciliation['divergence']['card'], 0.0)


class AddItemTotalsTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email='cash-item@test.com', password='test', name='Cash Item')
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

    def test_add_item_updates_order_totals_incrementally(self):
        order = services.create_order_idempotent(
            order_type='COUNTER',
            table_label=None,
            customer=None,
            client_request_id=uuid4(),
        )

        first_item = services.add_item(order=order, product_id=self.product.id, qty=Decimal('1'), weight_grams=None, notes=None)
        self.assertEqual(first_item.product.name, 'Casquinha')
        order.refresh_from_db()
        self.assertEqual(order.subtotal, Decimal('7.50'))
        self.assertEqual(order.total, Decimal('7.50'))

        services.add_item(order=order, product_id=self.product.id, qty=Decimal('2'), weight_grams=None, notes='duas bolas')
        order.refresh_from_db()
        self.assertEqual(order.subtotal, Decimal('22.50'))
        self.assertEqual(order.total, Decimal('22.50'))

    def test_add_item_is_idempotent_when_client_request_id_repeats(self):
        order = services.create_order_idempotent(
            order_type='COUNTER',
            table_label=None,
            customer=None,
            client_request_id=uuid4(),
        )
        client_request_id = uuid4()

        first_item = services.add_item(
            order=order,
            product_id=self.product.id,
            qty=Decimal('1'),
            weight_grams=None,
            notes='primeira tentativa',
            client_request_id=client_request_id,
        )
        second_item = services.add_item(
            order=order,
            product_id=self.product.id,
            qty=Decimal('1'),
            weight_grams=None,
            notes='retry da mesma requisicao',
            client_request_id=client_request_id,
        )

        self.assertEqual(first_item.id, second_item.id)
        self.assertEqual(Order.objects.get(id=order.id).items.count(), 1)
        order.refresh_from_db()
        self.assertEqual(order.subtotal, Decimal('7.50'))
        self.assertEqual(order.total, Decimal('7.50'))


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


class AdjustFinalizedSaleApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_superuser(email='admin@test.com', password='test123', name='Admin')
        self.client.force_authenticate(user=self.user)
        services.open_cash(user=self.user, initial_float=Decimal('100.00'))
        self.order = services.create_order_idempotent(order_type='COUNTER', table_label=None, customer=None, client_request_id=uuid4())
        self.order.subtotal = Decimal('20.00')
        self.order.total = Decimal('20.00')
        self.order.save(update_fields=['subtotal', 'total'])
        self.order = services.close_order(
            order=self.order,
            discount=Decimal('0'),
            payments=[{'method': 'CASH', 'amount': '20.00'}],
            use_loyalty_points=False,
            client_request_id=uuid4(),
            user=self.user,
        )

    def test_adjust_finalized_sale_updates_total_and_payment(self):

        response = self.client.post(
            f'/api/orders/{self.order.id}/adjust-finalized-sale',
            {'total': '15.50', 'payment_method': 'PIX', 'password': 'test123'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.order.refresh_from_db()
        payment = Payment.objects.get(order=self.order)
        self.assertEqual(self.order.total, Decimal('15.50'))
        self.assertEqual(self.order.discount, Decimal('4.50'))
        self.assertEqual(payment.method, Payment.METHOD_PIX)
        self.assertEqual(payment.amount, Decimal('15.50'))
        audit = AuditLog.objects.get(action='order.adjust_finalized_sale', entity='order', entity_id=str(self.order.id))
        self.assertEqual(audit.after['total'], '15.50')

    def test_adjust_finalized_sale_requires_correct_password(self):
        response = self.client.post(
            f'/api/orders/{self.order.id}/adjust-finalized-sale',
            {'total': '15.50', 'payment_method': 'PIX', 'password': 'senha-errada'},
            format='json',
        )

        self.assertEqual(response.status_code, 403)


class StoreConfigAssetUrlTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_superuser(email='config@test.com', password='test123', name='Config Admin')
        self.client.force_authenticate(user=self.user)

    def test_get_config_ui_rewrites_stale_absolute_media_logo_to_current_origin(self):
        StoreConfig.objects.update_or_create(
            id=1,
            defaults={'logo_url': 'http://127.0.0.1:8000/media/store-config/logo.png'},
        )

        response = self.client.get('/api/config/ui', HTTP_HOST='pdv.exemplo.com')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['logo_url'], 'http://pdv.exemplo.com/media/store-config/logo.png')


class PublicMenuConfigViewTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_public_menu_config_is_accessible_without_auth_and_omits_sensitive_fields(self):
        StoreConfig.objects.update_or_create(
            id=1,
            defaults={
                'store_name': 'Sorveteria Publica',
                'logo_url': '/media/store-config/logo-publico.png',
                'whatsapp_number': '5591999999999',
                'delivery_fee_default': Decimal('12.50'),
                'delivery_fee_rules': [{'label': 'CENTRO', 'fee': '6.00'}],
                'printer': {'agent_url': 'http://127.0.0.1:9876', 'printer_name': 'Termica'},
                'delivery_integration': {'integration_token': 'segredo', 'merchant_id': 'abc123'},
            },
        )

        response = self.client.get('/api/config/public-menu', HTTP_HOST='pdv.exemplo.com')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['store_name'], 'Sorveteria Publica')
        self.assertEqual(response.data['logo_url'], 'http://pdv.exemplo.com/media/store-config/logo-publico.png')
        self.assertEqual(response.data['whatsapp_number'], '5591999999999')
        self.assertEqual(response.data['delivery_fee_default'], '12.50')
        self.assertEqual(response.data['delivery_fee_rules'], [{'label': 'CENTRO', 'fee': '6.00'}])
        self.assertNotIn('printer', response.data)
        self.assertNotIn('delivery_integration', response.data)


@override_settings(REQUIRE_AUTH=False)
class OpenOrdersQueryEfficiencyTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_superuser(email='efficiency@test.com', password='test123', name='Efficiency Admin')
        services.open_cash(user=self.user, initial_float=Decimal('100.00'))
        category = Category.objects.create(name='Sorvetes', price=Decimal('7.50'))
        self.product = Product.objects.create(category=category, name='Casquinha')
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

    def test_open_orders_prefetch_items_and_payments(self):
        with CaptureQueriesContext(connection) as queries:
            response = self.client.get('/api/orders/open?include_items=1')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 3)
        self.assertTrue(all(order['items'] for order in response.data))
        self.assertTrue(all(order['payments'] for order in response.data))
        self.assertLessEqual(len(queries), 3)


@override_settings(REQUIRE_AUTH=False)
class OrdersHistoryLimitTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_superuser(email='history-limit@test.com', password='test123', name='History Limit Admin')
        services.open_cash(user=self.user, initial_float=Decimal('100.00'))
        category = Category.objects.create(name='Sorvetes', price=Decimal('7.50'))
        self.product = Product.objects.create(category=category, name='Casquinha')
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

    def _create_paid_order(self):
        order = services.create_order_idempotent(
            order_type='COUNTER',
            table_label=None,
            customer=None,
            client_request_id=uuid4(),
        )
        services.add_item(order=order, product_id=self.product.id, qty=Decimal('1'), weight_grams=None, notes=None)
        return services.close_order(
            order=order,
            discount=Decimal('0'),
            payments=[{'method': 'PIX', 'amount': '7.50'}],
            use_loyalty_points=False,
            client_request_id=uuid4(),
            user=self.user,
        )

    def _create_canceled_order(self):
        order = services.create_order_idempotent(
            order_type='COUNTER',
            table_label=None,
            customer=None,
            client_request_id=uuid4(),
        )
        services.add_item(order=order, product_id=self.product.id, qty=Decimal('1'), weight_grams=None, notes=None)
        return services.cancel_order(order=order, reason='Cliente desistiu', user=self.user)

    def test_closed_orders_support_limit(self):
        for _ in range(3):
            self._create_paid_order()

        response = self.client.get('/api/orders/closed?include_items=0&limit=2')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 2)

    def test_canceled_orders_support_limit(self):
        for _ in range(3):
            self._create_canceled_order()

        response = self.client.get('/api/orders/canceled?include_items=0&limit=2')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 2)

    def test_closed_orders_without_limit_do_not_error(self):
        self._create_paid_order()

        response = self.client.get('/api/orders/closed?include_items=0')

        self.assertEqual(response.status_code, 200)
        self.assertGreaterEqual(len(response.data), 1)

    def test_closed_orders_include_payment_label_in_summary(self):
        self._create_paid_order()

        response = self.client.get('/api/orders/closed?include_items=0&limit=1')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]['payment_label'], 'PIX')

    def test_canceled_orders_without_limit_do_not_error(self):
        self._create_canceled_order()

        response = self.client.get('/api/orders/canceled?include_items=0')

        self.assertEqual(response.status_code, 200)
        self.assertGreaterEqual(len(response.data), 1)

    def test_put_config_normalizes_media_logo_url_before_saving(self):
        response = self.client.put(
            '/api/config',
            {'logo_url': 'http://127.0.0.1:8000/media/store-config/logo.png'},
            format='json',
            HTTP_HOST='pdv.exemplo.com',
        )

        self.assertEqual(response.status_code, 200)
        config = StoreConfig.objects.get(id=1)
        self.assertEqual(config.logo_url, '/media/store-config/logo.png')
        self.assertEqual(response.data['logo_url'], 'http://pdv.exemplo.com/media/store-config/logo.png')

    def test_get_config_pdv_includes_logo_url_with_current_origin(self):
        StoreConfig.objects.update_or_create(
            id=1,
            defaults={'logo_url': '/media/store-config/logo.png'},
        )

        response = self.client.get('/api/config/pdv', HTTP_HOST='pdv.exemplo.com')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['logo_url'], 'http://pdv.exemplo.com/media/store-config/logo.png')
