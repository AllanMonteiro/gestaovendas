from decimal import Decimal
import logging
import re

from django.db import transaction

from apps.catalog.models import Product, ProductPrice
from apps.catalog.services.product_matcher import find_product_by_name
from apps.integrations.pix_service import generate_static_pix
from apps.integrations.viacep_service import calculate_delivery_fee, get_address_from_cep
from apps.loyalty.models import Customer
from apps.sales.models import DeliveryOrderMeta, Order, OrderItem
from apps.sales.services import allocate_order_sequence, get_store_config, q2

logger = logging.getLogger(__name__)


def resolve_product_price(product) -> Decimal:
    if product is None:
        return Decimal('0.00')

    price = ProductPrice.objects.filter(product=product).order_by('store_id').first()
    if price is not None:
        return Decimal(price.price)

    if product.category_id and product.category.price is not None:
        return Decimal(product.category.price)

    return Decimal('0.00')


def _normalize_phone(value: str | None) -> str:
    return re.sub(r'\D', '', value or '')


def _coerce_quantity(value) -> Decimal:
    try:
        qty = Decimal(str(value or 1))
    except Exception:
        qty = Decimal('1')
    return qty if qty > 0 else Decimal('1')


def _serialize_quantity(qty: Decimal):
    integral_qty = qty.to_integral_value()
    if qty == integral_qty:
        return int(integral_qty)
    return float(qty)


def _resolve_customer(phone: str | None, parsed: dict) -> Customer | None:
    normalized_phone = _normalize_phone(parsed.get('customer_phone') or phone)
    if len(normalized_phone) < 8:
        return None

    customer_name = (parsed.get('customer_name') or '').strip() or None
    neighborhood = (parsed.get('neighborhood') or '').strip() or None
    customer, created = Customer.objects.get_or_create(
        phone=normalized_phone,
        defaults={'name': customer_name, 'neighborhood': neighborhood},
    )
    if created:
        return customer

    fields_to_update = []
    if customer_name and customer.name != customer_name:
        customer.name = customer_name
        fields_to_update.append('name')
    if neighborhood and customer.neighborhood != neighborhood:
        customer.neighborhood = neighborhood
        fields_to_update.append('neighborhood')
    if fields_to_update:
        customer.save(update_fields=fields_to_update)
    return customer


def _resolve_customer_phone(phone: str | None, parsed: dict) -> str | None:
    normalized_phone = _normalize_phone(parsed.get('customer_phone') or phone)
    if normalized_phone:
        return normalized_phone

    raw_phone = (parsed.get('customer_phone') or phone or '').strip()
    if raw_phone.lower() == 'manual':
        return None
    return raw_phone or None


@transaction.atomic
def create_delivery_order_from_parsed(
    phone: str | None,
    parsed: dict,
    *,
    source: str = DeliveryOrderMeta.SOURCE_WHATSAPP,
    default_customer_name: str = 'Cliente Delivery',
) -> Order:
    subtotal = Decimal('0.00')
    raw_items = []
    order_items = []

    for item in parsed.get('items', []) or []:
        name = (item.get('product_name') or item.get('name') or 'Item').strip()
        qty = _coerce_quantity(item.get('quantity'))
        product_id = item.get('product_id')
        product = None
        if product_id not in (None, ''):
            try:
                product = Product.objects.select_related('category').filter(id=int(product_id), active=True).first()
            except (TypeError, ValueError):
                product = None
        if product is None:
            product = find_product_by_name(name)
        unit_price = q2(resolve_product_price(product))
        line_total = q2(unit_price * qty)

        subtotal += line_total
        raw_items.append({
            'product_name': product.name if product else name,
            'quantity': _serialize_quantity(qty),
        })

        if product is not None:
            order_items.append({
                'product': product,
                'qty': qty,
                'unit_price': unit_price,
                'total': line_total,
            })

    cep = parsed.get('cep')
    neighborhood = parsed.get('neighborhood')
    if cep:
        try:
            cep_data = get_address_from_cep(cep)
            if cep_data:
                neighborhood = cep_data.get('bairro', neighborhood)
        except Exception:
            logger.exception('Falha ao consultar CEP para delivery web')
    delivery_fee = q2(Decimal(str(calculate_delivery_fee(neighborhood)))) if neighborhood else Decimal('0.00')
    total = q2(subtotal + delivery_fee)

    pix_payload = None
    config = get_store_config()
    if config.pix_key:
        try:
            pix_payload = generate_static_pix(config.pix_key, float(total), config.store_name, 'Belem')
        except Exception:
            logger.exception('Falha ao gerar PIX do pedido de delivery')

    customer = _resolve_customer(phone, parsed)
    business_date, daily_number = allocate_order_sequence()
    order = Order.objects.create(
        business_date=business_date,
        daily_number=daily_number,
        type=Order.TYPE_DELIVERY,
        status=Order.STATUS_OPEN,
        customer=customer,
        subtotal=q2(subtotal),
        total=total,
    )

    for item_data in order_items:
        OrderItem.objects.create(
            order=order,
            product=item_data['product'],
            qty=item_data['qty'],
            unit_price=item_data['unit_price'],
            total=item_data['total'],
        )

    DeliveryOrderMeta.objects.create(
        order=order,
        customer_name=(parsed.get('customer_name') or '').strip() or (customer.name if customer and customer.name else default_customer_name),
        customer_phone=_resolve_customer_phone(phone, parsed),
        address=(parsed.get('address') or '').strip() or 'Nao informado',
        payment_method=parsed.get('payment_method'),
        notes=parsed.get('notes'),
        cep=cep,
        neighborhood=neighborhood,
        delivery_fee=q2(delivery_fee),
        pix_payload=pix_payload,
        source=source,
        status=DeliveryOrderMeta.STATUS_NEW,
        raw_items=raw_items,
    )

    return (
        Order.objects.select_related('customer', 'delivery_meta')
        .prefetch_related('items__product')
        .get(pk=order.pk)
    )
