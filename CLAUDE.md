# eVersum SUMS — navodila za delo

UN R156 Software Update Management System za eVersum (naročnik Jakub Zdun). FastAPI +
PostgreSQL (`backend/`), Next.js 15 / React 19 (`frontend/`), postavitev v `deploy/`.
Mobilna aplikacija in moduli DTC/OBD/VECTO/alarmi so v kodi, a skriti (`frontend/src/lib/modules.ts`).

## Testi in preverjanje

```bash
# testi tečejo v api kontejnerju proti bazi eversum_test (ustvari jo enkrat: CREATE DATABASE eversum_test)
docker compose exec -T -e TEST_DATABASE_URL=postgresql+asyncpg://eversum:secret@db:5432/eversum_test \
  api python -m pytest -q -p no:cacheprovider
cd frontend && npx tsc --noEmit
docker compose exec -T api alembic upgrade head   # migracije vedno dvakrat — drugič mora biti prazno
```

- pytest-asyncio 0.24: vsi testi in fixture tečejo v eni (session) zanki — glej `tests/conftest.py`.
  Baza se med testi prazni s TRUNCATE (endpointi sami commitajo).
- Celery `.delay()` je v testih mockan (autouse fixture) — sicer bi worker pisal v razvojno bazo.

## R156 pravila, ki jih ne smeš zlomiti

- Izdani baseline-i, izdani SU dokumenti, konfiguracije vozil in revizijska sled so zaklenjeni
  **v bazi** (triggerji v `app/models/r156_locks.py`, isti SQL v migracijah). Sprememba = nov
  zapis/revizija, nikoli UPDATE izdanega.
- Nov trigger: SQL v `r156_locks.py` (seznam ukazov — asyncpg ne sprejme več ukazov naenkrat;
  `DDL()` potrebuje `%%` namesto `%`) + migracija, ki ga uporabi.
- Vsako pisanje gre v `write_audit_log` s stanjem pred/po. `id` dobi objekt šele ob `flush()` —
  audit log pred flushom ima `entity_id=None` (500).
- Sprememba vsebine SU dokumenta razveljavi podpis V&V (`_invalidate_vv`).

## Postavitev

- Predogled: Hetzner `eversum-sums` 162.55.183.14 → https://162-55-183-14.sslip.io
  `bash deploy/deploy-server.sh 162.55.183.14` (najprej commit — prenese se `git archive HEAD`).
- `deploy/docker-compose.server.yml` je samostojen, NE override: Compose `ports: []` v overridu
  ne zapre portov iz osnovne datoteke (star `docker-compose.prod.yml` bi izpostavil Postgres).
- `git archive` na Windows (core.autocrlf=true) izvozi CRLF → bash skripte na strežniku ne tečejo.
  Skripta uporablja `git -c core.autocrlf=false archive`; `.gitattributes` vsili LF za .sh/.yml.
- Aplikacija na strežniku teče kot omejena vloga `eversum_app` (`app/scripts/db_roles.py`,
  ob vsakem zagonu); migracije kot lastnik prek `MIGRATION_DATABASE_URL`.
- Uporabniki: `python -m app.scripts.create_user` (naključno geslo), NE `seed.py` (admin1234).
- Next.js rewrite (`/api` → API) se zapeče ob gradnji (build arg `NEXT_PUBLIC_API_URL`).
- Po spremembi `Caddyfile.server` je treba `docker compose ... restart caddy` (bind mount).
- Skrivnosti so samo v `/opt/eversum-sums/deploy/.env.server` na strežniku.

## Pomoč v aplikaciji

- Vsebina pomoči in čarovnika je v `frontend/src/lib/help-content.ts` (EN + SL).
  Imena gumbov v `**zvezdicah**` se morajo ujemati z napisi v `messages/*.json` —
  ob preimenovanju gumba popravi tudi pomoč. Nova stran → dodaj temo in `topicForPath`.

## Dokumentacija

- Stanje projekta, odprte točke za Jakuba in naslednji koraki: `docs/STANJE.md`.

- Priročnik za TÜV: `docs/handbook/build-handbook.js` → `.docx`
  (`NODE_PATH="$(npm root -g)" node docs/handbook/build-handbook.js`; kazalo osveži Word).
  Kar mora potrditi eVersum, je označeno `[TO BE CONFIRMED]` — ne izmišljuj.
  Datoteko za naročnika kopiraj z različico v imenu (`eVersum-SUMS-Handbook-v0.2.docx`).
