from decimal import Decimal
import logging
from apps.orders.models import Order, OrderItem
from apps.catalog.models import ProductPrice
from apps.catalog.services.product_matcher import find_product_by_name
from apps.sales.services import get_store_config
from apps.integrations.viacep_service import get_address_from_cep, calculate_delivery_fee
from apps.integrations.pix_service import generate_static_pix

logger = logging.getLogger(__name__)


def resolve_product_price(product) -> Decimal:
    if product is None:
        return Decimal("0.00")

    price = ProductPrice.objects.filter(product=product).order_by("store_id").first()
    if price is not None:
        return Decimal(price.price)

    if product.category_id and product.category.price is not None:
        return Decimal(product.category.price)

    return Decimal("0.00")

def create_delivery_order_from_parsed(phone: str, parsed: dict) -> Order:
    """
    Creates a full Professional Order record from the parsed WhatsApp JSON. 
    Handles product mapping, subtotal, delivery fee, and PIX.
    """
    subtotal = Decimal("0.00")
    item_details = []
    
    # Matching Item with Catalog Product
    for item in parsed.get("items", []) or []:
        name = item.get("product_name") or "Item"
        qty = Decimal(str(item.get("quantity") or 1))
        
        # Professional Fuzzy Search (difflib)
        product = find_product_by_name(name)
        price = resolve_product_price(product)
        
        subtotal += price * qty
        item_details.append({
            "product_name": product.name if product else name,
            "quantity": int(qty),
        })

    # Logistics Enrichment
    cep = parsed.get("cep")
    neighborhood = parsed.get("neighborhood")
    delivery_fee = Decimal("0.00")
    
    if cep:
        cep_data = get_address_from_cep(cep)
        if cep_data:
            neighborhood = cep_data.get("bairro", neighborhood)
            delivery_fee = calculate_delivery_fee(neighborhood)
            
    total = subtotal + delivery_fee
    
    # PIX Generation Logic
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
        customer_name=parsed.get("customer_name") or "Cliente WhatsApp",
        customer_phone=phone,
        address=parsed.get("address") or "Não Informado",
        cep=cep,
        neighborhood=neighborhood,
        delivery_fee=delivery_fee,
        subtotal=subtotal,
        payment_method=parsed.get("payment_method"),
        notes=parsed.get("notes"),
        source="whatsapp",
        order_type="delivery",
        status="novo",
        total=total,
        pix_payload=pix_payload
    )

    # Persist Items
    for d in item_details:
        OrderItem.objects.create(order=order, **d)

    return order
