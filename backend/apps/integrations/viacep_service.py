import logging
import unicodedata
from decimal import Decimal

import requests

logger = logging.getLogger(__name__)

DEFAULT_FEE_TABLE = {
    'CENTRO': Decimal('5.00'),
    'BATISTA CAMPOS': Decimal('6.00'),
    'NAZARE': Decimal('6.00'),
    'UMARIZAL': Decimal('7.00'),
    'MARCO': Decimal('8.00'),
    'PEDREIRA': Decimal('8.00'),
    'TILEGUA': Decimal('10.00'),
    'COQUEIRO': Decimal('12.00'),
}
DEFAULT_FEE = Decimal('10.00')


def _normalize_neighborhood(value: str | None) -> str:
    normalized = unicodedata.normalize('NFKD', (value or '').strip().upper())
    return ''.join(ch for ch in normalized if not unicodedata.combining(ch))


def _coerce_decimal(value, default: Decimal) -> Decimal:
    try:
        return Decimal(str(value))
    except Exception:
        return default


def _build_fee_table(config=None):
    rules = getattr(config, 'delivery_fee_rules', None) if config is not None else None
    if rules is None:
        return DEFAULT_FEE_TABLE.copy()
    if not isinstance(rules, list):
        return DEFAULT_FEE_TABLE.copy()
    if not rules:
        return {}

    table = {}
    for rule in rules:
        if not isinstance(rule, dict):
            continue
        label = _normalize_neighborhood(rule.get('label') or rule.get('neighborhood'))
        if not label:
            continue
        table[label] = _coerce_decimal(rule.get('fee'), DEFAULT_FEE)
    return table or DEFAULT_FEE_TABLE.copy()

def get_address_from_cep(cep: str):
    """
    Fetches address info from ViaCEP.
    """
    clean_cep = "".join(filter(str.isdigit, cep or ""))
    if len(clean_cep) != 8:
        return None
    
    url = f"https://viacep.com.br/ws/{clean_cep}/json/"
    try:
        response = requests.get(url, timeout=5)
        if response.status_code == 200:
            data = response.json()
            if "erro" not in data:
                return data
    except Exception as e:
        logger.error(f"Error fetching CEP {cep}: {e}")
    return None

def calculate_delivery_fee(neighborhood: str, config=None):
    """
    Calculates delivery fee based on neighborhood name.
    """
    default_fee = _coerce_decimal(getattr(config, 'delivery_fee_default', DEFAULT_FEE), DEFAULT_FEE)
    fee_table = _build_fee_table(config)
    if not neighborhood:
        return default_fee

    normalized = _normalize_neighborhood(neighborhood)
    return fee_table.get(normalized, default_fee)
