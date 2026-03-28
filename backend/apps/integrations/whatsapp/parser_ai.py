import re
from apps.core.integrations.ai_client import AIClient


def simple_parse_order(text: str) -> dict:
    """
    Standard Regex-based extraction for structured WhatsApp messages.
    """
    data = {
        "customer_name": None,
        "address": None,
        "cep": None,
        "payment_method": None,
        "notes": None,
        "items": [],
    }

    name_patterns = [
        r"nome\s*[:\-]\s*(.+)",
        r"meu nome é\s+(.+)",
    ]
    address_patterns = [
        r"endereco\s*[:\-]\s*(.+)",
        r"endereço\s*[:\-]\s*(.+)",
        r"entregar em\s+(.+)",
    ]
    cep_patterns = [
        r"cep\s*[:\-]\s*(\d{5}-?\d{3}|\d{8})",
    ]
    payment_patterns = [
        r"pagamento\s*[:\-]\s*(.+)",
        r"vou pagar (?:no|na|com)\s+(.+)",
    ]

    for pattern in name_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            data["customer_name"] = match.group(1).strip()
            break

    for pattern in address_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            data["address"] = match.group(1).strip()
            break

    for pattern in cep_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            data["cep"] = match.group(1).replace("-", "").strip()
            break

    for pattern in payment_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            data["payment_method"] = match.group(1).strip()
            break

    for line in text.splitlines():
        line = line.strip()
        match = re.match(r"[-*]?\s*(\d+)\s+(.+)", line)
        if match:
            data["items"].append({
                "product_name": match.group(2).strip(),
                "quantity": int(match.group(1)),
            })

    return data


def validate_order_data(data: dict) -> dict:
    """
    Cleans and validates the parsed JSON data.
    """
    if not isinstance(data, dict):
        return {
            "customer_name": None,
            "address": None,
            "cep": None,
            "payment_method": None,
            "notes": None,
            "items": [],
        }

    items = []
    raw_items = data.get("items", []) or []

    for item in raw_items:
        if not isinstance(item, dict):
            continue

        product_name = (item.get("product_name") or "").strip()
        quantity = item.get("quantity") or 1

        try:
            quantity = int(quantity)
        except Exception:
            quantity = 1

        if quantity < 1:
            quantity = 1

        if product_name:
            items.append({
                "product_name": product_name,
                "quantity": quantity,
            })

    return {
        "customer_name": data.get("customer_name"),
        "address": data.get("address"),
        "cep": data.get("cep"),
        "payment_method": data.get("payment_method"),
        "notes": data.get("notes"),
        "items": items,
    }


def parse_order_with_ai(text: str) -> dict:
    """
    Uses AIClient to extract order from complex natural language.
    """
    client = AIClient()
    ai_data = client.extract_order(text)
    return validate_order_data(ai_data)


def parse_order_hybrid(text: str) -> dict:
    """
    Hybrid logic: try Regex first. If critical fields (address/items) are 
    missing or the message is loosely structured, fallback to AI.
    """
    basic = validate_order_data(simple_parse_order(text))

    # If we have name, address AND items, it's likely a structured standard message
    if basic["customer_name"] and basic["address"] and basic["items"] and "Nome:" in text:
        return basic

    try:
        # Fallback to AI for complex strings
        ai_data = parse_order_with_ai(text)
        if ai_data and ai_data["items"]:
            return ai_data
    except Exception:
        pass
        
    return basic
