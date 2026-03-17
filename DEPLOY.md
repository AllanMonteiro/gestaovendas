# Deploy de Producao

## Arquitetura final recomendada

- Frontend: Vercel
- Backend: Render
- Banco de dados: Supabase PostgreSQL
- Redis: opcional

O frontend deste projeto e um app React + Vite estatico. Por isso, a melhor opcao de custo e simplicidade e Vercel no frontend e Render no backend. O `agent/` continua local, apenas na maquina da loja, porque ele conversa com impressora e balanca.

## Estrutura atual

- `backend/`: Django + DRF + Channels
- `frontend/`: React + Vite + PWA
- `agent/`: FastAPI para perifericos locais
- `docker-compose.yml`: ambiente local simples
- `docker-compose.prod.yml`: stack Docker com Caddy, Postgres e Redis
- `render.yaml`: opcional para subir o backend no Render

## Rodar localmente

### Backend com Docker local

```powershell
cd sorveteria-pos
docker compose up -d postgres redis
```

Depois, no backend:

```powershell
cd backend
copy .env.example .env
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py runserver
```

### Frontend local

```powershell
cd frontend
copy .env.example .env
npm install
npm run dev
```

## Variaveis de ambiente obrigatorias

### Backend no Render

- `SECRET_KEY`
- `DEBUG=0`
- `REQUIRE_AUTH=1`
- `ALLOWED_HOSTS`
- `DATABASE_URL`
- `CORS_ALLOWED_ORIGINS`
- `CSRF_TRUSTED_ORIGINS`

### Recomendadas

- `SECURE_SSL_REDIRECT=1`
- `DJANGO_LOG_LEVEL=INFO`
- `WEB_CONCURRENCY=2`
- `REDIS_URL` se quiser Redis externo para Channels

### Frontend na Vercel

- `VITE_API_URL=https://SEU-BACKEND.onrender.com`
- `VITE_WS_URL=wss://SEU-BACKEND.onrender.com`

## Como configurar o Supabase

1. Crie um projeto no Supabase.
2. Abra `Project Settings > Database`.
3. Copie a connection string PostgreSQL.
4. Cole a string no Render na variavel `DATABASE_URL`.

Exemplo:

```text
postgresql://postgres:SENHA@db.xxxxxxxxx.supabase.co:5432/postgres?sslmode=require
```

Se a senha tiver caracteres especiais, use URL encoding.

## Backend no Render

### Opcao 1: via `render.yaml`

1. Suba o projeto para o GitHub.
2. No Render, escolha `New > Blueprint`.
3. Aponte para o repositorio.
4. O serviço `sorveteria-pos-backend` sera criado.
5. Preencha as variaveis obrigatorias.

### Opcao 2: criar manualmente

- Runtime: Python
- Root Directory: `backend`
- Build Command:

```bash
chmod +x render-build.sh render-start.sh && ./render-build.sh
```

- Start Command:

```bash
./render-start.sh
```

- Health Check Path:

```text
/health
```

## Frontend na Vercel

1. Importe o repositorio no Vercel.
2. Defina `frontend` como Root Directory.
3. Framework preset: `Vite`.
4. Build command:

```bash
npm run build
```

5. Output directory:

```text
dist
```

6. Configure:

```text
VITE_API_URL=https://SEU-BACKEND.onrender.com
VITE_WS_URL=wss://SEU-BACKEND.onrender.com
```

O arquivo `frontend/vercel.json` ja inclui rewrite para SPA.

## Frontend no Render

Se preferir manter tudo no Render, crie um `Static Site`:

- Root Directory: `frontend`
- Build Command: `npm ci && npm run build`
- Publish Directory: `dist`
- Env vars:
  - `VITE_API_URL`
  - `VITE_WS_URL`

## Migrations

No deploy do backend, o script `render-start.sh` ja executa:

```bash
python manage.py migrate
```

Para rodar manualmente:

```powershell
cd backend
.\.venv\Scripts\python.exe manage.py migrate
```

## Criar superusuario

```powershell
cd backend
.\.venv\Scripts\python.exe manage.py createsuperuser
```

Observacao: o sistema tambem suporta bootstrap do primeiro administrador pela tela de login.

## Collectstatic

O backend ja esta configurado com `whitenoise`, e o build script executa:

```bash
python manage.py collectstatic --noinput
```

## Testar conexao backend + frontend

1. Abra o frontend publicado.
2. Confirme que o login abre normalmente.
3. Teste `https://SEU-BACKEND.onrender.com/health`.
4. No navegador, confira se as chamadas `/api/...` estao indo para a URL do backend configurada.

## Subir para o GitHub

```powershell
cd sorveteria-pos
git init
git add .
git commit -m "Prepare production deploy"
git branch -M main
git remote add origin SEU_REPOSITORIO_GIT
git push -u origin main
```

## Erros comuns

### `DisallowedHost`

Causa:
- `ALLOWED_HOSTS` incompleto

Correcao:
- adicione o dominio do backend em `ALLOWED_HOSTS`

### `CSRF verification failed`

Causa:
- frontend publicado nao esta em `CSRF_TRUSTED_ORIGINS`

Correcao:
- adicione a URL exata do frontend, incluindo `https://`

### CORS bloqueando requests

Causa:
- frontend nao esta em `CORS_ALLOWED_ORIGINS`

Correcao:
- adicione a URL exata do frontend

### Falha na conexao com Supabase

Causa:
- `DATABASE_URL` incorreta ou sem `sslmode=require`

Correcao:
- revise a string e confirme `sslmode=require`

### WebSocket nao conecta

Causa:
- `VITE_WS_URL` nao configurado

Correcao:
- use `wss://SEU-BACKEND.onrender.com`

### Static files falhando

Causa:
- `collectstatic` nao executou

Correcao:
- garanta que o build command do Render chame `render-build.sh`

## Comandos exatos de deploy

### Backend no Render

Build:

```bash
chmod +x render-build.sh render-start.sh && ./render-build.sh
```

Start:

```bash
./render-start.sh
```

### Frontend na Vercel

```bash
npm run build
```

## Observacoes finais

- O `agent/` nao deve ir para Render nem Vercel.
- Redis externo e opcional para o deploy inicial. Sem Redis, o backend usa `InMemoryChannelLayer`.
- Se quiser WebSocket distribuido ou mais de uma replica do backend, configure `REDIS_URL`.
