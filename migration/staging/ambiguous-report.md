# Informe de datos ambiguos (no importar en silencio)

Generado: 2026-10-28T16:14:01.080046Z
Fuente: `Reservas_2026_2027.xlsx`
SHA-256: `5d98f7b3812d393657eb979330666d38f84a33082add80a2b40f29204111bf1b`

Total filas extractadas: **179**
- Recoverable (`confidence=high`): **137**
- Ambiguous / waitlist: **12**
- Noise (placeholders): **30**

## Por hoja

- Libro de reservas (merges): recoverable **71** · ambiguous **5** · comments **69**
- Reservas (tabla): recoverable **66** · ambiguous **3** · noise **30**
- Lista de espera Vía I: **4**

## Filas ambiguous / waitlist

| Fuente | Ref | Unidad | In | Out | Huésped | Issues |
|---|---|---|---|---|---|---|
| Libro de reservas | A41:B41 | D1 | ∅ | ∅ | ∅ | empty_or_label_only; row_label_not_booking; no_dates |
| Libro de reservas | J31:K31 | 28 | 2026-11-22 | 2026-11-24 | ∅ | empty_or_label_only |
| Libro de reservas | A43:B43 | D3 | ∅ | ∅ | ∅ | empty_or_label_only; row_label_not_booking; no_dates |
| Libro de reservas | A40:B40 | VIA_I | ∅ | ∅ | ∅ | empty_or_label_only; row_label_not_booking; no_dates |
| Libro de reservas | CC12:CI13 | 8 | 2027-02-01 | 2025-02-08 | BK Silvia Paiges - x 4 camas | out_before_in |
| Reservas | row:19 | 21 | 2026-12-26 | 2026-12-26 | Pedro Marchese | out_before_in |
| Reservas | row:20 | 17 | 2026-12-26 | 2026-12-26 | Pedro Marchese | out_before_in |
| Reservas | row:39 | 31 | 2027-02-25 | 2026-03-02 | Ernesto Catani | out_before_in |
| Lista de espera Via I | row:2 | ∅ | 23/1/27 al 31/1/27 inc. | ∅ | Analia Grosso | waitlist_manual_review |
| Lista de espera Via I | row:3 | ∅ | 9/1/27 al 15/1/27 inc. | ∅ | Natalia Roth | waitlist_manual_review |
| Lista de espera Via I | row:4 | ∅ | 9/1/27 al 15/1/27 inc. | ∅ | Carolina Roth | waitlist_manual_review |
| Lista de espera Via I | row:5 | ∅ | 2° quincena enero | ∅ | Catalina Sivit | waitlist_manual_review |

## Noise (ID-only placeholders)

30 filas solo con ID de reserva y sin datos — no importar.

## Acción requerida

- Revisar ambiguous con recepción antes de `ALLOW_STAGING_IMPORT=1`.
- Fechas del calendario: preferir **comentarios** (`In:`/`Out:`) porque la fila de fechas del Excel tiene años corruptos.
- Deptos con nombre se mapean a `D1` (Tilo), `D2` (Romerito), `D3` (Esquinita), `VIA_I`.
- Waitlist → sección Consultas / carga manual.
