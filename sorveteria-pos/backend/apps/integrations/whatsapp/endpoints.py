from rest_framework.decorators import api_view
from rest_framework.response import Response
from .parser_ai import parse_order_hybrid
from .services_ai import create_delivery_order_from_parsed
from .client import WhatsAppClient


def _customer_name(order):
    meta = getattr(order, 'delivery_meta', None)
    if meta and meta.customer_name:
        return meta.customer_name
    customer = getattr(order, 'customer', None)
    return getattr(customer, 'name', None)


@api_view(['POST'])
def manual_parse_order(request):
    """
    Takes raw text from clipboard and processes it using the AI Parser.
    Returns the created order ID.
    """
    text = request.data.get('text')
    if not text:
        return Response({"error": "No text provided"}, status=400)

    try:
        # User Professional AI Parser
        parsed = parse_order_hybrid(text)
        
        if not parsed.get('items'):
            return Response({"error": "Could not identify items in message"}, status=400)

        # Create the order with all logic (PIX, Fee, Catalog Match)
        order = create_delivery_order_from_parsed(phone="manual", parsed=parsed)
        
        # Optional: Send confirmation if phone was identified
        if parsed.get('customer_phone'):
            client = WhatsAppClient()
            if client.is_configured():
                client.send_order_confirmation(order)

        return Response({
            "ok": True, 
            "order_id": str(order.id),
            "customer_name": _customer_name(order),
            "total": str(order.total)
        })
    except Exception as e:
        return Response({"error": str(e)}, status=500)
