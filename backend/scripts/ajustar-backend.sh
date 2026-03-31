#!/usr/bin/env bash
set -e

BASE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$BASE_DIR"

echo "== Ajustando backend Django =="

echo ""
echo "[1/8] Criando pastas úteis..."
mkdir -p apps/core/services
mkdir -p apps/core/integrations
mkdir -p apps/core/prompts
mkdir -p logs
mkdir -p scripts

echo ""
echo "[2/8] Limpando caches Python..."
find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find . -type f -name "*.pyc" -delete 2>/dev/null || true

echo ""
echo "[3/8] Verificando virtualenv duplicada..."
HAS_DOT_VENV=0
HAS_VENV=0

[ -d ".venv" ] && HAS_DOT_VENV=1
[ -d "venv" ] && HAS_VENV=1

if [ "$HAS_DOT_VENV" -eq 1 ] && [ "$HAS_VENV" -eq 1 ]; then
  echo "ATENCAO: existem duas virtualenvs (.venv e venv)."
  echo "Padrao atual do projeto: manter apenas .venv."
elif [ "$HAS_DOT_VENV" -eq 1 ]; then
  echo "OK: virtualenv padrao encontrada em .venv."
elif [ "$HAS_VENV" -eq 1 ]; then
  echo "ATENCAO: apenas ./venv foi encontrada."
  echo "Padrao atual do projeto: migrar para .venv."
fi

echo ""
echo "[4/8] Garantindo .gitignore..."
if [ ! -f ".gitignore" ]; then
  cat > .gitignore <<'EOF'
# Python
__pycache__/
*.py[cod]
*.sqlite3

# Virtualenv
.venv/
venv/

# Env files
.env
.env.*
!.env.example
!.env.production.example

# Logs
logs/
*.log

# Build
staticfiles/
media/

# IDE
.vscode/
.idea/
EOF
else
  grep -qxF '__pycache__/' .gitignore || echo '__pycache__/' >> .gitignore
  grep -qxF '*.py[cod]' .gitignore || echo '*.py[cod]' >> .gitignore
  grep -qxF '.venv/' .gitignore || echo '.venv/' >> .gitignore
  grep -qxF 'venv/' .gitignore || echo 'venv/' >> .gitignore
  grep -qxF '.env' .gitignore || echo '.env' >> .gitignore
  grep -qxF '.env.*' .gitignore || echo '.env.*' >> .gitignore
  grep -qxF '!.env.example' .gitignore || echo '!.env.example' >> .gitignore
  grep -qxF '!.env.production.example' .gitignore || echo '!.env.production.example' >> .gitignore
  grep -qxF 'logs/' .gitignore || echo 'logs/' >> .gitignore
fi

echo ""
echo "[5/8] Garantindo .dockerignore..."
if [ ! -f ".dockerignore" ]; then
  cat > .dockerignore <<'EOF'
__pycache__/
*.pyc
*.pyo
*.pyd
.venv/
venv/
.env
.env.*
.git
.gitignore
.vscode
.idea
logs
EOF
fi

echo ""
echo "[6/8] Criando serviço base para IA..."
cat > apps/core/services/ai_service.py <<'EOF'
class AIService:
    """
    Serviço base para futura integração com IA.
    Troque a implementação por OpenAI, Gemini, Claude, etc.
    """

    def __init__(self, provider=None):
        self.provider = provider or "stub"

    def healthcheck(self):
        return {
            "status": "ok",
            "provider": self.provider,
        }

    def generate(self, prompt: str) -> dict:
        return {
            "provider": self.provider,
            "prompt": prompt,
            "response": "Implementacao de IA ainda nao configurada."
        }
EOF

echo ""
echo "[7/8] Criando integração base..."
cat > apps/core/integrations/ai_client.py <<'EOF'
import os


class AIClient:
    def __init__(self):
        self.api_key = os.getenv("AI_API_KEY")
        self.provider = os.getenv("AI_PROVIDER", "stub")

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def get_provider(self) -> str:
        return self.provider
EOF

echo ""
echo "[8/8] Criando prompt base e checklist..."
cat > apps/core/prompts/system_prompt.txt <<'EOF'
Voce e um assistente interno do sistema.
Responda de forma objetiva.
Priorize contexto de pedidos, produtos, clientes e operacao.
EOF

cat > scripts/check_backend.sh <<'EOF'
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
EOF

chmod +x scripts/check_backend.sh

echo ""
echo "== Concluido =="
