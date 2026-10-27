# PMS Riviera (`riviera-app-v2`)

Property Management System greenfield para Hotel Riviera (Mar del Plata).  
El **calendario** es el centro de la UX. Repo: `jstramigioli/riviera-app-v2` (no usar `riviera-app`).

## Stack

- Next.js 15 App Router + TypeScript
- PostgreSQL + Prisma (**solo migraciones**)
- Sesiones (`iron-session`) con roles `ADMIN` / `RECEPCION`
- Vitest + GitHub Actions CI

## Cómo correr local

```bash
# Postgres local (ejemplo)
# CREATE USER riviera WITH PASSWORD 'riviera' SUPERUSER;
# CREATE DATABASE riviera_pms OWNER riviera;

cp .env.example .env
npm install --legacy-peer-deps
npx prisma migrate dev
npm run db:seed
npm run dev
```

Abrí http://localhost:3000

| Usuario | Password | Rol |
|---------|----------|-----|
| `admin@riviera.local` | `admin123` | ADMIN |
| `recepcion@riviera.local` | `recepcion123` | RECEPCION |

## Scripts

| Script | Uso |
|--------|-----|
| `npm run dev` | App |
| `npm test` | Disponibilidad / money / dates |
| `npm run typecheck` | `tsc` |
| `npm run db:seed` | Inventario Riviera + demo |
| `npm run migration:extract` | Excel/CSV → staging JSON |
| `npm run migration:report` | Informe de ambiguos |
| `npm run migration:import-staging` | Solo high-confidence (`ALLOW_STAGING_IMPORT=1`) |

## Dominio MVP

PhysicalUnit, UnitAttribute, CommercialCategory, CompositeUnit (8+9, 35+36), Rate/RatePlan, Reservation (estado ≠ pago), AssignmentSegment, Guest, ReservationGuest, Payment (ARS deuda; USD + FX manual), AuditLog.

Integridad: sin solapes físicos; compuesta bloquea componentes y viceversa.

## Fuera de MVP

Consumos, caja, check-in online público, stats, mail/WhatsApp, booking engine, OTA, buffet dedicado.

## Deploy

Vercel + Postgres administrado. Variables: `DATABASE_URL`, `SESSION_SECRET`.  
`npx prisma migrate deploy` en release. Ver `docs/backup-restore.md`.

## Migración Excel

Ver `migration/README.md`. Leftovers: filas ambiguas en `migration/staging/ambiguous-report.md` (carga manual).
