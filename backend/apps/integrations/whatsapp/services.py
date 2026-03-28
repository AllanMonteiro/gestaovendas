from apps.orders.models import Order, OrderItem
from apps.catalog.models import Product
from apps.sales.services import get_store_config
from apps.integrations.viacep_service import get_address_from_cep, calculate_delivery_fee
from apps.integrations.pix_service import generate_static_pix
from decimal import Decimal

def create_order_from_whatsapp(parsed, phone):
    # Calculate subtotal and items
    subtotal = Decimal("0.00")
    item_objects = []
    
    for item in parsed.get("items", []):
        name = item["name"]
        qty = Decimal(str(item["quantity"]))
        # Try to find product by name
        product = Product.objects.filter(name__icontains=name).first()
        price = product.price if product else Decimal("0.00")
        subtotal += price * qty
        item_objects.append({
            "product_name": name,
            "quantity": int(qty),
        })

    # Logistics
    cep = parsed.get("cep")
    neighborhood = parsed.get("neighborhood")
    delivery_fee = Decimal("0.00")
    
    if cep:
        cep_data = get_address_from_cep(cep)
        if cep_data:
            neighborhood = cep_data.get("bairro", neighborhood)
            delivery_fee = calculate_delivery_fee(neighborhood)
            
    total = subtotal + delivery_fee
    
    # PIX Generation
    pix_payload = None
    config = get_store_config()
    if config.pix_key:
        pix_payload = generate_static_pix(
            config.pix_key, 
            float(total), 
            config.store_name, 
            "Belem"
        )

    # Order Creation
    order = Order.objects.create(
        customer_name=parsed.get("name") or "Não Informado",
        customer_phone=phone,
        address=parsed.get("address") or "Não Informado",
        cep=cep,
        neighborhood=neighborhood,
        delivery_fee=delivery_fee,
        subtotal=subtotal,
        payment_method=parsed.get("payment"),
        notes=parsed.get("notes"),
        source="whatsapp",
        order_type="delivery",
        status="novo",
        total=total,
        pix_payload=pix_payload
    )

    for item in item_objects:
        OrderItem.objects.create(order=order, **item)

    return order
