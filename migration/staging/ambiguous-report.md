# Informe de datos ambiguos (no importar en silencio)

Generado: 2026-10-28T17:40:07.730070Z
Fuente: `Reservas_2026_2027.xlsx`
SHA-256: `5d98f7b3812d393657eb979330666d38f84a33082add80a2b40f29204111bf1b`

Total filas extractadas: **180**
- Recoverable (`confidence=high`): **141**
- Ambiguous / waitlist: **4**
- Unit headers (dept rows): **4**
- Ignored (spurious merges): **1**
- Noise (placeholders): **30**

## Por hoja

- Libro de reservas (merges): recoverable **72** · ambiguous **0** · comments **69**
- Reservas (tabla): recoverable **69** · ambiguous **0** · noise **30**
- Lista de espera Vía I: **4**

## Filas ambiguous / waitlist

| Fuente | Ref | Unidad | In | Out | Huésped | Issues |
|---|---|---|---|---|---|---|
| Lista de espera Via I | row:2 | ∅ | 23/1/27 al 31/1/27 inc. | ∅ | Analia Grosso | waitlist_not_via_i_booking; waitlist_manual_review |
| Lista de espera Via I | row:3 | ∅ | 9/1/27 al 15/1/27 inc. | ∅ | Natalia Roth | waitlist_not_via_i_booking; waitlist_manual_review |
| Lista de espera Via I | row:4 | ∅ | 9/1/27 al 15/1/27 inc. | ∅ | Carolina Roth | waitlist_not_via_i_booking; waitlist_manual_review |
| Lista de espera Via I | row:5 | ∅ | 2° quincena enero | ∅ | Catalina Sivit | waitlist_not_via_i_booking; waitlist_manual_review |
| — | — | — | — | — | — | *(ninguna fila ambiguous)* |

## Unit headers (filas de depto en el Libro)

A40:B40 / A41 / A42 / A43 son **rótulos de unidad física** del calendario (Via I, Tilo, Romerito, La Esquinita) — no reservas ni waitlist.

| Ref | roomRaw | unit seed |
|---|---|---|
| A41:B41 | Tilo | D1 |
| A43:B43 | La Esquinita | D3 |
| A40:B40 | via I | VIA_I |
| A42 | Romerito | D2 |

Nota: `A42` (Romerito) no está mergeado A:B; es celda de encabezado de fila. Las reservas de esa fila son merges de fechas (p. ej. `D42:J42`).

## Ignored (merges vacíos espurios)

Merges vacíos sin huésped/comentario (p. ej. `J31:K31`) — **no** son reservas; excluidos de ambiguous e import.

| Ref | roomRaw | Nota |
|---|---|---|
| J31:K31 | 28 | julian: wrongly merged empty cells; drop from ambiguous/import |

## Noise (ID-only placeholders)

30 filas solo con ID de reserva y sin datos — no importar.

## Vía I: waitlist vs reservas del depto (Julián)

La hoja **«Lista de espera Via I»** no son reservas del departamento Vía I.
Es una **lista de espera** (aspirantes que quieren Esq./Vía si se libera).
Esas **4** filas siguen en `waitlist` → Consultas / carga manual.

Las reservas reales del depto (`unit=VIA_I`) ya están como recoverable: **5** (Libro fila `via I` + hoja Reservas `Habitación=Vía I`).

## Correcciones Julián

### 2026-10-28 (fechas)

- Libro `CC12:CI13` Silvia Paiges: out **2027-02-08**.
- Reservas row 39 Ernesto Catani: out **2027-03-02**.
- Marchese (estadía dic): **in 2026-12-23 / out 2026-12-26**.
  La estadía febrero 2027 en hab. 25 se mantiene aparte.

### 2026-10-28 (estructura Libro)

- `J31:K31`: merge vacío espurio → `ignore` (no reserva).
- `A40:B40`, `A41`, `A42`, `A43`: headers de depto → `unit_header`.

## Acción requerida

- Revisar ambiguous restantes (si hay) antes de `ALLOW_EXCEL_SEED=1`.
- `unit_header` / `ignore` / waitlist / noise **nunca** entran al seed.
- Deptos: `D1` (Tilo), `D2` (Romerito), `D3` (Esquinita), `VIA_I`.
