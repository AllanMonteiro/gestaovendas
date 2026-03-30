from .services_ai import create_delivery_order_from_parsed


def create_order_from_whatsapp(parsed, phone):
    normalized_items = []
    for item in parsed.get('items', []) or []:
        normalized_items.append({
            'product_name': item.get('product_name') or item.get('name') or 'Item',
            'quantity': item.get('quantity') or 1,
        })

    normalized_payload = {
        'customer_name': parsed.get('customer_name') or parsed.get('name'),
        'customer_phone': parsed.get('customer_phone'),
        'address': parsed.get('address'),
        'cep': parsed.get('cep'),
        'neighborhood': parsed.get('neighborhood'),
        'payment_method': parsed.get('payment_method') or parsed.get('payment'),
        'notes': parsed.get('notes'),
        'items': normalized_items,
    }
    return create_delivery_order_from_parsed(phone=phone, parsed=normalized_payload)
