# Excel → seed: Reservas_2026_2027

**Task:** PMS-2 — migración verificable desde Excel.  
**Fuente:** `migration/original/Reservas_2026_2027.xlsx`  
**SHA-256:** `5d98f7b3812d393657eb979330666d38f84a33082add80a2b40f29204111bf1b`  
**Correcciones Julián:** 2026-10-28 (aplicadas en extract, Excel original intacto)

## Qué se parseó

| Hoja | Rol | Hallazgo |
|------|-----|----------|
| **Libro de reservas** | Calendario operativo | 76 merges de cuerpo + **69 comentarios**. Fila de fechas con años corruptos → secuencia 2026-11-16→2027-04-30; **preferir comentarios + correcciones Julián**. |
| **Reservas** | Tabla estructurada | 69 recoverable tras correcciones; 0 ambiguous; 30 ID-only. |
| **Consulta** | Dashboard fórmulas | Ignorada. |
| **Lista de espera Via I** | Waitlist (no bookings) | 4 aspirantes → Consultas. **No** son reservas del depto Vía I. |

## Conteos (post-correcciones Julián)

| Clasificación | Libro (merges) | Reservas | Waitlist |
|---------------|---------------:|---------:|---------:|
| **Recoverable** | **72** | **69** | — |
| **Ambiguous** | **4** (solo labels/vacíos) | **0** | — |
| Noise / waitlist | — | 30 ID-only | 4 |

Total recoverable: **141**. Ambiguous restantes = labels de fila / merge vacío sin huésped.

### Correcciones aplicadas

| Caso | Antes | Después |
|------|-------|---------|
| Libro `CC12:CI13` Silvia Paiges | out 2025-02-08 | **out 2027-02-08** (in 2027-02-01) |
| Reservas row 39 Ernesto Catani | out 2026-03-02 | **out 2027-03-02** (in 2027-02-25) |
| Marchese estadía diciembre | filas same-day / mixtas | **in 2026-12-23 / out 2026-12-26** |
| Marchese hab. 25 feb-2027 | — | se mantiene (estadía aparte) |

### Vía I — aclaración para Julián

La hoja **«Lista de espera Via I»** es una **lista de espera** (Grosso, Roth×2, Sivit quieren Esq./Vía si se libera). Por eso quedan en `waitlist`, no como reservas.

Las **reservas reales** del departamento están en:
- Libro, fila `via I` → código seed `VIA_I`
- Reservas, `Habitación = Vía I`

Hay **5** bookings `VIA_I` recoverable (Verdino, Sotelo, etc.). No hubo que reclasificar la waitlist a reserva.

## Mapeo de unidades

| Excel | Código seed |
|-------|-------------|
| `1`–`36` (sin 4/20) | mismo código |
| `8 y 9` | `8+9` |
| `35 y 36` | `35+36` |
| Tilo / El Tilo | `D1` |
| Romerito | `D2` |
| La Esquinita / Esquinita | `D3` |
| via I / Vía I | `VIA_I` |

## Pipeline

```bash
npm run migration:extract-excel   # aplica correcciones Julián → staging/
npm run db:seed
ALLOW_EXCEL_SEED=1 npm run db:seed-excel
```

`db:seed-excel` prioriza hoja **Reservas** y completa huecos con merges. No importa ambiguous ni waitlist.
