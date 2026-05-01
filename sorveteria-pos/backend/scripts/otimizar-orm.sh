#!/usr/bin/env bash
set -e

BASE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$BASE_DIR"

echo "== Otimizando ORM Django =="

echo ""
echo "[1/6] Criando pasta de services (se nao existir)..."
mkdir -p apps/core/services

echo ""
echo "[2/6] Criando service base para queries..."
cat > apps/core/services/query_service.py <<'EOF'
"""
Boas práticas para queries Django
"""

from django.db.models import QuerySet


class QueryService:

    @staticmethod
    def with_select_related(qs: QuerySet, *fields):
        return qs.select_related(*fields)

    @staticmethod
    def with_prefetch_related(qs: QuerySet, *fields):
        return qs.prefetch_related(*fields)

    @staticmethod
    def only_fields(qs: QuerySet, *fields):
        return qs.only(*fields)

    @staticmethod
    def defer_fields(qs: QuerySet, *fields):
        return qs.defer(*fields)

    @staticmethod
    def paginate(qs: QuerySet, limit=20):
        return qs[:limit]
EOF

echo ""
echo "[3/6] Criando exemplos de otimização..."
cat > apps/core/services/examples_orm.md <<'EOF'
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
EOF

echo ""
echo "[4/6] Adicionando logging de queries lentas..."
SETTINGS_FILE="config/settings/base.py"

if grep -q "django.db.backends" "$SETTINGS_FILE"; then
  echo "Logging de queries ja configurado (possivelmente)"
else
  cat >> "$SETTINGS_FILE" <<'EOF'

# ================================
# LOG DE QUERIES LENTAS
# ================================
LOGGING["loggers"] = {
    "django.db.backends": {
        "handlers": ["console"],
        "level": "WARNING",
    }
}
EOF
fi

echo ""
echo "[5/6] Criando util para debug de queries..."
cat > apps/core/services/query_debug.py <<'EOF'
from django.db import connection
import time


class QueryDebugger:

    @staticmethod
    def log_queries(func):
        def wrapper(*args, **kwargs):
            start = time.time()
            result = func(*args, **kwargs)
            total_time = time.time() - start

            print(f"[QUERY DEBUG] Tempo: {total_time:.3f}s")
            print(f"[QUERY DEBUG] Total queries: {len(connection.queries)}")

            return result

        return wrapper
EOF

echo ""
echo "[6/6] Criando checklist de revisão ORM..."
cat > scripts/check_orm.sh <<'EOF'
#!/usr/bin/env bash
set -e

echo "== Check ORM =="

echo ""
echo "[1] Procurando possivel N+1..."
grep -r ".all()" apps/ | grep "for " || echo "Nenhum padrao obvio encontrado"

echo ""
echo "[2] Procurando falta de limit..."
grep -r "objects.all()" apps/ || echo "OK"

echo ""
echo "[3] Procurando queries pesadas..."
grep -r "select_related" apps/ >/dev/null || echo "ALERTA: select_related pouco usado"
grep -r "prefetch_related" apps/ >/dev/null || echo "ALERTA: prefetch_related pouco usado"

echo ""
echo "Check concluido."
EOF

chmod +x scripts/check_orm.sh

echo ""
echo "== Concluido =="
