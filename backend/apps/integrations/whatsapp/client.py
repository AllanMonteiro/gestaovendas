import os
import logging
import requests
from django.conf import settings

logger = logging.getLogger(__name__)

class WhatsAppClient:
    def __init__(self):
        self.phone_id = os.getenv("WHATSAPP_PHONE_ID")
        self.token = os.getenv("WHATSAPP_TOKEN")
        # Updated to v20.0 as seen in user dashboard
        self.base_url = f"https://graph.facebook.com/v20.0/{self.phone_id}/messages"

    def is_configured(self) -> bool:
        return bool(self.phone_id and self.token)

    def send_message(self, to: str, text: str):
        """
        Sends a simple text message via WhatsApp Cloud API.
        """
        if not self.is_configured():
            logger.warning("WhatsAppClient not configured. Skipping automated response.")
            return None

        headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }
        
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": "text",
            "text": {"body": text}
        }

        try:
            response = requests.post(self.base_url, headers=headers, json=payload, timeout=20)
            response.raise_for_status()
            logger.info(f"WhatsApp message sent to {to}")
            return response.json()
        except Exception as e:
            logger.error(f"Error sending WhatsApp message to {to}: {e}")
            return None

    def send_order_confirmation(self, order):
        """
        Sends a detailed order confirmation including items, total and PIX.
        """
        items_str = "\n".join([
            f"• {item.quantity}x {item.product_name}" 
            for item in order.items.all()
        ])
        
        message = (
            f"✅ *Pedido Confirmado!* 🍦\n\n"
            f"Olá *{order.customer_name}*, recebemos seu pedido com sucesso!\n\n"
            f"*Resumo do Pedido #{order.id}:*\n"
            f"{items_str}\n\n"
            f"*Logística:*\n"
            f"🏠 Endereço: {order.address}\n"
            f"🚚 Taxa de Entrega: R$ {order.delivery_fee}\n"
            f"💰 *Total: R$ {order.total}*\n\n"
        )
        
        if order.pix_payload:
            message += (
                f"*Pagamento PIX:*\n"
                f"Use o código abaixo para pagar:\n\n"
                f"```{order.pix_payload}```\n\n"
                f"Assim que pagar, envie o comprovante aqui! 😉"
            )
        else:
            message += f"Forma de Pagamento: {order.payment_method or 'A definir'}\n\n"
            message += "Prepare o pagamento para a entrega! 🤝"

        return self.send_message(order.customer_phone, message)
