# Backup / restore (Postgres)

## Backup

```bash
pg_dump "$DATABASE_URL" --format=custom --file="backup-$(date +%Y%m%d).dump"
```

## Restore (cuidado: destructivo)

```bash
# ¿Hay un backup reciente de la base de datos antes de proceder?
pg_restore --clean --if-exists --dbname="$DATABASE_URL" backup-YYYYMMDD.dump
```

Nunca usar `prisma db push` ni `migrate reset` contra datos reales.
Solo migraciones: `npx prisma migrate deploy`.
