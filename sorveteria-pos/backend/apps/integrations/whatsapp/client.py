import logging
import os

import requests

logger = logging.getLogger(__name__)


def _delivery_meta(order):
    return getattr(order, 'delivery_meta', None)


def _customer_name(order) -> str:
    meta = _delivery_meta(order)
    if meta and meta.customer_name:
        return meta.customer_name
    customer = getattr(order, 'customer', None)
    if customer and customer.name:
        return customer.name
    return 'Cliente'


def _customer_phone(order) -> str | None:
    meta = _delivery_meta(order)
    if meta and meta.customer_phone:
        return meta.customer_phone
    return getattr(order, 'customer_phone', None)


def _address(order) -> str:
    meta = _delivery_meta(order)
    if meta and meta.address:
        return meta.address
    return getattr(order, 'address', None) or 'Nao informado'


def _delivery_fee(order):
    meta = _delivery_meta(order)
    if meta is not None:
        return meta.delivery_fee
    return getattr(order, 'delivery_fee', 0)


def _payment_method(order):
    meta = _delivery_meta(order)
    if meta and meta.payment_method:
        return meta.payment_method
    return getattr(order, 'payment_method', None)


def _pix_payload(order):
    meta = _delivery_meta(order)
    if meta and meta.pix_payload:
        return meta.pix_payload
    return getattr(order, 'pix_payload', None)


def _order_items(order):
    items = []
    for item in order.items.all():
        product_name = getattr(item, 'product_name', None)
        if not product_name and getattr(item, 'product', None) is not None:
            product_name = item.product.name
        quantity = getattr(item, 'quantity', None)
        if quantity is None:
            quantity = getattr(item, 'qty', 1)
        items.append(f"- {quantity}x {product_name or 'Item'}")

    if items:
        return items

    meta = _delivery_meta(order)
    for item in getattr(meta, 'raw_items', []) or []:
        items.append(f"- {item.get('quantity', 1)}x {item.get('product_name', 'Item')}")
    return items


class WhatsAppClient:
    def __init__(self):
        self.phone_id = os.getenv('WHATSAPP_PHONE_ID')
        self.token = os.getenv('WHATSAPP_TOKEN')
        self.base_url = f'https://graph.facebook.com/v20.0/{self.phone_id}/messages'

    def is_configured(self) -> bool:
        return bool(self.phone_id and self.token)

    def send_message(self, to: str, text: str):
        if not self.is_configured():
            logger.warning('WhatsAppClient not configured. Skipping automated response.')
            return None

        headers = {
            'Authorization': f'Bearer {self.token}',
            'Content-Type': 'application/json',
        }
        payload = {
            'messaging_product': 'whatsapp',
            'recipient_type': 'individual',
            'to': to,
            'type': 'text',
            'text': {'body': text},
        }

        try:
            response = requests.post(self.base_url, headers=headers, json=payload, timeout=20)
            response.raise_for_status()
            logger.info('WhatsApp message sent to %s', to)
            return response.json()
        except Exception as exc:
            logger.error('Error sending WhatsApp message to %s: %s', to, exc)
            return None

    def send_order_confirmation(self, order):
        customer_phone = _customer_phone(order)
        if not customer_phone:
            logger.warning('Order %s has no phone number for WhatsApp confirmation.', order.id)
            return None

        items_str = '\n'.join(_order_items(order)) or '- Pedido sem itens detalhados'
        message = (
            f'*Pedido confirmado!*\n\n'
            f'Ola, {_customer_name(order)}. Recebemos seu pedido com sucesso.\n\n'
            f'Resumo do pedido #{order.id}:\n'
            f'{items_str}\n\n'
            f'Endereco: {_address(order)}\n'
            f'Taxa de entrega: R$ {_delivery_fee(order)}\n'
            f'Total: R$ {order.total}\n\n'
        )

        pix_payload = _pix_payload(order)
        if pix_payload:
            message += (
                'Pagamento PIX:\n'
                'Use o codigo abaixo para pagar:\n\n'
                f'{pix_payload}\n\n'
                'Quando pagar, envie o comprovante por aqui.'
            )
        else:
            message += f'Forma de pagamento: {_payment_method(order) or "A definir"}'

        return self.send_message(customer_phone, message)
