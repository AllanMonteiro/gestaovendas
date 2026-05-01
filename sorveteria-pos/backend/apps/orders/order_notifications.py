from __future__ import annotations

import logging
from decimal import Decimal
from urllib.parse import urlencode

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.integrations.order_alerts.client import get_order_alert_client
from apps.sales.models import DeliveryOrderMeta, Order

logger = logging.getLogger(__name__)


def _format_brl(value: Decimal) -> str:
    amount = Decimal(value or 0).quantize(Decimal('0.01'))
    return f'R$ {str(amount).replace(".", ",")}'


def _order_number(order: Order) -> str:
    if order.business_date and order.daily_number:
        return f'{order.daily_number:03d}'
    return str(order.id)[:8]


def _panel_link(order: Order) -> str:
    base_url = str(getattr(settings, 'ORDER_ALERT_PANEL_BASE_URL', '') or '').strip()
    if not base_url:
        return ''

    query = urlencode({'order_id': str(order.id)})
    return f'{base_url.rstrip("/")}/delivery?{query}'


def _delivery_mode_label(order: Order) -> str:
    meta = getattr(order, 'delivery_meta', None)
    if meta is None:
        return 'Entrega'
    if not (meta.address or '').strip():
        return 'Retirada'
    return 'Entrega'


def _is_test_order(order: Order) -> bool:
    for attr_name in ('is_test', 'test_mode', 'sandbox'):
        if bool(getattr(order, attr_name, False)):
            return True

    meta = getattr(order, 'delivery_meta', None)
    if meta is None:
        return False

    for attr_name in ('is_test', 'test_mode', 'sandbox'):
        if bool(getattr(meta, attr_name, False)):
            return True

    return str(getattr(meta, 'source', '') or '').strip().lower() in {'test', 'teste', 'sandbox'}


def _should_send_new_delivery_order_alert(order: Order) -> bool:
    meta = getattr(order, 'delivery_meta', None)
    if meta is None:
        return False
    if order.type != Order.TYPE_DELIVERY:
        return False
    if meta.source != DeliveryOrderMeta.SOURCE_WEB:
        return False
    if meta.status != DeliveryOrderMeta.STATUS_NEW:
        return False
    if _is_test_order(order):
        return False
    return True


def _build_new_delivery_order_message(order: Order) -> str:
    meta = order.delivery_meta
    created_at = timezone.localtime(order.created_at)
    payment_method = (meta.payment_method or '').strip() or 'A definir'
    lines = [
        '*Novo pedido do delivery*',
        '',
        f'Pedido: #{_order_number(order)}',
        f'Cliente: {meta.customer_name}',
        f'Total: {_format_brl(order.total)}',
        f'Pagamento: {payment_method}',
        f'Tipo: {_delivery_mode_label(order)}',
        f'Horario: {created_at.strftime("%d/%m/%Y %H:%M")}',
    ]

    panel_link = _panel_link(order)
    if panel_link:
        lines.extend(['', f'Abrir no painel: {panel_link}'])

    return '\n'.join(lines)


def send_new_delivery_order_alert(order: Order):
    if not _should_send_new_delivery_order_alert(order):
        return None

    client = get_order_alert_client()
    if not client.is_configured():
        logger.info('Alerta automatico ignorado para o pedido %s por falta de configuracao.', order.id)
        return None

    message = _build_new_delivery_order_message(order)
    return client.send_message(message)


def _send_new_delivery_order_alert_by_id(order_id):
    try:
        order = (
            Order.objects.select_related('customer', 'delivery_meta')
            .prefetch_related('items__product')
            .get(pk=order_id)
        )
    except Order.DoesNotExist:
        logger.warning('Pedido %s nao encontrado para enviar alerta automatico.', order_id)
        return None

    try:
        return send_new_delivery_order_alert(order)
    except Exception:
        logger.exception('Falha ao enviar alerta automatico do pedido %s.', order_id)
        return None


def enqueue_new_delivery_order_alert(order_id):
    transaction.on_commit(lambda: _send_new_delivery_order_alert_by_id(order_id))
