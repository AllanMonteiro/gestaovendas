from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.catalog.models import Category, Product
from apps.reports import queries
from apps.sales.models import Order, OrderItem, Payment, StoreConfig


class CashSummaryFromHistoryTests(TestCase):
    def test_cash_summary_uses_provided_history(self):
        payload = queries.cash_summary_from_history([
            {
                'cash_breakdown': {
                    'initial_float': Decimal('100.00'),
                    'cash_sales': Decimal('25.00'),
                    'reforco': Decimal('10.00'),
                    'sangria': Decimal('5.00'),
                    'expected_cash': Decimal('130.00'),
                    'counted_cash': Decimal('128.00'),
                    'divergence_cash': Decimal('-2.00'),
                }
            }
        ])

        self.assertEqual(payload['sessions_count'], 1)
        self.assertEqual(payload['initial_float_total'], Decimal('100.00'))
        self.assertEqual(payload['cash_sales_total'], Decimal('25.00'))
        self.assertEqual(payload['reforco_total'], Decimal('10.00'))
        self.assertEqual(payload['sangria_total'], Decimal('5.00'))
        self.assertEqual(payload['expected_cash_total'], Decimal('130.00'))
        self.assertEqual(payload['counted_cash_total'], Decimal('128.00'))
        self.assertEqual(payload['divergence_cash_total'], Decimal('-2.00'))


class ReportsDashboardViewTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_superuser(email='reports@test.com', password='test123', name='Reports Admin')
        self.client.force_authenticate(user=self.user)

    def test_dashboard_returns_payload_without_server_error(self):
        response = self.client.get('/api/reports/dashboard')

        self.assertEqual(response.status_code, 200)
        self.assertIn('summary', response.data)
        self.assertIn('categories', response.data)
        self.assertIn('products', response.data)
        self.assertIn('daily_sales', response.data)
        self.assertIn('payments', response.data)
        self.assertIn('cash_summary', response.data)
        self.assertIn('cash_history', response.data)


class ProductStockReportTests(TestCase):
    def test_by_product_includes_initial_and_current_stock(self):
        category = Category.objects.create(name='Sorvetes')
        product = Product.objects.create(
            category=category,
            name='Acai 500ml',
            stock=Decimal('7.000'),
        )
        order = Order.objects.create(
            status=Order.STATUS_PAID,
            type=Order.TYPE_COUNTER,
            subtotal=Decimal('15.00'),
            total=Decimal('15.00'),
            closed_at=timezone.now(),
        )
        OrderItem.objects.create(
            order=order,
            product=product,
            qty=Decimal('3.000'),
            unit_price=Decimal('5.00'),
            total=Decimal('15.00'),
        )

        rows = queries.by_product()

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['product__name'], 'Acai 500ml')
        self.assertEqual(rows[0]['qty'], Decimal('3'))
        self.assertEqual(rows[0]['current_stock'], Decimal('7'))
        self.assertEqual(rows[0]['initial_stock'], Decimal('10'))


class PaymentFeesReportTests(TestCase):
    def test_by_payment_includes_card_fee_discount_and_net_total(self):
        StoreConfig.objects.create(
            id=1,
            pix_fee_pct=Decimal('0.99'),
            card_fee_credit_pct=Decimal('3.50'),
            card_fee_debit_pct=Decimal('1.99'),
        )
        paid_order = Order.objects.create(
            status=Order.STATUS_PAID,
            type=Order.TYPE_COUNTER,
            subtotal=Decimal('150.00'),
            total=Decimal('150.00'),
            closed_at=timezone.now(),
        )
        Payment.objects.create(
            order=paid_order,
            method=Payment.METHOD_PIX,
            amount=Decimal('20.00'),
        )
        Payment.objects.create(
            order=paid_order,
            method=Payment.METHOD_CARD,
            amount=Decimal('100.00'),
            meta={'card_type': 'CREDIT'},
        )
        Payment.objects.create(
            order=paid_order,
            method=Payment.METHOD_CARD,
            amount=Decimal('50.00'),
            meta={'card_type': 'DEBIT'},
        )

        rows = {row['payment_method']: row for row in queries.by_payment()}

        self.assertEqual(rows['PIX']['total'], Decimal('20'))
        self.assertEqual(rows['PIX']['fee_pct'], Decimal('0.99'))
        self.assertEqual(rows['PIX']['fee_amount'], Decimal('0.20'))
        self.assertEqual(rows['PIX']['net_total'], Decimal('19.80'))

        self.assertEqual(rows['CARD_CREDIT']['total'], Decimal('100'))
        self.assertEqual(rows['CARD_CREDIT']['fee_pct'], Decimal('3.50'))
        self.assertEqual(rows['CARD_CREDIT']['fee_amount'], Decimal('3.50'))
        self.assertEqual(rows['CARD_CREDIT']['net_total'], Decimal('96.50'))

        self.assertEqual(rows['CARD_DEBIT']['total'], Decimal('50'))
        self.assertEqual(rows['CARD_DEBIT']['fee_pct'], Decimal('1.99'))
        self.assertEqual(rows['CARD_DEBIT']['fee_amount'], Decimal('1.00'))
        self.assertEqual(rows['CARD_DEBIT']['net_total'], Decimal('49.00'))
