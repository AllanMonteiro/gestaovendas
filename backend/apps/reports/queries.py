from datetime import datetime, time, timedelta
from django.db.models import Sum, Count, Avg, Case, When, Value, CharField, F
from django.db.models.functions import ExtractHour, TruncDate
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from apps.sales.models import Order, Payment, OrderItem


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
    qs = OrderItem.objects.select_related('product__category', 'order').filter(order__status=Order.STATUS_PAID)
    qs = _apply_range_filter(qs, 'order__closed_at', from_date, to_date)
    return list(qs.values('product__category__id', 'product__category__name').annotate(total=Sum('total')))


def by_product(from_date=None, to_date=None, limit=20):
    qs = OrderItem.objects.select_related('product', 'order').filter(order__status=Order.STATUS_PAID)
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
    qs = Order.objects.filter(status=Order.STATUS_PAID, customer__isnull=False, closed_at__isnull=False)
    qs = _apply_range_filter(qs, 'closed_at', from_date, to_date)
    return list(qs.values('customer__id', 'customer__phone').annotate(total=Sum('total'), orders=Count('id')).order_by('-total')[:limit])


def cash_reconciliation(session_id):
    return []
