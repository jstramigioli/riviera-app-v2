# Excel comment money patterns → seed

**Source:** cell comments on *Libro de reservas* merges (`Reservas_2026_2027.xlsx`).  
**Extractor:** `migration/scripts/extract-excel.py` → `parse_comment_money`.  
**Seed:** `prisma/seed-excel.ts` writes `Reservation.agreedPriceArs` + `Payment` rows.

## Patterns found (69 comments)

| Pattern (examples) | Field | Notes |
|--------------------|-------|-------|
| `Tarifa x d: $ 235.000.-` | `nightlyRateArs` | Dual rates kept in `nightlyRatesArs[]` |
| `Tarifa x d: $ 235.000.- $ 270.000.-` | `nightlyRatesArs` | Two season/rate steps |
| `Tarifa x semana: $ 1.260.000.-` / `Depto. x 1 semana: $ …` | `weeklyRateArs` → may become `agreedPriceArs` | Used when no stay total |
| `Total x 7 d: $ 1.645.000.-` | `totalArs` / `agreedPriceArs` | Primary stay total |
| `Tarifa total x 5 d` / `Tarifa total por 7 d` | same | Variant wording |
| `Tarifa x 9 d: $ 1.838.700.-` | `totalArs` | No “Total” word |
| `Total x 7 d + late check out: $ …` | `totalArs` | Inclusive total |
| `Late check out: $ 147.500.-` | `lateCheckoutArs` | Informational |
| `Tarifa final con descuento GENIUS …: $ 2.641.000.-` | **preferred** `agreedPriceArs` | Source `discounted_final` |
| `Descuento GENIUS del 12 %: $ …` / `Final con descuento: $ …` | same | |
| `Seña: $ 164.500.- 24/9/26` | `payments[]` type `SENIA` ARS | Optional date → `paidOn` |
| `Seña a Luli: $ 600.000.-` / `Seña a José Luis: $ …` | same | Payee ignored |
| `Seña a Lu: $` (blank) | `moneyHints: senia_blank_amount` | **Not** imported as payment |
| `Seña junto a Johanna` / `Seña en hotel…` | `moneyHints: senia_text_only` | No amount |
| `Abona seña a Lu en USD 700 ($ 1.075.620.-) 5/10/26` | `SENIA` USD + ARS + FX | Seeded when ARS present |
| `Abona a Luli total …: USD 3.000.-` | `FINAL` USD | Skipped in seed if no FX/ARS |
| `Abona a Lu total: $ 804.600.-` | `FINAL` ARS | |
| `Abonó total de hab. con hab. 7` | text hint only | Shared payment across rooms |
| `A FAVOR: $ 64.118.-` | `creditArs` | Not a Payment row |
| `A CUENTA: $` / `Abona con mastercard…: $` | blank | Ignored |

## Agreed price priority

1. Genius / “final con descuento” amount  
2. Else `Total x N d` / `Tarifa x N d` / bare `Total:`  
3. Else weekly depto quote  

## Seed behaviour

- Reservas sheet has **no** money columns → enrich from matching Libro comment (guest + dates + unit).
- `ALLOW_EXCEL_SEED=1 npm run db:seed-excel` sets `agreedPriceArs` and creates payments.
- USD without ARS equivalent is **skipped** (logged), not invented.
- Blank seña / text-only seña stay in notes/hints.

## Coverage (after parse, this workbook)

See `migration/staging/extracted.json` → `counts.withAgreedPrice` / `withPayments` / `reservasEnrichedFromLibro` / `withPhone` / `withEmail` / `withGuestCount`.

## Guest count + contact (also from comments)

| Pattern | Field |
|---------|-------|
| `Name x 2` / `x 4 camas` / `x 3 + bebe` | `adults` / `children` / `guestCount` (not `Total x N d`) |
| `Tel: 011 …` | `phone` on titular Guest |
| `Correo: a@b.com` | `email` on titular Guest |
| `DNI: …` | `documentNumber` |

Seed creates **N guest slots** (1 TITULAR + acompañantes sin nombre) and persists `agreedPriceArs` + `Payment`.

## What was wrong before (Julián report)

1. Seed only created **1** guest (titular) → UI looked like “solo nombre”.
2. Tel/email stayed buried in reservation notes → guest profile empty.
3. Money lived in `extracted.json` but Reservas-first import often lacked payments until enrichment; seed also didn’t create companion slots / contact fields.
