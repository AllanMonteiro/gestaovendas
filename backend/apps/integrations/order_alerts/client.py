from __future__ import annotations

import logging

from django.conf import settings

from apps.integrations.whatsapp.client import WhatsAppClient

logger = logging.getLogger(__name__)


class NoopMessageProvider:
    provider_name = 'noop'

    def is_configured(self) -> bool:
        return False

    def send_message(self, to: str, text: str):
        logger.info('Provedor de alerta noop configurado; envio ignorado para %s.', to)
        return None


class WhatsAppCloudOrderAlertProvider:
    provider_name = 'whatsapp_cloud'

    def __init__(self):
        self.client = WhatsAppClient()

    def is_configured(self) -> bool:
        return self.client.is_configured()

    def send_message(self, to: str, text: str):
        return self.client.send_message(to, text)


def _build_provider(provider_name: str):
    normalized = (provider_name or '').strip().lower()
    if normalized in {'', 'whatsapp_cloud', 'whatsapp'}:
        return WhatsAppCloudOrderAlertProvider()

    logger.warning('ORDER_ALERT_PROVIDER=%s nao e suportado. Usando noop.', normalized)
    return NoopMessageProvider()


class OrderAlertClient:
    def __init__(self):
        self.enabled = bool(getattr(settings, 'ORDER_ALERT_ENABLED', True))
        self.provider_name = str(getattr(settings, 'ORDER_ALERT_PROVIDER', 'whatsapp_cloud') or 'whatsapp_cloud')
        self.company_phone = str(getattr(settings, 'ORDER_ALERT_COMPANY_PHONE', '') or '').strip()
        self.provider = _build_provider(self.provider_name)

    def is_configured(self) -> bool:
        if not self.enabled:
            return False
        if not self.company_phone:
            return False
        return self.provider.is_configured()

    def send_message(self, text: str):
        if not self.enabled:
            logger.info('Alertas de pedido desabilitados por ORDER_ALERT_ENABLED.')
            return None

        if not self.company_phone:
            logger.info('ORDER_ALERT_COMPANY_PHONE nao configurado; alerta ignorado.')
            return None

        if not self.provider.is_configured():
            logger.warning(
                'Provedor de alerta %s nao configurado; alerta do pedido nao foi enviado.',
                getattr(self.provider, 'provider_name', self.provider_name),
            )
            return None

        return self.provider.send_message(self.company_phone, text)


def get_order_alert_client() -> OrderAlertClient:
    return OrderAlertClient()
