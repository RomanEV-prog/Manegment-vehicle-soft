# eVersum Vehicle Compliance & Tracking System

Centraliziran sistem za sledenje celotnega življenjskega cikla programske opreme vozila — od tovarniške inicializacije do zadnje SW posodobitve pred razgradnjo. Skladen z uredbama **UNECE R155** in **UNECE R156**.

---

## Hiter zagon

### Zahteve
- Docker Desktop 24+
- Node.js 20+ (za lokalni frontend razvoj)
- Python 3.12+ (za lokalni backend razvoj)

### 1. Kloniraj in nastavi `.env`

```bash
cp .env.example .env
# Uredi .env (SECRET_KEY, SMTP nastavitve, ...)
```

### 2. Zaženi vse z enim ukazom

```bash
make setup
```

Ta ukaz:
1. Zažene Docker Compose (PostgreSQL, Redis, MinIO, API, Frontend)
2. Zažene Alembic migracije (ustvari vse tabele)
3. Seed-a testne podatke (4 vozila, 3 uporabniki)

### Dostop

| Storitev | URL | Opis |
|----------|-----|------|
| Frontend | http://localhost:3001 | Next.js dashboard (3000 zaseda Roman's Cake ERP) |
| API docs | http://localhost:8000/docs | FastAPI Swagger |
| MinIO console | http://localhost:9001 | Upravljanje datotek |
| PostgreSQL | localhost:5432 | DB: eversum_db, uporabnik eversum / secret |
| Redis | localhost:6379 | Event bus + cache |

### Testni uporabniki (po seed-u)

| E-pošta | Geslo | Vloga |
|---------|-------|-------|
| h.postl@eversum.com | admin1234 | admin |
| m.hrelja@eversum.com | admin1234 | qc_manager |
| r.adler@eversum.com | admin1234 | technician |

> Vir resnice je `backend/app/scripts/seed.py` — če se tam spremeni, popravi tudi to tabelo.

---

## Arhitektura

```
eVersum/
├── backend/                  # Python FastAPI backend
│   ├── app/
│   │   ├── api/v1/          # 16 REST API routerjev
│   │   ├── models/          # SQLAlchemy ORM (15 tabel)
│   │   ├── schemas/         # Pydantic validacija
│   │   ├── services/        # Report, alarm, photo servisi
│   │   ├── workers/         # Celery tasks + Redis Streams
│   │   ├── middleware/      # JWT tenant middleware
│   │   └── utils/           # Security, storage, audit
│   ├── migrations/          # Alembic migracije
│   └── tests/               # pytest testi
├── frontend/                 # Next.js 14 frontend
│   └── src/
│       ├── app/(dashboard)/ # Strani: vozila, DTC, alarmi...
│       ├── components/      # React komponente
│       ├── hooks/           # Zustand store, WebSocket
│       └── lib/             # API client, utils
├── docker-compose.yml        # Razvojna okolica
├── docker-compose.prod.yml   # Produkcija (Caddy TLS)
├── Caddyfile                 # Reverse proxy
└── Makefile                  # Ukazi za zagon
```

## Ključne funkcionalnosti

### Digital Twin (`vehicle_twins`)
Vsako vozilo ima živ JSONB objekt z:
- `ecu_config` — verzije vseh ECU modulov
- `hom_status` — status homologacij po uredbah
- `active_dtcs` — seznam aktivnih diagnostičnih napak

Twin se samodejno posodablja ob vsaki SW posodobitvi, DTC zapisu in servisu.

### RXSWIN (UNECE R156 §7.2)
Vsaka SW posodobitev zahteva identifikator formata:
```
RXSWIN-{OEM}-{REG}-{MODULE}-{VERSION}
Primer: RXSWIN-EVS-R156-MCU-20241001
```

### Twin Snapshots (UNECE R156 §7.4)
Nepremljive kopije stanja vozila — audit trail za regulatorne inšpektorje.

### Alarm Engine
- **Event-driven**: DTC visoke resnosti → takojšen email + WebSocket
- **Scheduled**: Dnevni Celery Beat (7:00) → preveri roke, sistemske DTC, zamujena opravila

### SUMS PDF Report
Jinja2 → WeasyPrint PDF, pokriva R156 §7.1, §7.1.2, §7.2, §7.4.

---

## Razvoj

```bash
# Backend lokalno
cd backend
pip install -r requirements-dev.txt
uvicorn app.main:app --reload

# Frontend lokalno
cd frontend
npm install --legacy-peer-deps
npm run dev

# Testi
make test

# Linting
make lint && make format
```

## Produkcija

```bash
# Nastavi domeno v Caddyfile (api.eversum.com, app.eversum.com)
make prod
```

Caddy samodejno pridobi Let's Encrypt TLS certifikat.

---

## Tech stack

| Plast | Tehnologija |
|-------|-------------|
| API | FastAPI 0.111 + Python 3.12 |
| ORM | SQLAlchemy 2.0 async + asyncpg |
| Migracije | Alembic |
| Validacija | Pydantic v2 |
| Workers | Celery 5 + Redis Streams |
| Baza | PostgreSQL 16 + JSONB |
| Shranjevanje | MinIO (S3-compatible) |
| Frontend | Next.js 14 + TanStack Query |
| Stanje | Zustand |
| Proxy | Caddy v2 (avtomatski TLS) |
| CI/CD | GitHub Actions |

---

*eVersum © 2025 — UNECE R155/R156 Compliance System*
