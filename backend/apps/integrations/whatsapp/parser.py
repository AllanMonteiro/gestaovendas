import re
from apps.core.integrations.ai_client import AIClient

def parse_order(text):
    data = {
        "name": None,
        "address": None,
        "payment": None,
        "items": []
    }

    data["name"] = _extract(text, "Nome")
    data["address"] = _extract(text, "Endereco")
    data["payment"] = _extract(text, "Pagamento")

    # If the regex extraction for name or address failed, or if we have no items, 
    # and it looks like a natural language message, try AI
    if not data["name"] or not data["address"] or "Nome:" not in text:
        ai = AIClient()
        if ai.is_configured():
            ai_data = ai.parse_free_text_order(text)
            if ai_data:
                # Merge AI data with current (AI takes priority for free text)
                data.update(ai_data)
                return data

    for line in text.splitlines():
        # Match "2 x Product Name" or "1 Product Name" or "10-Product Name"
        # Match digits at the start, followed by optional separator and product name
        m = re.match(r"[-*]?\s*(\d+)\s*[-x*]?\s*(.+)", line.strip(), re.IGNORECASE)
        if m:
            data["items"].append({
                "quantity": int(m.group(1)),
                "name": m.group(2).strip()
            })

    return data


def _extract(text, field):
    # Field: Value (greedy till end of line)
    match = re.search(rf"{field}:\s*(.+)", text, re.IGNORECASE)
    return match.group(1).strip() if match else None
