#!/usr/bin/env bash
set -e

echo "== Validacao de producao =="

if [ -f ".env.production" ]; then
  echo "[OK] .env.production encontrado"
else
  echo "[ALERTA] .env.production nao encontrado"
fi

if grep -q 'config.settings.production' config/wsgi.py 2>/dev/null; then
  echo "[OK] wsgi.py apontando para producao"
else
  echo "[ALERTA] wsgi.py nao parece apontar para producao"
fi

if grep -q 'config.settings.development' manage.py 2>/dev/null; then
  echo "[OK] manage.py apontando para development"
else
  echo "[ALERTA] manage.py nao parece apontar para development"
fi

if grep -qi '^gunicorn' requirements.txt 2>/dev/null; then
  echo "[OK] gunicorn presente no requirements.txt"
else
  echo "[ALERTA] gunicorn ausente do requirements.txt"
fi

if [ -f "scripts/start_gunicorn.sh" ]; then
  echo "[OK] script start_gunicorn.sh criado"
fi

echo "Validacao concluida."
