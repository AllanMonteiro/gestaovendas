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
