import requests
import logging

logger = logging.getLogger(__name__)

# Delivery fees by neighborhood (standardizing common names for simplicity)
FEE_TABLE = {
    "CENTRO": 5.00,
    "BATISTA CAMPOS": 6.00,
    "NAZARE": 6.00,
    "UMARIZAL": 7.00,
    "MARCO": 8.00,
    "PEDREIRA": 8.00,
    "TILEGUA": 10.00,
    "COQUEIRO": 12.00,
    "DEFAULT": 10.00
}

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

def calculate_delivery_fee(neighborhood: str):
    """
    Calculates delivery fee based on neighborhood name.
    """
    if not neighborhood:
        return FEE_TABLE["DEFAULT"]
    
    # Normalize neighborhood for lookup
    normalized = neighborhood.strip().upper()
    return FEE_TABLE.get(normalized, FEE_TABLE["DEFAULT"])
