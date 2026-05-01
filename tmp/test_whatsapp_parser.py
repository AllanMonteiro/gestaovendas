import re
import sys
import os

# Mock the parser logic to test it without django dependency issues in /tmp
def parse_order(text):
    data = {
        "name": None,
        "address": None,
        "payment": None,
        "items": []
    }

    def _extract(text, field):
        match = re.search(rf"{field}:\s*(.+)", text, re.IGNORECASE)
        return match.group(1).strip() if match else None

    data["name"] = _extract(text, "Nome")
    data["address"] = _extract(text, "Endereco")
    data["payment"] = _extract(text, "Pagamento")

    for line in text.splitlines():
        # Match "2 x Product Name" or "1 Product Name" or "10-Product Name"
        m = re.match(r"[-*]?\s*(\d+)\s*[-x*]?\s*(.+)", line.strip(), re.IGNORECASE)
        if m:
            data["items"].append({
                "quantity": int(m.group(1)),
                "name": m.group(2).strip()
            })

    return data

test_msg = """PEDIDO
Nome: Allan Monteiro
Endereco: Rua X, 123
Itens:
- 2 Açaí 500ml
- 1 Coca-Cola
Pagamento: Pix"""

parsed = parse_order(test_msg)
print(f"Parsed Name: {parsed['name']}")
print(f"Parsed Address: {parsed['address']}")
print(f"Parsed Payment: {parsed['payment']}")
print(f"Items: {parsed['items']}")

assert parsed['name'] == 'Allan Monteiro'
assert parsed['address'] == 'Rua X, 123'
assert parsed['payment'] == 'Pix'
assert len(parsed['items']) == 2
assert parsed['items'][0]['quantity'] == 2
assert parsed['items'][0]['name'] == 'Açaí 500ml'
assert parsed['items'][1]['quantity'] == 1
assert parsed['items'][1]['name'] == 'Coca-Cola'

print("\nSUCCESS: Parser working as expected.")
