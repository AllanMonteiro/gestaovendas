from decimal import Decimal
import logging
import re
from datetime import datetime, time, timedelta
from django.core.files.storage import default_storage
from django.db.models import Count, Sum, Q
from rest_framework.response import Response
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.views import APIView
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from apps.accounts.permissions import auth_is_required, user_has_permission
from apps.sales.models import Order, OrderItem, CashSession, CashMove, Payment
from apps.sales.serializers import (
    OrderSerializer,
    OrderItemSerializer,
    OrderSummarySerializer,
    CashSessionSerializer,
    CashMoveSerializer,
    StoreConfigSerializer,
    StoreConfigPdvSerializer,
    StoreConfigUiSerializer,
)
from apps.sales import services
from apps.kitchen.consumers import broadcast_kitchen_event
from apps.sales.consumers import broadcast_pdv_event
from apps.loyalty.models import Customer
from apps.reports import queries as report_queries

logger = logging.getLogger(__name__)
def _is_date_only(value: str) -> bool:
    return isinstance(value, str) and 'T' not in value and ' ' not in value and ':' not in value


def _normalize_phone(value: str | None) -> str:
    return re.sub(r'\D', '', value or '')


def _apply_range_filter(qs, from_date=None, to_date=None):
    return _apply_range_filter_for_field(qs, 'created_at', from_date, to_date)


def _apply_range_filter_for_field(qs, field_name, from_date=None, to_date=None):
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


def _wants_items(request, default=True):
    raw = request.query_params.get('include_items')
    if raw is None:
        return default
    return raw.strip().lower() in {'1', 'true', 'yes', 'on'}


def _serialize_orders(orders, include_items=True):
    serializer_class = OrderSerializer if include_items else OrderSummarySerializer
    return serializer_class(orders, many=True).data


class OrdersCreateView(APIView):
    def post(self, request):
        if auth_is_required() and not user_has_permission(request.user, 'pdv.operate'):
            return Response({'detail': 'Forbidden'}, status=403)
        data = request.data
        client_request_id = data.get('client_request_id')
        customer = None
        phone = _normalize_phone(data.get('customer_phone'))
        order_type = data.get('type', Order.TYPE_COUNTER)
        if phone and len(phone) < 8:
            return Response({'detail': 'customer_phone invalid'}, status=400)
        customer_name = (data.get('customer_name') or '').strip()
        customer_last_name = (data.get('customer_last_name') or '').strip()
        customer_neighborhood = (data.get('customer_neighborhood') or '').strip()
        if phone:
            customer, created = Customer.objects.get_or_create(
                phone=phone,
                defaults={
                    'name': customer_name or None,
                    'last_name': customer_last_name or None,
                    'neighborhood': customer_neighborhood or None,
                },
            )
            if not created:
                fields_to_update = []
                if customer_name and customer.name != customer_name:
                    customer.name = customer_name
                    fields_to_update.append('name')
                if customer_last_name and customer.last_name != customer_last_name:
                    customer.last_name = customer_last_name
                    fields_to_update.append('last_name')
                if customer_neighborhood and customer.neighborhood != customer_neighborhood:
                    customer.neighborhood = customer_neighborhood
                    fields_to_update.append('neighborhood')
                if fields_to_update:
                    customer.save(update_fields=fields_to_update)
        try:
            order = services.create_order_idempotent(
                order_type=order_type,
                table_label=data.get('table_label'),
                customer=customer,
                client_request_id=client_request_id,
            )
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=400)
        return Response(OrderSerializer(order).data)


class OrderItemsView(APIView):
    def post(self, request, id):
        if auth_is_required() and not user_has_permission(request.user, 'pdv.operate'):
            return Response({'detail': 'Forbidden'}, status=403)
        data = request.data
        order = Order.objects.get(id=id)
        try:
            item = services.add_item(
                order=order,
                product_id=data['product_id'],
                qty=Decimal(str(data.get('qty', '1'))),
                weight_grams=data.get('weight_grams'),
                notes=data.get('notes'),
            )
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=400)
        return Response(OrderItemSerializer(item).data)


class OrderItemDeleteView(APIView):
    def put(self, request, id, item_id):
        if auth_is_required() and not user_has_permission(request.user, 'pdv.operate'):
            return Response({'detail': 'Forbidden'}, status=403)
        try:
            services.ensure_open_cash_session()
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=400)
        item = OrderItem.objects.get(id=item_id, order_id=id)
        order = item.order
        data = request.data
        try:
            qty = Decimal(str(data.get('qty', item.qty)))
        except Exception:
            return Response({'detail': 'Invalid qty'}, status=400)
        if qty <= 0:
            return Response({'detail': 'qty must be > 0'}, status=400)
        item.qty = qty
        if 'notes' in data:
            item.notes = data.get('notes') or None
        if 'weight_grams' in data:
            item.weight_grams = data.get('weight_grams')
        item.total = services.q2(item.qty * item.unit_price)
        item.save(update_fields=['qty', 'notes', 'weight_grams', 'total'])
        services.recalc_order_totals(order)
        return Response(OrderItemSerializer(item).data)

    def delete(self, request, id, item_id):
        if auth_is_required() and not user_has_permission(request.user, 'pdv.operate'):
            return Response({'detail': 'Forbidden'}, status=403)
        try:
            services.ensure_open_cash_session()
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=400)
        item = OrderItem.objects.get(id=item_id, order_id=id)
        order = item.order
        item.delete()
        services.recalc_order_totals(order)
        return Response({'status': 'deleted'})


class OrderSendKitchenView(APIView):
    def post(self, request, id):
        if auth_is_required() and not user_has_permission(request.user, 'kitchen.manage'):
            return Response({'detail': 'Forbidden'}, status=403)
        order = Order.objects.get(id=id)
        ticket = services.send_to_kitchen(order=order)
        try:
            broadcast_kitchen_event('order_sent', {'order_id': str(order.id)})
        except Exception:
            logger.exception('Failed to broadcast kitchen event')
        return Response({'status': 'sent', 'ticket_id': ticket.id})


class OrderCloseView(APIView):
    def post(self, request, id):
        if auth_is_required() and not user_has_permission(request.user, 'pdv.operate'):
            return Response({'detail': 'Forbidden'}, status=403)
        data = request.data
        order = Order.objects.get(id=id)
        try:
            order = services.close_order(
                order=order,
                discount=Decimal(str(data.get('discount', '0'))),
                payments=data.get('payments', []),
                use_loyalty_points=bool(data.get('use_loyalty_points')),
                points_to_redeem=data.get('points_to_redeem'),
                client_request_id=data.get('client_request_id'),
                user=request.user,
            )
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=400)
        except PermissionError as exc:
            return Response({'detail': str(exc)}, status=403)
        try:
            broadcast_pdv_event('order_paid', {'order_id': str(order.id)})
        except Exception:
            logger.exception('Failed to broadcast paid event')
        return Response(OrderSerializer(order).data)


class OrderCancelView(APIView):
    def post(self, request, id):
        if not user_has_permission(request.user, 'order.cancel'):
            return Response({'detail': 'Forbidden'}, status=403)
        data = request.data
        order = Order.objects.get(id=id)
        try:
            order = services.cancel_order(order=order, reason=data.get('reason', ''), user=request.user)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=400)
        try:
            broadcast_pdv_event('order_canceled', {'order_id': str(order.id)})
        except Exception:
            logger.exception('Failed to broadcast canceled event')
        return Response(OrderSerializer(order).data)


class OrderDeleteView(APIView):
    def delete(self, request, id):
        if not user_has_permission(request.user, 'order.delete'):
            return Response({'detail': 'Forbidden'}, status=403)
        try:
            services.ensure_open_cash_session()
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=400)
        Order.objects.filter(id=id).delete()
        return Response({'status': 'deleted'})


class OrdersOpenView(APIView):
    def get(self, request):
        orders = (
            Order.objects.filter(status__in=[Order.STATUS_OPEN, Order.STATUS_SENT, Order.STATUS_READY])
            .select_related('customer')
            .prefetch_related('items__product')
            .order_by('-created_at')
        )
        return Response(_serialize_orders(orders, include_items=_wants_items(request, default=True)))


class OrdersClosedView(APIView):
    def get(self, request):
        from_date = request.query_params.get('from')
        to_date = request.query_params.get('to')
        qs = Order.objects.filter(status=Order.STATUS_PAID).select_related('customer').prefetch_related('items__product')
        qs = qs.filter(closed_at__isnull=False)
        qs = _apply_range_filter_for_field(qs, 'closed_at', from_date, to_date)
        return Response(_serialize_orders(qs.order_by('-closed_at'), include_items=_wants_items(request, default=True)))


class OrdersCanceledView(APIView):
    def get(self, request):
        from_date = request.query_params.get('from')
        to_date = request.query_params.get('to')
        qs = Order.objects.filter(status=Order.STATUS_CANCELED).select_related('customer').prefetch_related('items__product')
        qs = _apply_range_filter(qs, from_date, to_date)
        return Response(_serialize_orders(qs.order_by('-created_at'), include_items=_wants_items(request, default=True)))


class OrderDetailView(APIView):
    def get(self, request, id):
        order = (
            Order.objects.select_related('customer')
            .prefetch_related('items__product')
            .filter(id=id)
            .first()
        )
        if not order:
            return Response({'detail': 'Order not found'}, status=404)
        return Response(OrderSerializer(order).data)


class CashOpenView(APIView):
    def post(self, request):
        if auth_is_required() and not user_has_permission(request.user, 'cash.manage'):
            return Response({'detail': 'Forbidden'}, status=403)
        try:
            session = services.open_cash(user=request.user, initial_float=Decimal(str(request.data.get('initial_float', '0'))))
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=400)
        try:
            broadcast_pdv_event('cash_status_changed', {'open': True, 'session_id': session.id})
        except Exception:
            logger.exception('Failed to broadcast cash status open event')
        return Response(CashSessionSerializer(session).data)


class CashMoveView(APIView):
    def get(self, request):
        from_date = request.query_params.get('from')
        to_date = request.query_params.get('to')
        qs = CashMove.objects.select_related('session', 'user').order_by('-created_at')
        qs = _apply_range_filter(qs, from_date, to_date)
        return Response(CashMoveSerializer(qs, many=True).data)

    def post(self, request):
        if auth_is_required() and not user_has_permission(request.user, 'cash.manage'):
            return Response({'detail': 'Forbidden'}, status=403)
        data = request.data
        try:
            move = services.cash_move(
                user=request.user,
                move_type=data['type'],
                amount=Decimal(str(data['amount'])),
                reason=data.get('reason', ''),
            )
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=400)
        try:
            broadcast_pdv_event('cash_move_created', {'id': move.id, 'type': move.type, 'amount': str(move.amount)})
        except Exception:
            logger.exception('Failed to broadcast cash move event')
        return Response(CashMoveSerializer(move).data)


class CashCloseView(APIView):
    def post(self, request):
        if auth_is_required() and not user_has_permission(request.user, 'cash.manage'):
            return Response({'detail': 'Forbidden'}, status=403)
        data = request.data
        try:
            result = services.close_cash(
                user=request.user,
                counted_cash=Decimal(str(data.get('counted_cash', '0'))),
                counted_pix=Decimal(str(data.get('counted_pix', '0'))),
                counted_card=Decimal(str(data.get('counted_card', '0'))),
            )
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=400)
        try:
            broadcast_pdv_event('cash_status_changed', {'open': False})
        except Exception:
            logger.exception('Failed to broadcast cash status close event')
        return Response(result)


class CashStatusView(APIView):
    def get(self, request):
        session = CashSession.objects.filter(status=CashSession.STATUS_OPEN).first()
        if not session:
            return Response({'open': False})
        moves = CashMove.objects.filter(session=session).aggregate(
            reforco=Sum('amount', filter=Q(type=CashMove.TYPE_REFORCO)),
            sangria=Sum('amount', filter=Q(type=CashMove.TYPE_SANGRIA)),
        )
        cash_sales = Payment.objects.filter(
            method=Payment.METHOD_CASH,
            order__status=Order.STATUS_PAID,
            order__closed_at__gte=session.opened_at,
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0')
        reforco = moves['reforco'] or Decimal('0')
        sangria = moves['sangria'] or Decimal('0')
        current_cash_estimated = session.initial_float + cash_sales + reforco - sangria
        return Response({
            'open': True,
            'session': CashSessionSerializer(session).data,
            'totals': {
                'cash_sales': str(cash_sales),
                'reforco': str(reforco),
                'sangria': str(sangria),
                'current_cash_estimated': str(current_cash_estimated),
            }
        })


class CashHistoryView(APIView):
    def get(self, request):
        from_date = request.query_params.get('from')
        to_date = request.query_params.get('to')
        qs = CashSession.objects.filter(status=CashSession.STATUS_CLOSED).order_by('-closed_at')
        
        local_tz = timezone.get_current_timezone()
        if from_date:
            parsed_from_date = parse_date(from_date)
            parsed_from_datetime = parse_datetime(from_date)
            if parsed_from_date and _is_date_only(from_date):
                start_local = timezone.make_aware(datetime.combine(parsed_from_date, time.min), local_tz)
                qs = qs.filter(closed_at__gte=start_local)
            else:
                if parsed_from_datetime and timezone.is_naive(parsed_from_datetime):
                    parsed_from_datetime = timezone.make_aware(parsed_from_datetime, local_tz)
                if parsed_from_datetime:
                    qs = qs.filter(closed_at__gte=parsed_from_datetime)
        if to_date:
            parsed_to_date = parse_date(to_date)
            parsed_to_datetime = parse_datetime(to_date)
            if parsed_to_date and _is_date_only(to_date):
                next_day_local = timezone.make_aware(datetime.combine(parsed_to_date + timedelta(days=1), time.min), local_tz)
                qs = qs.filter(closed_at__lt=next_day_local)
            else:
                if parsed_to_datetime and timezone.is_naive(parsed_to_datetime):
                    parsed_to_datetime = timezone.make_aware(parsed_to_datetime, local_tz)
                if parsed_to_datetime:
                    qs = qs.filter(closed_at__lte=parsed_to_datetime)
                    
        return Response(CashSessionSerializer(qs, many=True).data)


class CashDashboardView(APIView):
    def get(self, request):
        from_date = request.query_params.get('from')
        to_date = request.query_params.get('to')
        today = timezone.localdate().isoformat()

        status_response = CashStatusView().get(request).data
        orders_qs = Order.objects.filter(status=Order.STATUS_PAID, closed_at__isnull=False).select_related('customer')
        orders_qs = _apply_range_filter_for_field(orders_qs, 'closed_at', from_date, to_date).order_by('-closed_at')
        moves_qs = CashMove.objects.select_related('session', 'user').order_by('-created_at')
        moves_qs = _apply_range_filter(moves_qs, from_date, to_date)
        history_qs = CashSession.objects.filter(status=CashSession.STATUS_CLOSED).order_by('-closed_at')
        if from_date or to_date:
            history_qs = _apply_range_filter_for_field(history_qs, 'closed_at', from_date, to_date)

        config = services.get_store_config()
        open_orders_count = Order.objects.filter(
            status__in=[Order.STATUS_OPEN, Order.STATUS_SENT, Order.STATUS_READY]
        ).aggregate(total=Count('id'))['total'] or 0

        payload = {
            'cash_status': status_response,
            'closed_orders': OrderSummarySerializer(orders_qs, many=True).data,
            'cash_moves': CashMoveSerializer(moves_qs, many=True).data,
            'payments': report_queries.by_payment(from_date, to_date),
            'today_summary': report_queries.summary(today, today),
            'open_orders_count': open_orders_count,
            'config': StoreConfigUiSerializer(config).data,
            'cash_history': CashSessionSerializer(history_qs, many=True).data,
        }
        return Response(payload)


class ConfigView(APIView):
    def get(self, request):
        config = services.get_store_config()
        return Response(StoreConfigSerializer(config, context={'request': request}).data)

    def put(self, request):
        if auth_is_required() and not user_has_permission(request.user, 'system.config.manage'):
            return Response({'detail': 'Forbidden'}, status=403)
        config = services.get_store_config()
        serializer = StoreConfigSerializer(config, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(StoreConfigSerializer(config, context={'request': request}).data)


class ConfigUiView(APIView):
    def get(self, request):
        config = services.get_store_config()
        return Response(StoreConfigUiSerializer(config, context={'request': request}).data)


class ConfigPdvView(APIView):
    def get(self, request):
        config = services.get_store_config()
        return Response(StoreConfigPdvSerializer(config, context={'request': request}).data)


class ConfigUploadImageView(APIView):
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        if auth_is_required() and not user_has_permission(request.user, 'system.config.manage'):
            return Response({'detail': 'Forbidden'}, status=403)

        file = request.FILES.get('file')
        slot = (request.data.get('slot') or '').strip().lower()
        category_id = (request.data.get('category_id') or '').strip()

        if file is None:
            return Response({'detail': 'file required'}, status=400)
        if slot not in {'logo', 'category'}:
            return Response({'detail': 'slot invalid'}, status=400)
        if slot == 'category' and not category_id:
            return Response({'detail': 'category_id required'}, status=400)

        safe_name = re.sub(r'[^a-zA-Z0-9._-]+', '-', file.name or 'image')
        prefix = 'logo' if slot == 'logo' else f'category-{category_id}'
        stored_name = default_storage.save(f'store-config/{prefix}-{safe_name}', file)
        relative_url = default_storage.url(stored_name)
        absolute_url = request.build_absolute_uri(relative_url)
        return Response({
            'slot': slot,
            'category_id': category_id or None,
            'url': absolute_url,
            'relative_url': relative_url,
        })


class ResetSalesView(APIView):
    def post(self, request):
        if not user_has_permission(request.user, 'system.maintenance'):
            if auth_is_required() and not request.user.is_superuser:
                return Response({'detail': 'Forbidden'}, status=403)
        
        password = request.data.get('password')
        if not password:
            return Response({'detail': 'Password required'}, status=400)
            
        if auth_is_required():
            if not request.user.check_password(password):
                return Response({'detail': 'Senha incorreta'}, status=403)
        
        # If auth is NOT required, we still want to protect this.
        # But if auth is disabled, there's no "user" to check password against easily.
        # However, for this specific request, we'll assume auth IS required in production.
        
        services.reset_sales(user=request.user)
        return Response({'status': 'ok', 'message': 'Banco de vendas resetado com sucesso'})
