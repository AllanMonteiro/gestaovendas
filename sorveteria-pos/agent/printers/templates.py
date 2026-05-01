from datetime import datetime
from typing import List


def format_receipt(data: dict, width: int = 42) -> List[str]:
    lines: List[str] = []
    company = data.get('company_name', 'Sorveteria')
    address = data.get('address')
    cnpj = data.get('cnpj')
    title = data.get('title')
    order_id = data.get('order_id', '')
    cashier = data.get('cashier', '')
    now = datetime.now().strftime('%d/%m/%Y %H:%M')

    def center(text: str):
        lines.append(text.center(width))

    center(company)
    if address:
        center(address)
    if cnpj:
        center(f'CNPJ: {cnpj}')
    if title:
        center(str(title))
    for header in data.get('receipt_header_lines', []):
        center(str(header))
    center(now)
    if order_id or cashier:
        center(f'Pedido: {order_id}  Atendente: {cashier}'.strip())
    lines.append('-' * width)

    for detail in data.get('details', []):
        label = str(detail.get('label', '')).strip()
        value = str(detail.get('value', '')).strip()
        if label and value:
            text = f'{label}: {value}'
        else:
            text = label or value
        if text:
            lines.append(text)

    if data.get('details'):
        lines.append('-' * width)

    for item in data.get('items', []):
        name = item.get('name', '')
        qty = item.get('qty', 1)
        unit = item.get('unit_price', 0)
        total = item.get('total', 0)
        if item.get('weight_grams'):
            kg = item['weight_grams'] / 1000
            lines.append(f'{name}')
            lines.append(f'{kg:.3f} kg x R$ {unit:.2f} = R$ {total:.2f}'.rjust(width))
        else:
            lines.append(f'{name}')
            lines.append(f'{qty} x R$ {unit:.2f} = R$ {total:.2f}'.rjust(width))
        if item.get('notes'):
            lines.append(f'  Obs: {item["notes"]}')

    lines.append('-' * width)
    lines.append(f'Subtotal: R$ {data.get("subtotal", 0):.2f}'.rjust(width))
    lines.append(f'Desconto: R$ {data.get("discount", 0):.2f}'.rjust(width))
    lines.append(f'Total: R$ {data.get("total", 0):.2f}'.rjust(width))

    lines.append('-' * width)
    for pay in data.get('payments', []):
        lines.append(f'{pay.get("method")}: R$ {pay.get("amount", 0):.2f}'.rjust(width))
    change = data.get('change')
    if change is not None:
        lines.append(f'Troco: R$ {change:.2f}'.rjust(width))

    loyalty = data.get('loyalty')
    if loyalty:
        lines.append('-' * width)
        lines.append(f'Pontos: {loyalty.get("points")}'.rjust(width))
        lines.append(f'Saldo: {loyalty.get("balance")}'.rjust(width))

    for footer in data.get('receipt_footer_lines', []):
        center(footer)

    lines.append('\n')
    return lines
