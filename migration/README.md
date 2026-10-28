# Migración Excel → PMS Riviera

Pipeline verificable. **Nunca importar ambiguos en silencio.**

Fuente operativa actual: `original/Reservas_2026_2027.xlsx` (Libro de reservas = merges + comentarios; hoja `Reservas` = tabla estructurada).

## Etapas

1. **Copia intacta** — Excel original en `migration/original/` (conservar SHA-256).
2. **Extracción Excel** — `npm run migration:extract-excel`  
   Lee merges + comentarios del calendario y la hoja `Reservas`. Escribe:
   - `migration/staging/extracted.json`
   - `migration/staging/ambiguous-report.md`
3. **(Opcional CSV)** — `npm run migration:extract` para CSV normalizados en `staging/input/`.
4. **Informe de ambiguos** — revisar `ambiguous-report.md` con recepción.
5. **Seed inventario** — `npm run db:seed` (deptos `D1`=El Tilo, `D2`=Romerito, `D3`=La Esquinita, `VIA_I`).
6. **Import recoverable** — `ALLOW_EXCEL_SEED=1 npm run db:seed-excel`  
   Solo `confidence=high` / `classification=recoverable`. Prefiere hoja `Reservas`; completa huecos desde merges.
7. **Validación visual** — comparar calendario PMS vs Excel.
8. **Fecha de corte** — congelar Excel; solo altas en PMS.
9. **Go-live** — ver `docs/cutover-checklist.md`.

## Conteos de referencia (post-correcciones Julián 2026-10-28)

| Fuente | Recoverable | Ambiguous | Noise / waitlist |
|--------|------------:|----------:|-----------------:|
| Libro de reservas (76 merges, 69 comments) | 72 | 4 (labels) | — |
| Hoja Reservas | 69 | 0 | 30 (ID-only) |
| Lista de espera Vía I | — | — | 4 (aspirantes, no bookings) |

**Total recoverable: 141.** Correcciones en `extract-excel.py` (`apply_julian_corrections`): Paiges out→2027-02-08, Catani out→2027-03-02, Marchese dic→23–26/12/2026.

Fechas del calendario: **preferir comentarios** + correcciones Julián. La fila de fechas del Excel tiene años corruptos; el extractor reconstruye 2026-11-16 → 2027-04-30 solo como fallback.

**Vía I:** la hoja «Lista de espera Via I» ≠ reservas del depto. Bookings reales usan unidad `VIA_I` desde Libro/Reservas.

## Carpetas

```
migration/
  original/          # Excel fuente (NO modificar)
  staging/input/     # CSV normalizados (legacy)
  staging/extracted.json
  staging/ambiguous-report.md
  scripts/
    extract-excel.py # merges + comments + Reservas
    extract.ts       # CSV helper
    report-ambiguous.ts
    import-staging.ts
  docs/cutover-checklist.md
```

## Leftovers típicos (post-MVP cutover)

- Filas con habitación ilegible o códigos fuera de inventario
- Placeholders solo-ID en hoja Reservas
- Check-out ≤ check-in / año mal tipeado
- Waitlist Vía I (cargar como Consultas)
- Grupos Excel sin titular claro / pagos solo en notas

Esos casos quedan en `ambiguous-report.md` para carga manual.
