import base64
import binascii
import uuid
from decimal import Decimal, ROUND_HALF_UP, ROUND_FLOOR
from pathlib import Path
from django.db import transaction, models
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.utils import timezone
from apps.catalog.models import Product, ProductPrice
from apps.sales.models import Order, OrderItem, Payment, CashSession, CashMove, StoreConfig
from apps.kitchen.models import KitchenTicket
from apps.audit.utils import log_audit
from apps.accounts.permissions import user_has_permission


def q2(value: Decimal) -> Decimal:
    return value.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def to_points(value: Decimal) -> int:
    return int(value.quantize(Decimal('1'), rounding=ROUND_HALF_UP))


def resolve_effective_user(user):
    if user is not None and getattr(user, 'is_authenticated', False):
        return user
    User = get_user_model()
    existing = User.objects.filter(is_active=True).order_by('id').first()
    if existing:
        return existing
    return User.objects.create_user(
        email='local@pdv.local',
        password=None,
        name='Operador Local',
        is_staff=True,
    )


def _save_data_url_asset(data_url: str, prefix: str) -> str:
    if not isinstance(data_url, str) or not data_url.startswith('data:image/'):
        return data_url
    try:
        header, encoded = data_url.split(',', 1)
    except ValueError:
        return data_url
    extension = 'png'
    if ';base64' in header:
        mime_type = header.split(';', 1)[0]
        extension = mime_type.split('/', 1)[-1] or extension
    try:
        binary = base64.b64decode(encoded)
    except (ValueError, binascii.Error):
        return data_url
    safe_extension = Path(f'image.{extension}').suffix or '.png'
    filename = f'store-config/{prefix}-{uuid.uuid4().hex}{safe_extension}'
    saved_name = default_storage.save(filename, ContentFile(binary))
    return default_storage.url(saved_name)


def normalize_store_config_assets(config: StoreConfig) -> StoreConfig:
    changed_fields: list[str] = []

    if config.logo_url and isinstance(config.logo_url, str) and config.logo_url.startswith('data:image/'):
        config.logo_url = _save_data_url_asset(config.logo_url, 'logo')
        changed_fields.append('logo_url')

    if isinstance(config.category_images, dict):
        normalized_images = {}
        changed = False
        for key, value in config.category_images.items():
            if isinstance(value, str) and value.startswith('data:image/'):
                normalized_images[key] = _save_data_url_asset(value, f'category-{key}')
                changed = True
            else:
                normalized_images[key] = value
        if changed:
            config.category_images = normalized_images
            changed_fields.append('category_images')

    if changed_fields:
        config.save(update_fields=changed_fields)

    return config


def get_store_config() -> StoreConfig:
    config, _ = StoreConfig.objects.get_or_create(id=1, defaults={
        'printer': {},
        'scale': {},
        'category_images': {},
        'receipt_header_lines': [],
        'receipt_footer_lines': [],
        'delivery_fee_default': Decimal('10.00'),
        'delivery_fee_rules': StoreConfig._meta.get_field('delivery_fee_rules').get_default(),
    })
    return normalize_store_config_assets(config)


def ensure_open_cash_session() -> CashSession:
    session = CashSession.objects.filter(status=CashSession.STATUS_OPEN).first()
    if not session:
        raise ValueError('Caixa fechado. Abra o caixa antes de operar pedidos.')
    return session


def allocate_order_sequence() -> tuple:
    business_date = timezone.localdate()
    current_max = (
        Order.objects.select_for_update()
        .filter(business_date=business_date)
        .aggregate(max_daily_number=models.Max('daily_number'))['max_daily_number']
        or 0
    )
    return business_date, current_max + 1


@transaction.atomic
def create_order_idempotent(*, order_type: str, table_label: str | None, customer=None, client_request_id=None) -> Order:
    if client_request_id:
        existing = Order.objects.filter(client_request_id=client_request_id).first()
        if existing:
            return existing
    ensure_open_cash_session()
    business_date, daily_number = allocate_order_sequence()
    order = Order.objects.create(
        business_date=business_date,
        daily_number=daily_number,
        type=order_type,
        table_label=table_label,
        customer=customer,
        client_request_id=client_request_id,
    )
    return order


@transaction.atomic
def add_item(
    *,
    order: Order,
    product_id: int,
    qty: Decimal,
    weight_grams: int | None,
    notes: str | None,
    client_request_id=None,
) -> OrderItem:
    if client_request_id:
        existing = OrderItem.objects.select_related('product').filter(client_request_id=client_request_id).first()
        if existing:
            return existing
    ensure_open_cash_session()
    if qty <= 0:
        raise ValueError('qty must be > 0')
    if order.status in [Order.STATUS_PAID, Order.STATUS_CANCELED]:
        raise ValueError('Order is already finalized')
    product_name = None
    price = ProductPrice.objects.select_related('product').only('price', 'product__id', 'product__name').filter(product_id=product_id).first()
    if price:
        unit_price = price.price
        if getattr(price, 'product', None) is not None:
            product_name = price.product.name
    else:
        try:
            product = Product.objects.select_related('category').only('id', 'name', 'category__price').get(id=product_id)
        except Product.DoesNotExist:
            raise ValueError(f'Produto {product_id} não encontrado.')
        product_name = product.name
        if product.category.price:
            unit_price = product.category.price
        else:
            raise ValueError('Preço não encontrado para este produto ou sua categoria.')
    total = q2(Decimal(qty) * unit_price)
    item = OrderItem.objects.create(
        order=order,
        product_id=product_id,
        qty=qty,
        weight_grams=weight_grams,
        unit_price=unit_price,
        total=total,
        notes=notes,
        client_request_id=client_request_id,
    )
    increment_order_totals(order, subtotal_delta=total)
    if product_name:
        item.product = Product(id=product_id, name=product_name)
    return item


def recalc_order_totals(order: Order) -> None:
    subtotal = order.items.aggregate(total=models.Sum('total'))['total']
    subtotal = subtotal or Decimal('0')
    order.subtotal = q2(subtotal)
    order.total = q2(order.subtotal - order.discount)
    order.save(update_fields=['subtotal', 'total'])


def increment_order_totals(order: Order, *, subtotal_delta: Decimal, total_delta: Decimal | None = None) -> None:
    subtotal_delta = q2(Decimal(subtotal_delta))
    total_delta = subtotal_delta if total_delta is None else q2(Decimal(total_delta))
    Order.objects.filter(pk=order.pk).update(
        subtotal=models.F('subtotal') + subtotal_delta,
        total=models.F('total') + total_delta,
    )
    order.subtotal = q2((order.subtotal or Decimal('0')) + subtotal_delta)
    order.total = q2((order.total or Decimal('0')) + total_delta)


@transaction.atomic
def close_order(
    *,
    order: Order,
    discount: Decimal,
    payments: list[dict],
    use_loyalty_points: bool,
    points_to_redeem: int | None = None,
    client_request_id=None,
    user=None,
):
    ensure_open_cash_session()
    if client_request_id:
        existing = Order.objects.filter(client_request_id=client_request_id).first()
        if existing and existing.status == Order.STATUS_PAID:
            return existing
    if order.status == Order.STATUS_CANCELED:
        raise ValueError('Canceled order cannot be closed')
    if order.status == Order.STATUS_PAID:
        return order
    config = get_store_config()
    if discount and order.subtotal > 0:
        discount_pct = (Decimal(discount) / order.subtotal) * Decimal('100')
        if discount_pct > config.max_discount_pct:
            if not user_has_permission(user, 'order.discount.override'):
                raise PermissionError('Discount above limit')
    if discount < 0:
        raise ValueError('discount cannot be negative')
    if discount > order.subtotal:
        raise ValueError('discount cannot be greater than subtotal')
    loyalty_points_used = 0
    loyalty_discount = Decimal('0')
    loyalty_account = None
    if use_loyalty_points:
        if not order.customer_id:
            raise ValueError('Order customer required for loyalty redemption')
        from apps.loyalty.models import LoyaltyAccount

        loyalty_account, _ = LoyaltyAccount.objects.get_or_create(customer=order.customer)
        try:
            requested_points = int(points_to_redeem or 0)
        except (TypeError, ValueError):
            raise ValueError('points_to_redeem invalid')
        min_redeem_points = int(config.min_redeem_points or 0)
        point_value = Decimal(str(config.point_value_real or '0'))
        if point_value <= 0:
            raise ValueError('point_value_real must be configured and > 0')
        max_discount_base = q2(order.subtotal - Decimal(discount))
        if max_discount_base <= 0:
            raise ValueError('Order total does not allow loyalty redemption')
        max_points_for_order = int((max_discount_base / point_value).to_integral_value(rounding=ROUND_FLOOR))
        if max_points_for_order <= 0 or loyalty_account.points_balance <= 0:
            raise ValueError('Insufficient loyalty points')
        if requested_points <= 0:
            # Se nao vier quantidade explicita, aplica o maximo possivel do pedido em aberto.
            requested_points = min(loyalty_account.points_balance, max_points_for_order)
        if requested_points > loyalty_account.points_balance:
            raise ValueError('Insufficient loyalty points')
        if requested_points < min_redeem_points:
            raise ValueError(f'Minimum points to redeem is {min_redeem_points}')
        loyalty_points_used = min(requested_points, max_points_for_order)
        if loyalty_points_used <= 0:
            raise ValueError('Unable to apply points to this order total')
        if loyalty_points_used < min_redeem_points:
            raise ValueError(f'Minimum points to redeem is {min_redeem_points}')
        loyalty_discount = q2(Decimal(loyalty_points_used) * point_value)

    order.discount = q2(Decimal(discount) + loyalty_discount)
    order.total = q2(order.subtotal - order.discount)
    if order.total < 0:
        raise ValueError('Order total cannot be negative')
    if order.total > 0 and not payments:
        raise ValueError('At least one payment is required')

    payment_total = Decimal('0')
    allowed_methods = {
        Payment.METHOD_CASH,
        Payment.METHOD_PIX,
        Payment.METHOD_CARD,
    }
    if order.total > 0:
        for pay in payments:
            method = pay.get('method')
            if method not in allowed_methods:
                raise ValueError('Invalid payment method')
            amount = Decimal(str(pay.get('amount', '0')))
            if amount <= 0:
                raise ValueError('Payment amount must be > 0')
            payment_total += amount
    elif payments:
        for pay in payments:
            amount = Decimal(str(pay.get('amount', '0')))
            payment_total += amount

    if q2(payment_total) != order.total:
        raise ValueError('Payment sum must match order total')

    order.status = Order.STATUS_PAID
    order.closed_at = timezone.now()
    order.client_request_id = client_request_id or order.client_request_id
    order.save()
    Payment.objects.filter(order=order).delete()
    for pay in payments:
        amount = Decimal(str(pay.get('amount', '0')))
        if amount <= 0:
            continue
        Payment.objects.create(order=order, method=pay['method'], amount=amount, meta=pay.get('meta'))
        
    from apps.catalog.models import Product as CatalogProduct
    from django.db.models import F as DbF
    for item in order.items.all():
        CatalogProduct.objects.filter(id=item.product_id, stock__isnull=False).update(
            stock=DbF('stock') - Decimal(str(item.qty))
        )

    log_audit(user=user, action='order.close', entity='order', entity_id=order.id, after={'total': str(order.total)})

    if loyalty_points_used > 0 and loyalty_account is not None:
        from apps.loyalty.models import LoyaltyMove

        existing_redeem = LoyaltyMove.objects.filter(order=order, type=LoyaltyMove.TYPE_REDEEM).first()
        if not existing_redeem:
            from apps.loyalty.models import LoyaltyAccount as _LA
            _LA.objects.filter(id=loyalty_account.id).update(points_balance=DbF('points_balance') - loyalty_points_used)
            LoyaltyMove.objects.create(
                customer=order.customer,
                points=-loyalty_points_used,
                type=LoyaltyMove.TYPE_REDEEM,
                reason='Resgate aplicado no fechamento do pedido',
                order=order,
            )

    if order.customer_id and loyalty_points_used == 0:
        from apps.loyalty.models import LoyaltyAccount, LoyaltyMove

        points_per_real = max(int(config.points_per_real or 0), 0)
        earned_points = to_points(order.total * Decimal(points_per_real))
        if earned_points > 0:
            existing_move = LoyaltyMove.objects.filter(order=order, type=LoyaltyMove.TYPE_EARN).first()
            if not existing_move:
                account, _ = LoyaltyAccount.objects.get_or_create(customer=order.customer)
                LoyaltyAccount.objects.filter(id=account.id).update(points_balance=DbF('points_balance') + earned_points)
                LoyaltyMove.objects.create(
                    customer=order.customer,
                    points=earned_points,
                    type=LoyaltyMove.TYPE_EARN,
                    reason='Pontos por compra no PDV',
                    order=order,
                )

    return order


def _build_adjusted_payment(method_code: str, amount: Decimal) -> dict:
    if method_code == 'CARD_CREDIT':
        return {'method': Payment.METHOD_CARD, 'amount': amount, 'meta': {'card_type': 'CREDIT'}}
    if method_code == 'CARD_DEBIT':
        return {'method': Payment.METHOD_CARD, 'amount': amount, 'meta': {'card_type': 'DEBIT'}}
    if method_code == Payment.METHOD_CASH:
        return {'method': Payment.METHOD_CASH, 'amount': amount, 'meta': None}
    if method_code == Payment.METHOD_PIX:
        return {'method': Payment.METHOD_PIX, 'amount': amount, 'meta': None}
    raise ValueError('Invalid payment method')


@transaction.atomic
def adjust_finalized_sale(*, order: Order, total: Decimal, payment_method: str, closed_at=None, user=None):
    if order.status != Order.STATUS_PAID or order.closed_at is None:
        raise ValueError('Only paid orders can be adjusted')

    adjusted_total = q2(Decimal(total))
    if adjusted_total < 0:
        raise ValueError('Total cannot be negative')
    if adjusted_total > order.subtotal:
        raise ValueError('Total cannot be greater than subtotal')

    previous_total = order.total
    previous_discount = order.discount
    previous_payments = list(
        Payment.objects.filter(order=order).values('method', 'amount', 'meta')
    )

    order.total = adjusted_total
    order.discount = q2(order.subtotal - adjusted_total)
    
    update_fields = ['total', 'discount']
    
    if closed_at is not None:
        order.closed_at = closed_at
        order.business_date = timezone.localdate(closed_at)
        update_fields.extend(['closed_at', 'business_date'])
        
    order.save(update_fields=update_fields)

    Payment.objects.filter(order=order).delete()
    if adjusted_total > 0:
        payment_payload = _build_adjusted_payment(payment_method, adjusted_total)
        Payment.objects.create(
            order=order,
            method=payment_payload['method'],
            amount=payment_payload['amount'],
            meta=payment_payload['meta'],
        )

    log_audit(
        user=user,
        action='order.adjust_finalized_sale',
        entity='order',
        entity_id=order.id,
        before={
            'total': str(previous_total),
            'discount': str(previous_discount),
            'payments': previous_payments,
        },
        after={
            'total': str(order.total),
            'discount': str(order.discount),
            'payments': list(Payment.objects.filter(order=order).values('method', 'amount', 'meta')),
        },
    )
    return order


@transaction.atomic
def cancel_order(*, order: Order, reason: str, user=None):
    ensure_open_cash_session()
    normalized_reason = (reason or '').strip()
    if not normalized_reason:
        raise ValueError('Cancellation reason is required')
    if order.status == Order.STATUS_PAID:
        raise ValueError('Paid order cannot be canceled')
    if order.status == Order.STATUS_CANCELED:
        raise ValueError('Order is already canceled')
    previous_status = order.status
    previous_reason = order.canceled_reason or ''
    order.status = Order.STATUS_CANCELED
    order.canceled_reason = normalized_reason
    order.save(update_fields=['status', 'canceled_reason'])
    log_audit(
        user=user,
        action='order.cancel',
        entity='order',
        entity_id=order.id,
        before={'status': previous_status, 'canceled_reason': previous_reason},
        after={'status': order.status, 'canceled_reason': normalized_reason},
    )
    return order


@transaction.atomic
def send_to_kitchen(*, order: Order):
    ensure_open_cash_session()
    ticket, _ = KitchenTicket.objects.get_or_create(order=order)
    order.status = Order.STATUS_SENT
    order.save(update_fields=['status'])
    ticket.status = KitchenTicket.STATUS_NEW
    ticket.save(update_fields=['status'])
    return ticket


@transaction.atomic
def open_cash(*, user, initial_float: Decimal) -> CashSession:
    effective_user = resolve_effective_user(user)
    session = CashSession.objects.filter(status=CashSession.STATUS_OPEN).first()
    if session:
        raise ValueError(f'Caixa ja aberto com fundo inicial de {session.initial_float}.')
    return CashSession.objects.create(opened_by=effective_user, initial_float=initial_float)


@transaction.atomic
def cash_move(*, user, move_type: str, amount: Decimal, reason: str) -> CashMove:
    effective_user = resolve_effective_user(user)
    session = CashSession.objects.filter(status=CashSession.STATUS_OPEN).first()
    if not session:
        raise ValueError('No open session')
    move = CashMove.objects.create(session=session, type=move_type, amount=amount, reason=reason, user=effective_user)
    log_audit(user=effective_user, action='cash.move', entity='cash_session', entity_id=session.id, after={'type': move_type, 'amount': str(amount)})
    return move


@transaction.atomic
def delete_cash_move(*, move: CashMove, user=None) -> None:
    effective_user = resolve_effective_user(user)
    if move.type not in {CashMove.TYPE_REFORCO, CashMove.TYPE_SANGRIA}:
        raise ValueError('Tipo de movimentacao nao pode ser excluido.')
    if move.session.status != CashSession.STATUS_OPEN:
        raise ValueError('Somente movimentacoes da sessao aberta podem ser excluidas.')

    current_session = CashSession.objects.filter(status=CashSession.STATUS_OPEN).first()
    if current_session is None or move.session_id != current_session.id:
        raise ValueError('Somente movimentacoes da sessao aberta podem ser excluidas.')

    move_id = move.id
    before = {
        'move_id': move.id,
        'type': move.type,
        'amount': str(move.amount),
        'reason': move.reason,
        'user_id': move.user_id,
    }
    move.delete()
    log_audit(
        user=effective_user,
        action='cash.move.delete',
        entity='cash_session',
        entity_id=current_session.id,
        before=before,
        after={'deleted_move_id': move_id},
    )


@transaction.atomic
def close_cash(
    *,
    user,
    counted_cash: Decimal,
    counted_pix: Decimal,
    counted_card: Decimal | None = None,
    counted_card_credit: Decimal | None = None,
    counted_card_debit: Decimal | None = None,
):
    effective_user = resolve_effective_user(user)
    session = CashSession.objects.filter(status=CashSession.STATUS_OPEN).first()
    if not session:
        raise ValueError('No open session')
    has_open_orders = Order.objects.filter(
        status__in=[Order.STATUS_OPEN, Order.STATUS_SENT, Order.STATUS_READY],
    ).exists()
    if has_open_orders:
        raise ValueError('Existem pedidos em aberto. Feche/cancele todos antes de fechar o caixa.')
    session.status = CashSession.STATUS_CLOSED
    session.closed_at = timezone.now()
    session.closed_by = effective_user
    session.save(update_fields=['status', 'closed_at', 'closed_by'])
    totals = Payment.objects.filter(
        order__status=Order.STATUS_PAID,
        order__closed_at__gte=session.opened_at,
        order__closed_at__lte=session.closed_at,
    ).aggregate(
        cash=models.Sum('amount', filter=models.Q(method=Payment.METHOD_CASH)),
        pix=models.Sum('amount', filter=models.Q(method=Payment.METHOD_PIX)),
        card_credit=models.Sum(
            'amount',
            filter=models.Q(method=Payment.METHOD_CARD, meta__card_type='CREDIT'),
        ),
        card_debit=models.Sum(
            'amount',
            filter=models.Q(method=Payment.METHOD_CARD, meta__card_type='DEBIT'),
        ),
        card=models.Sum(
            'amount',
            filter=models.Q(method=Payment.METHOD_CARD),
        ),
    )
    cash_moves = CashMove.objects.filter(session=session).aggregate(
        reforco=models.Sum('amount', filter=models.Q(type=CashMove.TYPE_REFORCO)),
        sangria=models.Sum('amount', filter=models.Q(type=CashMove.TYPE_SANGRIA)),
    )
    cash_sales = totals['cash'] or Decimal('0')
    reforco = cash_moves['reforco'] or Decimal('0')
    sangria = cash_moves['sangria'] or Decimal('0')
    expected_cash = q2(session.initial_float + cash_sales + reforco - sangria)
    expected_pix = totals['pix'] or Decimal('0')
    expected_card_credit = totals['card_credit'] or Decimal('0')
    expected_card_debit = totals['card_debit'] or Decimal('0')
    expected_card = totals['card'] or Decimal('0')
    normalized_counted_card_credit = None if counted_card_credit is None else q2(Decimal(counted_card_credit))
    normalized_counted_card_debit = None if counted_card_debit is None else q2(Decimal(counted_card_debit))
    if counted_card is None:
        counted_card_total = q2((normalized_counted_card_credit or Decimal('0')) + (normalized_counted_card_debit or Decimal('0')))
    else:
        counted_card_total = q2(Decimal(counted_card))
    divergence = {
        'cash': q2(Decimal(counted_cash) - expected_cash),
        'pix': q2(Decimal(counted_pix) - expected_pix),
        'card': q2(counted_card_total - expected_card),
        'card_credit': None if normalized_counted_card_credit is None else q2(normalized_counted_card_credit - expected_card_credit),
        'card_debit': None if normalized_counted_card_debit is None else q2(normalized_counted_card_debit - expected_card_debit),
    }

    reconciliation_data = {
        'expected': {
            'cash': float(expected_cash),
            'pix': float(expected_pix),
            'card_credit': float(expected_card_credit),
            'card_debit': float(expected_card_debit),
            'card': float(expected_card),
        },
        'breakdown': {
            'initial_float': float(session.initial_float),
            'cash_sales': float(cash_sales),
            'reforco': float(reforco),
            'sangria': float(sangria),
        },
        'counted': {
            'cash': float(counted_cash),
            'pix': float(counted_pix),
            'card_credit': None if normalized_counted_card_credit is None else float(normalized_counted_card_credit),
            'card_debit': None if normalized_counted_card_debit is None else float(normalized_counted_card_debit),
            'card': float(counted_card_total),
        },
        'divergence': {
            'cash': float(divergence['cash']),
            'pix': float(divergence['pix']),
            'card_credit': None if divergence['card_credit'] is None else float(divergence['card_credit']),
            'card_debit': None if divergence['card_debit'] is None else float(divergence['card_debit']),
            'card': float(divergence['card']),
        },
    }
    session.reconciliation_data = reconciliation_data
    session.save(update_fields=['reconciliation_data'])

    log_audit(
        user=effective_user,
        action='cash.close',
        entity='cash_session',
        entity_id=session.id,
        after={'divergence': {key: str(value) for key, value in divergence.items()}},
    )
    return reconciliation_data


@transaction.atomic
def reset_sales(*, user):
    from apps.loyalty.models import LoyaltyMove, LoyaltyAccount
    from apps.audit.models import AuditLog

    stock_restore_rows = (
        OrderItem.objects.filter(order__status=Order.STATUS_PAID)
        .values('product_id')
        .annotate(total_qty=models.Sum('qty'))
    )
    for row in stock_restore_rows:
        product_id = row.get('product_id')
        total_qty = row.get('total_qty')
        if product_id and total_qty:
            Product.objects.filter(id=product_id).update(stock=models.F('stock') + total_qty)

    # Deleting Order triggers CASCADE for OrderItem, Payment and KitchenTicket.
    Order.objects.all().delete()
    CashMove.objects.all().delete()
    CashSession.objects.all().delete()
    LoyaltyMove.objects.all().delete()
    LoyaltyAccount.objects.all().update(points_balance=0)
    AuditLog.objects.filter(
        models.Q(entity='order')
        | models.Q(entity='cash_session')
        | models.Q(action='system.reset_sales')
    ).delete()

    log_audit(
        user=resolve_effective_user(user),
        action='system.reset_sales',
        entity='system',
        entity_id='1',
        after={'status': 'cleared'}
    )
    return True
