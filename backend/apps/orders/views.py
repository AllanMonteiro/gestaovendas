import unicodedata

from django.db import transaction
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import auth_is_required, user_has_permission
from apps.integrations.whatsapp.services_ai import create_delivery_order_from_parsed
from apps.sales import services
from apps.sales.consumers import broadcast_delivery_event
from apps.sales.models import DeliveryOrderMeta, Order, Payment

from .serializers import OrderSerializer

STATUS_TO_CORE = {
    DeliveryOrderMeta.STATUS_NEW: Order.STATUS_OPEN,
    DeliveryOrderMeta.STATUS_PREPARATION: Order.STATUS_OPEN,
    DeliveryOrderMeta.STATUS_DISPATCHED: Order.STATUS_SENT,
    DeliveryOrderMeta.STATUS_DELIVERED: Order.STATUS_PAID,
}

PAYMENT_METHOD_ALIASES = {
    'cash': Payment.METHOD_CASH,
    'dinheiro': Payment.METHOD_CASH,
    'pix': Payment.METHOD_PIX,
    'card': Payment.METHOD_CARD,
    'cartao': Payment.METHOD_CARD,
    'credito': Payment.METHOD_CARD,
    'debito': Payment.METHOD_CARD,
}


def _normalize_payment_token(raw_method):
    text = unicodedata.normalize('NFKD', (raw_method or '').strip().lower())
    return ''.join(ch for ch in text if not unicodedata.combining(ch))


def _normalize_payment_method(raw_method):
    normalized = _normalize_payment_token(raw_method)
    return PAYMENT_METHOD_ALIASES.get(normalized, Payment.METHOD_PIX)


def _build_delivery_payment_meta(raw_method):
    normalized = _normalize_payment_token(raw_method)
    if normalized == 'credito':
        return {'card_type': 'CREDIT'}
    if normalized == 'debito':
        return {'card_type': 'DEBIT'}
    return None


def _sync_delivery_payment(order):
    meta = getattr(order, 'delivery_meta', None)
    if meta is None:
        return

    if meta.status != DeliveryOrderMeta.STATUS_DELIVERED or order.status != Order.STATUS_PAID:
        Payment.objects.filter(order=order).delete()
        return

    method = _normalize_payment_method(meta.payment_method)
    payment_meta = _build_delivery_payment_meta(meta.payment_method)
    Payment.objects.update_or_create(
        order=order,
        method=method,
        defaults={
            'amount': order.total,
            'meta': payment_meta,
        },
    )
    Payment.objects.filter(order=order).exclude(method=method).delete()


def _delivery_orders():
    return (
        Order.objects.filter(type=Order.TYPE_DELIVERY, delivery_meta__isnull=False)
        .select_related('customer', 'delivery_meta')
        .prefetch_related('items__product')
        .order_by('-created_at')
    )


def _forbidden(request):
    return auth_is_required() and not user_has_permission(request.user, 'pdv.operate')


class DeliveryOrdersView(APIView):
    def get(self, request):
        if _forbidden(request):
            return Response({'detail': 'Forbidden'}, status=403)
        return Response(OrderSerializer(_delivery_orders(), many=True).data)


class PublicDeliveryOrderCreateView(APIView):
    authentication_classes = []
    permission_classes = []

    def post(self, request):
        payload = request.data if isinstance(request.data, dict) else {}
        items = payload.get('items') or []
        if not isinstance(items, list) or not items:
            return Response({'detail': 'items required'}, status=400)

        customer_name = (payload.get('customer_name') or '').strip()
        address = (payload.get('address') or '').strip()
        neighborhood = (payload.get('neighborhood') or '').strip()
        if not customer_name:
            return Response({'detail': 'customer_name required'}, status=400)
        if not address:
            return Response({'detail': 'address required'}, status=400)
        if not neighborhood:
            return Response({'detail': 'neighborhood required'}, status=400)

        parsed = {
            'customer_name': customer_name,
            'customer_phone': payload.get('customer_phone'),
            'address': address,
            'neighborhood': neighborhood,
            'cep': payload.get('cep'),
            'payment_method': payload.get('payment_method'),
            'notes': payload.get('notes'),
            'items': items,
        }
        order = create_delivery_order_from_parsed(
            phone=payload.get('customer_phone'),
            parsed=parsed,
            source=DeliveryOrderMeta.SOURCE_WEB,
            default_customer_name='Cliente Web',
        )
        try:
            broadcast_delivery_event('order_created', {
                'id': str(order.id),
                'customer_name': order.delivery_meta.customer_name,
                'total': str(order.total),
                'status': order.delivery_meta.status,
            })
        except Exception:
            pass
        return Response(OrderSerializer(order).data, status=201)


class DeliveryOrderDetailView(APIView):
    @transaction.atomic
    def patch(self, request, id):
        if _forbidden(request):
            return Response({'detail': 'Forbidden'}, status=403)

        order = _delivery_orders().filter(id=id).first()
        if not order:
            return Response({'detail': 'Order not found'}, status=404)

        new_status = (request.data.get('status') or '').strip().lower()
        if new_status not in STATUS_TO_CORE:
            return Response({'detail': 'Invalid status'}, status=400)
        if new_status == DeliveryOrderMeta.STATUS_DELIVERED:
            try:
                services.ensure_open_cash_session()
            except ValueError as exc:
                return Response({'detail': str(exc)}, status=400)

        meta = order.delivery_meta
        meta.status = new_status
        meta.save(update_fields=['status'])

        order.status = STATUS_TO_CORE[new_status]
        update_fields = ['status']
        if new_status == DeliveryOrderMeta.STATUS_DELIVERED:
            order.closed_at = timezone.now()
            update_fields.append('closed_at')
        elif order.closed_at is not None:
            order.closed_at = None
            update_fields.append('closed_at')
        order.save(update_fields=update_fields)
        _sync_delivery_payment(order)

        return Response(OrderSerializer(order).data)

    @transaction.atomic
    def delete(self, request, id):
        if not user_has_permission(request.user, 'order.delete'):
            return Response({'detail': 'Forbidden'}, status=403)

        try:
            services.ensure_open_cash_session()
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=400)

        order = _delivery_orders().filter(id=id).first()
        if not order:
            return Response({'detail': 'Order not found'}, status=404)

        order.delete()
        return Response({'status': 'deleted'})
