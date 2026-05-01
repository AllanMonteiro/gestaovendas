# Problemas comuns de ORM (e como corrigir)

## ❌ N+1 Query (RUIM)
for pedido in Pedido.objects.all():
    print(pedido.cliente.nome)

## ✅ Correto
pedidos = Pedido.objects.select_related('cliente')

---

## ❌ ManyToMany sem prefetch
for pedido in pedidos:
    for item in pedido.itens.all():
        print(item.nome)

## ✅ Correto
pedidos = Pedido.objects.prefetch_related('itens')

---

## ❌ Buscar tudo (pesado)
Pedido.objects.all()

## ✅ Melhor
Pedido.objects.only("id", "total", "status")

---

## ❌ Sem limite
Pedido.objects.filter(status="aberto")

## ✅ Melhor
Pedido.objects.filter(status="aberto")[:50]
