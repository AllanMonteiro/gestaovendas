from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import auth_is_required, user_has_permission
from apps.integrations.whatsapp.client import WhatsAppClient
from apps.sales.models import DeliveryOrderMeta, Order

from .serializers import OrderSerializer

STATUS_TO_CORE = {
    DeliveryOrderMeta.STATUS_NEW: Order.STATUS_OPEN,
    DeliveryOrderMeta.STATUS_PREPARATION: Order.STATUS_OPEN,
    DeliveryOrderMeta.STATUS_DISPATCHED: Order.STATUS_SENT,
    DeliveryOrderMeta.STATUS_DELIVERED: Order.STATUS_PAID,
}


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


class DeliveryOrderDetailView(APIView):
    def patch(self, request, id):
        if _forbidden(request):
            return Response({'detail': 'Forbidden'}, status=403)

        order = _delivery_orders().filter(id=id).first()
        if not order:
            return Response({'detail': 'Order not found'}, status=404)

        new_status = (request.data.get('status') or '').strip().lower()
        if new_status not in STATUS_TO_CORE:
            return Response({'detail': 'Invalid status'}, status=400)

        meta = order.delivery_meta
        old_status = meta.status
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

        if old_status != DeliveryOrderMeta.STATUS_DISPATCHED and new_status == DeliveryOrderMeta.STATUS_DISPATCHED:
            customer_phone = meta.customer_phone
            if customer_phone:
                client = WhatsAppClient()
                if client.is_configured():
                    message = (
                        f'Seu pedido esta a caminho.\n\n'
                        f'Ola, {meta.customer_name}. O pedido #{order.id} saiu para entrega.'
                    )
                    client.send_message(customer_phone, message)

        return Response(OrderSerializer(order).data)
