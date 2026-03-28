from rest_framework import viewsets, permissions
from .models import Order
from .serializers import OrderSerializer
from apps.integrations.whatsapp.client import WhatsAppClient

class OrderViewSet(viewsets.ModelViewSet):
    queryset = Order.objects.all().order_by('-created_at')
    serializer_class = OrderSerializer

    def get_permissions(self):
        if self.action == 'create':
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    def perform_update(self, serializer):
        # Save before update to check status transition
        instance = self.get_object()
        old_status = instance.status
        
        # Save the update
        order = serializer.save()
        
        # Trigger notification if status just changed to 'despachado'
        if old_status != 'despachado' and order.status == 'despachado':
            if order.customer_phone:
                client = WhatsAppClient()
                if client.is_configured():
                    msg = f"🍦 *Seu pedido está a caminho!* 🛵\n\nOlá *{order.customer_name}*, seu pedido #*{order.id}* acaba de sair para entrega. Prepare o coração (e o estômago)!"
                    client.send_message(order.customer_phone, msg)
