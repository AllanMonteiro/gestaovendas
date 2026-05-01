from apps.sales.models import Order as SalesOrder, CashSession, CashMove
from apps.loyalty.models import LoyaltyMove, LoyaltyAccount
from apps.catalog.models import Product

def reset_all():
    print("Iniciando limpeza de dados (Caixa e Vendas)...")
    
    # 1. Deletar vendas do PDV (Sales app)
    # OrderItems e Payments vao por CASCADE
    orders_deleted, _ = SalesOrder.objects.all().delete()
    print(f"Vendas PDV removidas: {orders_deleted}")
    
    # 2. Deletar sessoes de caixa (Sales app)
    # CashMoves vao por CASCADE
    sessions_deleted, _ = CashSession.objects.all().delete()
    print(f"Sessões de caixa removidas: {sessions_deleted}")
    
    # 3. Deletar pedidos de delivery/WhatsApp no dominio atual de vendas
    delivery_deleted, _ = SalesOrder.objects.filter(delivery_meta__isnull=False).delete()
    print(f"Pedidos Delivery/WhatsApp removidos: {delivery_deleted}")

    # 4. Deletar movimentacoes de fidelidade
    loyalty_deleted, _ = LoyaltyMove.objects.all().delete()
    print(f"Movimentações de fidelidade removidas: {loyalty_deleted}")
    
    # 5. Zerar saldos das contas de fidelidade
    accounts_updated = LoyaltyAccount.objects.update(points_balance=0)
    print(f"Saldos de fidelidade zerados em {accounts_updated} contas.")
    
    # 6. (Opcional) Zerar estoque dos produtos?
    # Se o cliente quer zerar TUDO para recomecar, zerar estoque pode ser util.
    products_stock_reset = Product.objects.update(stock=0)
    print(f"Estoque zerado para {products_stock_reset} produtos.")
    
    print("\nSUCESSO: Caixa e Vendas foram limpos.")

if __name__ == "__main__":
    reset_all()
