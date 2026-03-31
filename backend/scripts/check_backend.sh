#!/usr/bin/env bash
set -e

echo "== Check rapido backend =="

[ -f "manage.py" ] && echo "[OK] manage.py encontrado" || echo "[ERRO] manage.py nao encontrado"
[ -f "requirements.txt" ] && echo "[OK] requirements.txt encontrado" || echo "[ERRO] requirements.txt nao encontrado"
[ -d "apps" ] && echo "[OK] pasta apps encontrada" || echo "[ERRO] pasta apps nao encontrada"

if [ -d ".venv" ]; then
  echo "[OK] virtualenv padrao encontrada: .venv"
fi

if [ -d "venv" ]; then
  echo "[ALERTA] existe uma virtualenv legada em ./venv; padrao atual: .venv"
fi

if [ -f ".env.prod" ] && [ -f ".env.production" ]; then
  echo "[ALERTA] existem .env.prod e .env.production; padronize"
fi

echo "Check concluido."
