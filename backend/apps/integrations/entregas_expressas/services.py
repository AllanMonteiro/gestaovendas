from __future__ import annotations

import logging
from typing import Any

from apps.sales.models import DeliveryOrderMeta, Order
from apps.sales.services import get_store_config

from .client import EntregasExpressasClient

logger = logging.getLogger(__name__)

PROVIDER_NAME = 'entregas_expressas'


def _read_config() -> dict[str, Any]:
    config = get_store_config()
    raw = config.delivery_integration if isinstance(config.delivery_integration, dict) else {}
    return {
        'enabled': bool(raw.get('enabled')),
        'provider': str(raw.get('provider') or '').strip().lower(),
        'integration_token': str(raw.get('integration_token') or raw.get('auth_token') or '').strip(),
        'merchant_id': str(raw.get('merchant_id') or '').strip(),
        'pickup_location': str(raw.get('pickup_location') or '').strip(),
        'default_payment_method': str(raw.get('default_payment_method') or '').strip(),
        'service_type': str(raw.get('service_type') or 'automatico').strip(),
        'enable_dynamic_return': bool(raw.get('enable_dynamic_return')),
        'dispatch_after_seconds': int(raw.get('dispatch_after_seconds') or 120),
    }


def _serialize_quantity(value: Any) -> int | float | str:
    if hasattr(value, 'to_integral_value'):
        integral = value.to_integral_value()
        if value == integral:
            return int(integral)
        return float(value)
    return value


def _extract_external_order_id(payload: Any) -> str:
    if isinstance(payload, dict):
        for key in ('id', 'order_id', 'external_id', 'delivery_id'):
            value = payload.get(key)
            if value not in (None, ''):
                return str(value)
        nested_data = payload.get('data')
        if isinstance(nested_data, dict):
            return _extract_external_order_id(nested_data)
    return ''


def build_order_payload(order: Order, *, cfg: dict[str, Any]) -> dict[str, Any]:
    meta = order.delivery_meta
    items = [
        {
            'product_id': item.product_id,
            'product_name': item.product.name if getattr(item, 'product', None) is not None else 'Item',
            'quantity': _serialize_quantity(item.qty),
            'unit_price': str(item.unit_price),
            'total': str(item.total),
            'notes': item.notes or '',
        }
        for item in order.items.all()
    ]
    if not items:
        items = list(meta.raw_items or [])

    payload = {
        'merchant_id': cfg['merchant_id'] or None,
        'integration_token': cfg['integration_token'],
        'external_reference': str(order.id),
        'pickup_location': cfg['pickup_location'] or None,
        'default_payment_method': cfg['default_payment_method'] or None,
        'service_type': cfg['service_type'] or 'automatico',
        'enable_dynamic_return': cfg['enable_dynamic_return'],
        'dispatch_after_seconds': cfg['dispatch_after_seconds'],
        'order': {
            'id': str(order.id),
            'display_number': f'{order.daily_number:03d}' if order.business_date and order.daily_number else str(order.id)[:8],
            'source': meta.source,
            'status': meta.status,
            'subtotal': str(order.subtotal),
            'delivery_fee': str(meta.delivery_fee),
            'total': str(order.total),
            'payment_method': meta.payment_method or '',
            'notes': meta.notes or '',
            'created_at': order.created_at.isoformat(),
        },
        'customer': {
            'name': meta.customer_name,
            'phone': meta.customer_phone or '',
            'address': meta.address or '',
            'neighborhood': meta.neighborhood or '',
            'cep': meta.cep or '',
        },
        'items': items,
    }
    return payload


def sync_delivery_order(order: Order, *, force: bool = False) -> dict[str, Any] | None:
    meta = order.delivery_meta
    cfg = _read_config()

    if cfg['provider'] and cfg['provider'] != PROVIDER_NAME:
        return None

    if not cfg['enabled'] or not cfg['integration_token']:
        meta.external_provider = PROVIDER_NAME if cfg['provider'] == PROVIDER_NAME else ''
        meta.external_sync_status = 'disabled'
        meta.external_sync_error = ''
        meta.save(update_fields=['external_provider', 'external_sync_status', 'external_sync_error'])
        return None

    if meta.external_sync_status == 'sent' and meta.external_order_id and not force:
        return None

    meta.external_provider = PROVIDER_NAME
    meta.external_sync_status = 'sending'
    meta.external_sync_error = ''
    meta.save(update_fields=['external_provider', 'external_sync_status', 'external_sync_error'])

    payload = build_order_payload(order, cfg=cfg)
    meta.external_order_id = ''
    meta.external_sync_status = 'configured'
    meta.external_sync_error = ''
    meta.save(update_fields=['external_order_id', 'external_sync_status', 'external_sync_error'])
    logger.info('Pedido %s marcado para integracao Entregas Expressas via token do PDV Integrado', order.id)
    return payload
