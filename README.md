# sorveteria-pos

Monorepo do sistema de PDV/gestao offline-first da sorveteria:
- `backend`: Django + DRF + Channels
- `frontend`: React + Vite + PWA
- `agent`: FastAPI para impressao termica e balanca serial

## Deploy em maquina nova (producao)

### 1) Pre-requisitos
- Docker Desktop 4.x+ (Windows) ou Docker Engine + Compose Plugin (Linux)
- DNS apontando para a maquina:
- `api.seudominio.com`
- `app.seudominio.com`
- Banco gerenciado (Postgres)
- Redis gerenciado

### 2) Preparar arquivos de ambiente
No diretorio raiz `sorveteria-pos`:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/prepare_prod.ps1
```

Isso cria:
- `.env.prod`
- `backend/.env.production`

Observacao: o compose de producao usa `.env.prod` na raiz e `backend/.env.production`. O arquivo `backend/.env.prod` nao faz parte desse fluxo.

### 3) Preencher variaveis
Edite `.env.prod`:
- `API_DOMAIN`
- `APP_DOMAIN`
- `VITE_API_URL`
- `VITE_WS_URL`

Edite `backend/.env.production`:
- `DJANGO_SECRET_KEY`
- `DJANGO_ALLOWED_HOSTS`
- `DJANGO_CSRF_TRUSTED_ORIGINS`
- `DATABASE_URL`
- `REDIS_URL`

Importante: se a senha do banco tiver caracteres especiais (`@`, `:`, `/`, `?`, `#`), use senha URL-encoded na `DATABASE_URL`.

Use na `.env.prod` os dominios reais publicados. Nao deixe `localhost` em `VITE_API_URL` ou `VITE_WS_URL` quando o app estiver sendo acessado por um dominio externo.

### 4) Subir stack

```powershell
powershell -ExecutionPolicy Bypass -File scripts/deploy_prod.ps1
```

Esse script:
- sobe o compose de producao
- roda migrations automaticas (entrypoint do backend)
- testa `/health`
- roda smoke test basico (pode usar `-SkipSmoke` para pular)

### 5) Verificar
- Backend health: `http://127.0.0.1:8000/health`
- App: `https://app.seudominio.com`
- API: `https://api.seudominio.com/health`
- Se abrir o app por `APP_DOMAIN`, as rotas `/api` e `/ws` passam pelo Caddy para o backend.

## Operacao diaria

### Logs
```powershell
docker compose --env-file .env.prod -f docker-compose.prod.yml logs -f backend
docker compose --env-file .env.prod -f docker-compose.prod.yml logs -f caddy
```

### Reiniciar
```powershell
docker compose --env-file .env.prod -f docker-compose.prod.yml restart
```

### Atualizar versao
```powershell
git pull
powershell -ExecutionPolicy Bypass -File scripts/deploy_prod.ps1
```

## Backups
- Container `backups` roda `pg_dump` periodico.
- Arquivos ficam no volume `db_backups`.
- Intervalo e retencao configurados em `.env.prod`:
- `BACKUP_INTERVAL_HOURS`
- `BACKUP_RETENTION_DAYS`

## Rodar local com Docker

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start_local.ps1
```

Esse fluxo:
- sobe `backend`, `postgres`, `redis`, `frontend`, `caddy` e `backups`
- roda migrations
- valida `http://localhost:8000`
- valida `http://localhost:8001/health`

## Agent local (impressora e balanca)

No computador da loja (onde estao impressora e balanca):

```powershell
cd agent
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Health do agent: `http://127.0.0.1:9876/health`

## Backend local

Padrao atual da virtualenv do backend: `backend/.venv`.
Se existir `backend/venv`, trate como legado e prefira remover para evitar instalar dependencias em ambiente duplicado.
