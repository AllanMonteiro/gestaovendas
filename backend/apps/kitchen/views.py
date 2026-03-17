from rest_framework.views import APIView
from rest_framework.response import Response
from apps.kitchen.models import KitchenTicket
from apps.sales.models import Order
from apps.sales.serializers import OrderSerializer
from apps.kitchen.consumers import broadcast_kitchen_event


class KitchenQueueView(APIView):
    def get(self, request):
        tickets = KitchenTicket.objects.select_related('order').prefetch_related('order__items').order_by('updated_at')
        orders = [t.order for t in tickets]
        return Response(OrderSerializer(orders, many=True).data)


class KitchenReadyView(APIView):
    def post(self, request, order_id):
        ticket = KitchenTicket.objects.get(order_id=order_id)
        ticket.status = KitchenTicket.STATUS_READY
        ticket.save(update_fields=['status'])
        Order.objects.filter(id=order_id).update(status=Order.STATUS_READY)
        broadcast_kitchen_event('order_ready', {'order_id': str(order_id)})
        return Response({'status': 'ready'})


class KitchenBackToPrepView(APIView):
    def post(self, request, order_id):
        ticket = KitchenTicket.objects.get(order_id=order_id)
        ticket.status = KitchenTicket.STATUS_PREPARING
        ticket.save(update_fields=['status'])
        broadcast_kitchen_event('order_status_changed', {'order_id': str(order_id), 'status': ticket.status})
        return Response({'status': 'preparing'})


class KitchenPrintView(APIView):
    def post(self, request, order_id):
        # Placeholder: integration with agent via HTTP/WebSocket should happen here.
        return Response({'status': 'queued'})
