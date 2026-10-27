# Migración Excel → PMS Riviera

Pipeline verificable. **Nunca importar ambiguos en silencio.**

## Etapas

1. **Copia intacta** — depositar el Excel original en `migration/original/` (git-ignored binarios grandes; conservar hash).
2. **Extracción** — `npm run migration:extract` lee CSV/XLSX exportado a `migration/staging/input/` y genera `migration/staging/extracted.json`.
3. **Informe de ambiguos** — `npm run migration:report` produce `migration/staging/ambiguous-report.md`. Revisar con recepción.
4. **Import a staging** — `npm run migration:import-staging` solo importa filas con `confidence=high` a la DB marcada como staging (`DATABASE_URL` de staging).
5. **Validación visual** — comparar calendario PMS vs Excel (checklist abajo).
6. **Fecha de corte** — congelar Excel; solo altas en PMS.
7. **Go-live** — cutover documentado; leftovers en informe.

## Carpetas

```
migration/
  original/          # Excel fuente (NO modificar)
  staging/input/     # CSV normalizados
  staging/extracted.json
  staging/ambiguous-report.md
  scripts/
  docs/cutover-checklist.md
```

## Leftovers típicos (post-MVP cutover)

- Filas con habitación ilegible o códigos fuera de inventario
- Grupos Excel sin titular claro
- Pagos en notas libres sin monto/fecha parseable
- Reservas canceladas mezcladas con colores
- Unidades 8+9 / 35+36 representadas solo como texto

Esos casos quedan en `ambiguous-report.md` para carga manual.
