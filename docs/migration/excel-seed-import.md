# Excel → seed: Reservas_2026_2027

**Task:** PMS-2 — migración verificable desde Excel.  
**Fuente:** `migration/original/Reservas_2026_2027.xlsx`  
**SHA-256:** `5d98f7b3812d393657eb979330666d38f84a33082add80a2b40f29204111bf1b`

## Qué se parseó

| Hoja | Rol | Hallazgo |
|------|-----|----------|
| **Libro de reservas** | Calendario operativo | 76 merges de cuerpo + **69 comentarios** (In/Out, tarifa, no mover). Fila de fechas con **años corruptos** → secuencia reconstruida 2026-11-16→2027-04-30; **preferir fechas del comentario**. |
| **Reservas** | Tabla estructurada | 66 filas recoverable; 3 con fechas inválidas; 30 placeholders solo-ID. |
| **Consulta** | Dashboard fórmulas | No aporta reservas (ignorada). |
| **Lista de espera Via I** | Waitlist | 4 filas → carga manual / Consultas. |

## Conteos

| Clasificación | Libro (merges) | Reservas | Waitlist |
|---------------|---------------:|---------:|---------:|
| **Recoverable** | **71** | **66** | — |
| **Ambiguous** | **5** | **3** | — |
| Noise / waitlist | — | 30 ID-only | 4 |

**Ambiguous merges (5):** labels de fila sin booking, merge vacío, o `out ≤ in`.  
**Ambiguous Reservas (3):** check-out ≤ check-in (p. ej. Catani 2027-02-25→2026-03-02; Marchese same-day).

## Mapeo de unidades

| Excel | Código seed |
|-------|-------------|
| `1`–`36` (sin 4/20) | mismo código |
| `8 y 9` | `8+9` (compuesta) |
| `35 y 36` | `35+36` (compuesta) |
| Tilo / El Tilo | `D1` |
| Romerito | `D2` |
| La Esquinita / Esquinita | `D3` |
| via I / Vía I | `VIA_I` |

## Pipeline

```bash
npm run migration:extract-excel   # → staging/extracted.json + ambiguous-report.md
npm run db:seed                   # inventario + temporada Excel 2026-11-16…2027-04-30
ALLOW_EXCEL_SEED=1 npm run db:seed-excel   # solo confidence=high
```

`db:seed-excel` prioriza la hoja **Reservas** y completa huecos con merges del Libro. No importa ambiguous ni waitlist.

## Leftovers para recepción

Ver `migration/staging/ambiguous-report.md` tras correr el extract.
