.PHONY: up down dev seed migrate test lint format logs prod prod-build prod-migrate prod-logs prod-down

# ─── Docker ────────────────────────────────────────────────────────────────────
up:
	docker compose up -d

down:
	docker compose down

dev:
	docker compose up --build

prod:
	docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

prod-build:
	docker compose -f docker-compose.yml -f docker-compose.prod.yml build --no-cache api frontend

prod-migrate:
	docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm api alembic upgrade head

prod-logs:
	docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f api

prod-down:
	docker compose -f docker-compose.yml -f docker-compose.prod.yml down

logs:
	docker compose logs -f api

logs-all:
	docker compose logs -f

# ─── Backend ───────────────────────────────────────────────────────────────────
migrate:
	docker compose exec api alembic upgrade head

migrate-create:
	docker compose exec api alembic revision --autogenerate -m "$(msg)"

seed:
	docker compose exec api python -m app.scripts.seed

# ─── Tests ─────────────────────────────────────────────────────────────────────
test:
	cd backend && pytest tests/ -v --cov=app --cov-report=term-missing

test-fast:
	cd backend && pytest tests/ -x -q

# ─── Code quality ──────────────────────────────────────────────────────────────
lint:
	cd backend && ruff check app/

format:
	cd backend && black app/ && ruff check app/ --fix

type-check:
	cd frontend && npm run type-check

# ─── Frontend ──────────────────────────────────────────────────────────────────
frontend-install:
	cd frontend && npm install --legacy-peer-deps

frontend-dev:
	cd frontend && npm run dev

frontend-build:
	cd frontend && npm run build

# ─── Setup ─────────────────────────────────────────────────────────────────────
setup: up
	@echo "Čakam na zagon storitev..."
	@sleep 10
	$(MAKE) migrate
	$(MAKE) seed
	@echo ""
	@echo "✅ eVersum sistem pripravljen!"
	@echo "   API:       http://localhost:8000/docs"
	@echo "   Frontend:  http://localhost:3000"
	@echo "   MinIO:     http://localhost:9001"
	@echo "   Admin:     holger.postl@eversum.eu / EvAdmin2024!"
