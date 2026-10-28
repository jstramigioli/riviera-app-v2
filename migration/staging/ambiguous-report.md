# Informe de datos ambiguos (no importar en silencio)

Generado: 2026-10-28T17:04:35.412503Z
Fuente: `Reservas_2026_2027.xlsx`
SHA-256: `5d98f7b3812d393657eb979330666d38f84a33082add80a2b40f29204111bf1b`

Total filas extractadas: **179**
- Recoverable (`confidence=high`): **141**
- Ambiguous / waitlist: **8**
- Noise (placeholders): **30**

## Por hoja

- Libro de reservas (merges): recoverable **72** · ambiguous **4** · comments **69**
- Reservas (tabla): recoverable **69** · ambiguous **0** · noise **30**
- Lista de espera Vía I: **4**

## Filas ambiguous / waitlist

| Fuente | Ref | Unidad | In | Out | Huésped | Issues |
|---|---|---|---|---|---|---|
| Libro de reservas | A41:B41 | D1 | ∅ | ∅ | ∅ | empty_or_label_only; row_label_not_booking; no_dates |
| Libro de reservas | J31:K31 | 28 | 2026-11-22 | 2026-11-24 | ∅ | empty_or_label_only |
| Libro de reservas | A43:B43 | D3 | ∅ | ∅ | ∅ | empty_or_label_only; row_label_not_booking; no_dates |
| Libro de reservas | A40:B40 | VIA_I | ∅ | ∅ | ∅ | empty_or_label_only; row_label_not_booking; no_dates |
| Lista de espera Via I | row:2 | ∅ | 23/1/27 al 31/1/27 inc. | ∅ | Analia Grosso | waitlist_not_via_i_booking; waitlist_manual_review |
| Lista de espera Via I | row:3 | ∅ | 9/1/27 al 15/1/27 inc. | ∅ | Natalia Roth | waitlist_not_via_i_booking; waitlist_manual_review |
| Lista de espera Via I | row:4 | ∅ | 9/1/27 al 15/1/27 inc. | ∅ | Carolina Roth | waitlist_not_via_i_booking; waitlist_manual_review |
| Lista de espera Via I | row:5 | ∅ | 2° quincena enero | ∅ | Catalina Sivit | waitlist_not_via_i_booking; waitlist_manual_review |

## Noise (ID-only placeholders)

30 filas solo con ID de reserva y sin datos — no importar.

## Vía I: waitlist vs reservas del depto (Julián)

La hoja **«Lista de espera Via I»** no son reservas del departamento Vía I.
Es una **lista de espera** (aspirantes que quieren Esq./Vía si se libera).
Esas **4** filas siguen en `waitlist` → Consultas / carga manual.

Las reservas reales del depto (`unit=VIA_I`) ya están como recoverable: **5** (Libro fila `via I` + hoja Reservas `Habitación=Vía I`).

## Correcciones Julián (2026-10-28)

- Libro `CC12:CI13` Silvia Paiges: out **2027-02-08** (año mal en comentario).
- Reservas row 39 Ernesto Catani: out **2027-03-02**.
- Marchese (estadía dic): **in 2026-12-23 / out 2026-12-26** (incluye filas same-day).
  La estadía febrero 2027 en hab. 25 se mantiene aparte.

## Acción requerida

- Revisar ambiguous restantes con recepción antes de `ALLOW_EXCEL_SEED=1`.
- Fechas del calendario: preferir **comentarios** (`In:`/`Out:`) + correcciones Julián.
- Deptos: `D1` (Tilo), `D2` (Romerito), `D3` (Esquinita), `VIA_I`.
- Waitlist → Consultas / carga manual (no son bookings de `VIA_I`).
