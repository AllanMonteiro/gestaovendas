from datetime import datetime, time, timedelta
from decimal import Decimal
from django.db.models import Sum, Count, Avg, Case, When, Value, CharField, F
from django.db.models.functions import ExtractHour, TruncDate
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from apps.sales.models import Order, Payment, OrderItem, CashSession


def _is_date_only(value: str) -> bool:
    return isinstance(value, str) and 'T' not in value and ' ' not in value and ':' not in value


def _apply_range_filter(qs, field_name, from_date=None, to_date=None):
    local_tz = timezone.get_current_timezone()
    if from_date:
        parsed_from_date = parse_date(from_date)
        parsed_from_datetime = parse_datetime(from_date)
        if parsed_from_date and _is_date_only(from_date):
            start_local = timezone.make_aware(datetime.combine(parsed_from_date, time.min), local_tz)
            qs = qs.filter(**{f'{field_name}__gte': start_local})
        else:
            if parsed_from_datetime and timezone.is_naive(parsed_from_datetime):
                parsed_from_datetime = timezone.make_aware(parsed_from_datetime, local_tz)
            if parsed_from_datetime:
                from_date = parsed_from_datetime
            qs = qs.filter(**{f'{field_name}__gte': from_date})
    if to_date:
        parsed_to_date = parse_date(to_date)
        parsed_to_datetime = parse_datetime(to_date)
        if parsed_to_date and _is_date_only(to_date):
            next_day_local = timezone.make_aware(datetime.combine(parsed_to_date + timedelta(days=1), time.min), local_tz)
            qs = qs.filter(**{f'{field_name}__lt': next_day_local})
        else:
            if parsed_to_datetime and timezone.is_naive(parsed_to_datetime):
                parsed_to_datetime = timezone.make_aware(parsed_to_datetime, local_tz)
            if parsed_to_datetime:
                to_date = parsed_to_datetime
            qs = qs.filter(**{f'{field_name}__lte': to_date})
    return qs


def summary(from_date=None, to_date=None):
    qs = Order.objects.filter(status=Order.STATUS_PAID, closed_at__isnull=False)
    qs = _apply_range_filter(qs, 'closed_at', from_date, to_date)
    agg = qs.aggregate(
        total_sales=Sum('total'),
        total_orders=Count('id'),
        avg_ticket=Avg('total'),
        total_discount=Sum('discount'),
    )
    canceled = Order.objects.filter(status=Order.STATUS_CANCELED)
    canceled = _apply_range_filter(canceled, 'created_at', from_date, to_date)
    canceled_agg = canceled.aggregate(canceled_count=Count('id'), canceled_total=Sum('total'))
    return {**agg, **canceled_agg}


def by_payment(from_date=None, to_date=None):
    qs = Payment.objects.select_related('order').filter(order__status=Order.STATUS_PAID)
    qs = _apply_range_filter(qs, 'created_at', from_date, to_date)
    qs = qs.annotate(
        payment_method=Case(
            When(method=Payment.METHOD_CARD, meta__card_type='CREDIT', then=Value('CARD_CREDIT')),
            When(method=Payment.METHOD_CARD, meta__card_type='DEBIT', then=Value('CARD_DEBIT')),
            default=F('method'),
            output_field=CharField(),
        )
    )
    return list(qs.values('payment_method').annotate(total=Sum('amount')))


def by_category(from_date=None, to_date=None):
    qs = OrderItem.objects.select_related('product__category', 'order').filter(
        order__status=Order.STATUS_PAID,
    )
    qs = _apply_range_filter(qs, 'order__closed_at', from_date, to_date)
    return list(
        qs.values('product__category__id', 'product__category__name')
        .annotate(total=Sum('total'))
        .order_by('-total', 'product__category__name')
    )


def by_product(from_date=None, to_date=None, limit=20):
    qs = OrderItem.objects.select_related('product', 'order').filter(
        order__status=Order.STATUS_PAID,
    )
    qs = _apply_range_filter(qs, 'order__closed_at', from_date, to_date)
    return list(qs.values('product__id', 'product__name').annotate(total=Sum('total'), qty=Sum('qty')).order_by('-total')[:limit])


def hourly_heatmap(from_date=None, to_date=None):
    qs = Order.objects.filter(status=Order.STATUS_PAID, closed_at__isnull=False)
    qs = _apply_range_filter(qs, 'closed_at', from_date, to_date)
    return list(qs.annotate(hour=ExtractHour('closed_at')).values('hour').annotate(total=Sum('total'), count=Count('id')).order_by('hour'))


def daily_sales(from_date=None, to_date=None):
    qs = Order.objects.filter(status=Order.STATUS_PAID, closed_at__isnull=False)
    qs = _apply_range_filter(qs, 'closed_at', from_date, to_date)
    return list(
        qs.annotate(day=TruncDate('closed_at'))
        .values('day')
        .annotate(total=Sum('total'), count=Count('id'))
        .order_by('day')
    )


def top_customers(from_date=None, to_date=None, limit=20):
    qs = Order.objects.filter(
        status=Order.STATUS_PAID,
        customer__isnull=False,
        closed_at__isnull=False,
    )
    qs = _apply_range_filter(qs, 'closed_at', from_date, to_date)
    return list(qs.values('customer__id', 'customer__phone').annotate(total=Sum('total'), orders=Count('id')).order_by('-total')[:limit])


def cash_reconciliation(session_id):
    return []


def cash_history(from_date=None, to_date=None):
    qs = CashSession.objects.filter(status=CashSession.STATUS_CLOSED).order_by('-closed_at')
    qs = _apply_range_filter(qs, 'closed_at', from_date, to_date)
    history = []
    for session in qs:
        reconciliation = session.reconciliation_data or {}
        breakdown = reconciliation.get('breakdown') or {}
        expected = reconciliation.get('expected') or {}
        counted = reconciliation.get('counted') or {}
        divergence = reconciliation.get('divergence') or {}
        initial_float = Decimal(str(breakdown.get('initial_float', session.initial_float) or 0))
        cash_sales = Decimal(str(breakdown.get('cash_sales', expected.get('cash', 0)) or 0))
        reforco = Decimal(str(breakdown.get('reforco', 0) or 0))
        sangria = Decimal(str(breakdown.get('sangria', 0) or 0))
        expected_cash = initial_float + cash_sales + reforco - sangria
        history.append({
            'id': session.id,
            'opened_at': session.opened_at,
            'closed_at': session.closed_at,
            'initial_float': session.initial_float,
            'status': session.status,
            'reconciliation_data': reconciliation,
            'cash_breakdown': {
                'initial_float': initial_float,
                'cash_sales': cash_sales,
                'reforco': reforco,
                'sangria': sangria,
                'expected_cash': expected_cash,
                'counted_cash': counted.get('cash', 0),
                'divergence_cash': divergence.get('cash', 0),
            },
        })
    return history


def cash_summary_from_history(history):
    totals = {
        'sessions_count': 0,
        'initial_float_total': Decimal('0'),
        'cash_sales_total': Decimal('0'),
        'reforco_total': Decimal('0'),
        'sangria_total': Decimal('0'),
        'expected_cash_total': Decimal('0'),
        'counted_cash_total': Decimal('0'),
        'divergence_cash_total': Decimal('0'),
    }

    for session in cash_history(from_date, to_date):
        breakdown = session.get('cash_breakdown') or {}
        totals['sessions_count'] += 1
        totals['initial_float_total'] += Decimal(str(breakdown.get('initial_float', 0) or 0))
        totals['cash_sales_total'] += Decimal(str(breakdown.get('cash_sales', 0) or 0))
        totals['reforco_total'] += Decimal(str(breakdown.get('reforco', 0) or 0))
        totals['sangria_total'] += Decimal(str(breakdown.get('sangria', 0) or 0))
        totals['expected_cash_total'] += Decimal(str(breakdown.get('expected_cash', 0) or 0))
        totals['counted_cash_total'] += Decimal(str(breakdown.get('counted_cash', 0) or 0))
        totals['divergence_cash_total'] += Decimal(str(breakdown.get('divergence_cash', 0) or 0))

    return totals


def cash_summary(from_date=None, to_date=None):
    return cash_summary_from_history(cash_history(from_date, to_date))
