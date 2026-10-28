# Excel → seed: Reservas_2026_2027

**Task:** PMS-2 — migración verificable desde Excel.  
**Fuente:** `migration/original/Reservas_2026_2027.xlsx`  
**SHA-256:** `5d98f7b3812d393657eb979330666d38f84a33082add80a2b40f29204111bf1b`  
**Correcciones Julián:** 2026-10-28 (fechas + estructura Libro)

## Qué se parseó

| Hoja | Rol | Hallazgo |
|------|-----|----------|
| **Libro de reservas** | Calendario operativo | Merges de estancia + comentarios. Filas A40–A43 = **headers de depto**. |
| **Reservas** | Tabla estructurada | 69 recoverable; 0 ambiguous; 30 ID-only. |
| **Consulta** | Dashboard fórmulas | Ignorada. |
| **Lista de espera Via I** | Waitlist (aspirantes) | 4 filas → Consultas. No son bookings `VIA_I`. |

## Conteos (post-correcciones)

| Clasificación | Libro | Reservas | Waitlist |
|---------------|------:|---------:|---------:|
| **Recoverable** | **72** | **69** | — |
| **Ambiguous** | **0** | **0** | — |
| unit_header | 4 (Via I / Tilo / Romerito / Esquinita) | — | — |
| ignore | 1 (`J31:K31`) | — | — |
| Noise | — | 30 ID-only | 4 waitlist |

**Total recoverable: 141.** Ninguna fila de reserva queda ambiguous.

### Correcciones Julián

| Caso | Tratamiento |
|------|-------------|
| Paiges `CC12:CI13` | out **2027-02-08** → recoverable |
| Catani Reservas row 39 | out **2027-03-02** → recoverable |
| Marchese dic | **2026-12-23…26** (feb-2027 hab.25 aparte) |
| `J31:K31` | merge vacío espurio → **`ignore`** (no import / no ambiguous) |
| `A40:B40`, `A41`, `A42`, `A43` | **`unit_header`** — rótulos de unidad física del calendario |

### Vía I

- Headers de fila / depto ≠ waitlist ≠ reservas.
- Waitlist sheet = aspirantes.
- Bookings reales `VIA_I`: **5** recoverable.

## Mapeo de unidades

| Excel | Código seed |
|-------|-------------|
| `1`–`36` (sin 4/20) | mismo |
| `8 y 9` / `35 y 36` | `8+9` / `35+36` |
| Tilo / Romerito / Esquinita / via I | `D1` / `D2` / `D3` / `VIA_I` |

## Pipeline

```bash
npm run migration:extract-excel
npm run db:seed
ALLOW_EXCEL_SEED=1 npm run db:seed-excel
```

Seed solo importa `classification=recoverable`. Nunca `unit_header`, `ignore`, waitlist ni noise.
