#!/usr/bin/env python3
"""
Extract bookings from Reservas_2026_2027.xlsx (Libro de reservas merges+comments
and the structured Reservas sheet).

Never silently imports ambiguous rows — confidence is tagged per row.
Requires: openpyxl (pip install openpyxl)
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

try:
    import openpyxl
except ImportError:
    print("Missing openpyxl. Run: pip install openpyxl", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_XLSX = ROOT / "original" / "Reservas_2026_2027.xlsx"
OUT_JSON = ROOT / "staging" / "extracted.json"
OUT_REPORT = ROOT / "staging" / "ambiguous-report.md"

# Excel display name → PhysicalUnit / CompositeUnit code in seed
NAMED_CALENDAR = {
    "via I": "VIA_I",
    "Tilo": "D1",
    "Romerito": "D2",
    "La Esquinita": "D3",
}
NAMED_RESERVAS = {
    "El Tilo": "D1",
    "Esquinita": "D3",
    "Vía I": "VIA_I",
    "Via I": "VIA_I",
    "8 y 9": "8+9",
    "35 y 36": "35+36",
}
PLAN_MAP = {
    "Sin desayuno": "SIN_DESAYUNO",
    "Con desayuno": "DESAYUNO",
    "Media pensión": "MEDIA_PENSION",
}
ESTADO_MAP = {
    "Con Seña": "CONFIRMADA",
    "Pago Total": "CONFIRMADA",
    "Sin seña": "PRERRESERVA",
}

IN_OUT_RE = re.compile(
    r"In:\s*(\d{1,2})/(\d{1,2})/(\d{2,4})\s*Out:\s*(\d{1,2})/(\d{1,2})/(\d{2,4})",
    re.I,
)
NO_MOVER_RE = re.compile(r"no\s*mover", re.I)
BOOKING_RE = re.compile(r"Booking", re.I)
PAX_RE = re.compile(r"x\s*(\d+)", re.I)

# Money patterns from Libro cell comments (ARS uses . as thousands separator).
MONEY_TOKEN = r"([\d]{1,3}(?:\.\d{3})+|\d+)"
NIGHTLY_RE = re.compile(
    rf"Tarifa\s*x\s*d\s*:?\s*\$?\s*{MONEY_TOKEN}(?:\s*\$?\s*{MONEY_TOKEN})?",
    re.I,
)
WEEKLY_RE = re.compile(
    rf"(?:Tarifa\s*x\s*semana|Depto\.\s*x\s*\d+\s*semana)\s*:?\s*\$?\s*{MONEY_TOKEN}",
    re.I,
)
TOTAL_XD_RE = re.compile(
    rf"(?:Tarifa\s+)?Total(?:\s*x|\s+por)?\s*(\d+)\s*d(?:\s*\+\s*late\s*check\s*out)?\s*:?\s*\$?\s*{MONEY_TOKEN}",
    re.I,
)
# e.g. "Tarifa x 9 d: $ 1.838.700.-" (no "Total" word)
TARIFA_XD_RE = re.compile(
    rf"Tarifa\s*x\s*(\d+)\s*d\s*:?\s*\$?\s*{MONEY_TOKEN}",
    re.I,
)
TOTAL_BARE_RE = re.compile(rf"^Total\s*:?\s*\$?\s*{MONEY_TOKEN}", re.I | re.M)
GENIUS_FINAL_RE = re.compile(
    rf"(?:Tarifa\s+final\s+con\s+descuento|Final\s+con\s+descuento|Descuento\s+GENIUS|"
    rf"-?\s*dest\.?\s*GENIUS)[^\n$]*\$\s*{MONEY_TOKEN}",
    re.I,
)
LATE_RE = re.compile(rf"Late\s*check\s*out\s*:?\s*\$?\s*{MONEY_TOKEN}", re.I)
A_FAVOR_RE = re.compile(rf"A\s+FAVOR\s*:?\s*\$?\s*{MONEY_TOKEN}", re.I)
# Seña: $ 164.500.- 24/9/26  |  Seña a Luli: $ 600.000.-
SENIA_ARS_RE = re.compile(
    rf"Seña(?:\s+a\s+[\w\s]+?)?\s*:?\s*\$\s*{MONEY_TOKEN}"
    rf"(?:\.-)?(?:\s*[.]?\s*(\d{{1,2}}/\d{{1,2}}/\d{{2,4}}))?",
    re.I,
)
# Abona seña a Lu en USD 700 ($ 1.075.620.-) 5/10/26
SENIA_USD_RE = re.compile(
    rf"(?:Abona\s+)?[Ss]eña[^\n]*?\bUSD\s*{MONEY_TOKEN}"
    rf"(?:\s*\(\s*\$\s*{MONEY_TOKEN}\s*\.-?\s*\))?"
    rf"(?:\s*(\d{{1,2}}/\d{{1,2}}/\d{{2,4}}))?",
    re.I,
)
# Abona a Lu total: $ 804.600.-  |  Abona a Luli total de 4 habitaciones: USD 3.000.-
ABONA_TOTAL_RE = re.compile(
    rf"Abon[aó]\w*\s+(?:a\s+\w+\s+)?total[^\n$]*?(?:USD\s*{MONEY_TOKEN}|\${MONEY_TOKEN})",
    re.I,
)
EMPTY_SENIA_RE = re.compile(r"Seña(?:\s+a\s+\w+)?\s*:?\s*\$\s*$", re.I | re.M)
SENIA_TEXT_ONLY_RE = re.compile(
    r"Seña\s+(?:junto\s+a|en\s+hotel)|Abon[oó]\s+total\s+(?:de\s+hab|con\s+hab)",
    re.I,
)


def parse_year(y: str) -> int:
    n = int(y)
    return n + 2000 if n < 100 else n


def parse_money(s: str) -> int | None:
    try:
        return int(s.replace(".", "").replace(" ", ""))
    except ValueError:
        return None


def parse_dmy(s: str | None) -> str | None:
    if not s:
        return None
    m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{2,4})$", s.strip())
    if not m:
        return None
    d, mo, y = m.groups()
    return date(parse_year(y), int(mo), int(d)).isoformat()


def parse_comment_money(comment: str | None) -> dict:
    """
    Extract agreed price + payment hints from a Libro cell comment.
    Returns structured money fields; never invents amounts from empty '$'.
    """
    empty = {
        "nightlyRatesArs": [],
        "nightlyRateArs": None,
        "weeklyRateArs": None,
        "totalArs": None,
        "nightsQuoted": None,
        "agreedPriceArs": None,
        "agreedPriceSource": None,
        "lateCheckoutArs": None,
        "creditArs": None,
        "payments": [],
        "moneyHints": [],
        "parseWarnings": [],
    }
    if not comment:
        return empty

    out = dict(empty)
    out["nightlyRatesArs"] = []
    out["payments"] = []
    out["moneyHints"] = []
    out["parseWarnings"] = []

    nm = NIGHTLY_RE.search(comment)
    if nm:
        rates = [parse_money(g) for g in nm.groups() if g]
        rates = [r for r in rates if r is not None]
        out["nightlyRatesArs"] = rates
        out["nightlyRateArs"] = rates[0] if rates else None

    wm = WEEKLY_RE.search(comment)
    if wm:
        out["weeklyRateArs"] = parse_money(wm.group(1))

    tm = TOTAL_XD_RE.search(comment)
    if tm:
        out["nightsQuoted"] = int(tm.group(1))
        out["totalArs"] = parse_money(tm.group(2))

    if out["totalArs"] is None:
        tx = TARIFA_XD_RE.search(comment)
        if tx:
            out["nightsQuoted"] = int(tx.group(1))
            out["totalArs"] = parse_money(tx.group(2))

    if out["totalArs"] is None:
        bm = TOTAL_BARE_RE.search(comment)
        if bm:
            out["totalArs"] = parse_money(bm.group(1))
            out["agreedPriceSource"] = out["agreedPriceSource"] or "total_bare"

    lm = LATE_RE.search(comment)
    if lm:
        out["lateCheckoutArs"] = parse_money(lm.group(1))

    af = A_FAVOR_RE.search(comment)
    if af:
        out["creditArs"] = parse_money(af.group(1))
        out["moneyHints"].append(f"a_favor:{out['creditArs']}")

    # Prefer GENIUS / final discounted as agreed price when present.
    gm = GENIUS_FINAL_RE.search(comment)
    if gm:
        discounted = parse_money(gm.group(1))
        out["agreedPriceArs"] = discounted
        out["agreedPriceSource"] = "discounted_final"
    elif out["totalArs"] is not None:
        out["agreedPriceArs"] = out["totalArs"]
        out["agreedPriceSource"] = out["agreedPriceSource"] or "total_xd"
    elif out["weeklyRateArs"] is not None:
        # Single-week depto quotes often only state weekly total.
        out["agreedPriceArs"] = out["weeklyRateArs"]
        out["agreedPriceSource"] = "weekly"

    # USD seña (check before ARS so "Seña … USD" doesn't become empty ARS)
    for um in SENIA_USD_RE.finditer(comment):
        usd = parse_money(um.group(1))
        ars = parse_money(um.group(2)) if um.lastindex and um.lastindex >= 2 and um.group(2) else None
        paid_on = parse_dmy(um.group(3) if um.lastindex and um.lastindex >= 3 else None)
        if usd is None:
            continue
        fx = round(ars / usd, 4) if ars and usd else None
        out["payments"].append(
            {
                "type": "SENIA",
                "currency": "USD",
                "amountOriginal": usd,
                "amountArs": ars,
                "fxRateToArs": fx,
                "paidOn": paid_on,
                "raw": um.group(0).strip()[:200],
            }
        )

    for sm in SENIA_ARS_RE.finditer(comment):
        # Skip if this span was already captured as USD seña
        raw = sm.group(0)
        if re.search(r"\bUSD\b", raw, re.I):
            continue
        ars = parse_money(sm.group(1))
        if ars is None:
            continue
        paid_on = parse_dmy(sm.group(2) if sm.lastindex and sm.lastindex >= 2 else None)
        out["payments"].append(
            {
                "type": "SENIA",
                "currency": "ARS",
                "amountOriginal": ars,
                "amountArs": ars,
                "fxRateToArs": None,
                "paidOn": paid_on,
                "raw": raw.strip()[:200],
            }
        )

    for am in ABONA_TOTAL_RE.finditer(comment):
        raw = am.group(0)
        if re.search(r"\bUSD\b", raw, re.I):
            usd_m = re.search(rf"USD\s*{MONEY_TOKEN}", raw, re.I)
            usd = parse_money(usd_m.group(1)) if usd_m else None
            if usd is None:
                continue
            out["payments"].append(
                {
                    "type": "FINAL",
                    "currency": "USD",
                    "amountOriginal": usd,
                    "amountArs": None,
                    "fxRateToArs": None,
                    "paidOn": None,
                    "raw": raw.strip()[:200],
                    "note": "group_or_multi_room_total_possible",
                }
            )
            out["parseWarnings"].append("usd_total_without_ars_fx")
        else:
            ars_m = re.search(rf"\$\s*{MONEY_TOKEN}", raw)
            ars = parse_money(ars_m.group(1)) if ars_m else None
            if ars is None:
                continue
            out["payments"].append(
                {
                    "type": "FINAL",
                    "currency": "ARS",
                    "amountOriginal": ars,
                    "amountArs": ars,
                    "fxRateToArs": None,
                    "paidOn": None,
                    "raw": raw.strip()[:200],
                }
            )

    if EMPTY_SENIA_RE.search(comment):
        out["moneyHints"].append("senia_blank_amount")
    for tm_ in SENIA_TEXT_ONLY_RE.finditer(comment):
        out["moneyHints"].append(f"senia_text_only:{tm_.group(0).strip()[:80]}")

    return out


def apply_money_fields(row: dict, money: dict) -> None:
    """Attach parsed money onto an extracted row (mutates)."""
    row["nightlyRateArs"] = money.get("nightlyRateArs")
    row["nightlyRatesArs"] = money.get("nightlyRatesArs") or []
    row["weeklyRateArs"] = money.get("weeklyRateArs")
    row["totalArs"] = money.get("totalArs")
    row["nightsQuoted"] = money.get("nightsQuoted")
    row["agreedPriceArs"] = money.get("agreedPriceArs")
    row["agreedPriceSource"] = money.get("agreedPriceSource")
    row["lateCheckoutArs"] = money.get("lateCheckoutArs")
    row["creditArs"] = money.get("creditArs")
    row["payments"] = money.get("payments") or []
    row["moneyHints"] = money.get("moneyHints") or []
    row["moneyWarnings"] = money.get("parseWarnings") or []
    # Back-compat: `price` string used by seed-excel agreedPriceArs
    if money.get("agreedPriceArs") is not None:
        row["price"] = str(money["agreedPriceArs"])
    elif money.get("totalArs") is not None:
        row["price"] = str(money["totalArs"])
    else:
        row.setdefault("price", "")


def guest_tokens(text: str) -> set[str]:
    return {
        t
        for t in re.findall(r"[A-Za-zÁÉÍÓÚÜáéíóúüÑñ]{3,}", (text or "").lower())
        if t not in {"hab", "depto", "camas", "planta", "baja", "doble", "twin", "viene", "con", "mover", "booking"}
    }


def enrich_reservas_with_libro_money(rows: list[dict]) -> None:
    """Copy comment money from Libro merges onto matching Reservas rows (seed prefers Reservas)."""
    libro = [
        r
        for r in rows
        if r.get("source") == "Libro de reservas" and r.get("classification") == "recoverable"
    ]
    for res in rows:
        if res.get("source") != "Reservas" or res.get("classification") != "recoverable":
            continue
        if res.get("agreedPriceArs") or res.get("payments"):
            continue
        res_tokens = guest_tokens(
            f"{res.get('guest','')} {res.get('firstName','')} {res.get('lastName','')}"
        )
        best = None
        best_score = 0
        for m in libro:
            score = 0
            if res.get("checkIn") and res["checkIn"] == m.get("checkIn"):
                score += 3
            if res.get("checkOut") and res["checkOut"] == m.get("checkOut"):
                score += 2
            if res.get("unit") and res["unit"] == m.get("unit"):
                score += 2
            # composite 8+9 vs physical 8/9
            if res.get("unit") and m.get("unit") and (
                res["unit"].startswith(m["unit"])
                or m["unit"] in (res["unit"].split("+") if "+" in res["unit"] else [])
            ):
                score += 1
            overlap = res_tokens & guest_tokens(m.get("guest") or "")
            score += min(3, len(overlap))
            if score > best_score and (overlap or res.get("unit") == m.get("unit")):
                best_score = score
                best = m
        if best and best_score >= 4 and (best.get("agreedPriceArs") or best.get("payments")):
            apply_money_fields(
                res,
                {
                    "nightlyRateArs": best.get("nightlyRateArs"),
                    "nightlyRatesArs": best.get("nightlyRatesArs") or [],
                    "weeklyRateArs": best.get("weeklyRateArs"),
                    "totalArs": best.get("totalArs"),
                    "nightsQuoted": best.get("nightsQuoted"),
                    "agreedPriceArs": best.get("agreedPriceArs"),
                    "agreedPriceSource": best.get("agreedPriceSource"),
                    "lateCheckoutArs": best.get("lateCheckoutArs"),
                    "creditArs": best.get("creditArs"),
                    "payments": best.get("payments") or [],
                    "moneyHints": (best.get("moneyHints") or []) + ["enriched_from_libro"],
                    "parseWarnings": best.get("moneyWarnings") or [],
                },
            )
            res.setdefault("parseNotes", []).append(
                f"money_enriched_from:{best.get('sourceRef')} score={best_score}"
            )


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build_fixed_dates(ws) -> dict[int, date]:
    """Row 5 years are corrupted in the workbook; rebuild a continuous sequence."""
    cols = sorted(
        c
        for c in range(1, ws.max_column + 1)
        if isinstance(ws.cell(5, c).value, datetime)
    )
    # First labeled night in this file is 16/11/2026 (comments + season).
    anchor = date(2026, 11, 16)
    return {c: anchor + timedelta(days=i) for i, c in enumerate(cols)}


def room_by_row(ws) -> dict[int, str]:
    out: dict[int, str] = {}
    for r in range(6, 50):
        a = ws.cell(r, 1).value
        if a is None:
            continue
        out[r] = str(int(a)) if isinstance(a, float) else str(a).strip()
    return out


def extract_merges(ws) -> list[dict]:
    rooms = room_by_row(ws)
    dates = build_fixed_dates(ws)
    rows: list[dict] = []

    for m in ws.merged_cells.ranges:
        if m.min_row < 6:
            continue
        room_raw = rooms.get(m.min_row)
        top = ws.cell(m.min_row, m.min_col)
        raw_val = top.value
        val = raw_val.strip() if isinstance(raw_val, str) else raw_val
        comment = top.comment.text if top.comment else None

        d_start = dates.get(m.min_col)
        d_end_night = dates.get(m.max_col)
        merge_out = (d_end_night + timedelta(days=1)) if d_end_night else None

        cin = cout = None
        money = parse_comment_money(comment)
        if comment:
            mo = IN_OUT_RE.search(comment)
            if mo:
                d1, m1, y1, d2, m2, y2 = mo.groups()
                cin = date(parse_year(y1), int(m1), int(d1))
                cout = date(parse_year(y2), int(m2), int(d2))

        is_label = isinstance(val, str) and val.strip() in (
            room_raw,
            "Tilo",
            "via I",
            "La Esquinita",
            "Romerito",
        )
        guest = None if is_label else (val.strip() if isinstance(val, str) and val.strip() else None)

        issues: list[str] = []
        notes: list[str] = []
        unit = None
        if room_raw in NAMED_CALENDAR:
            unit = NAMED_CALENDAR[room_raw]
        elif room_raw and room_raw.isdigit():
            unit = str(int(room_raw))
            if unit in ("4", "20"):
                issues.append("invalid_room_code")
        elif room_raw:
            issues.append(f"unknown_room:{room_raw}")
        else:
            issues.append("no_room_row")

        # Department row headers in cols A–B (Via I / Tilo / Romerito / Esquinita):
        # physical-unit labels for the calendar sheet — NOT reservations.
        is_unit_header = (
            m.max_col <= 2
            and room_raw in NAMED_CALENDAR
            and not comment
            and (is_label or not guest)
        )
        # Empty accidental merges (e.g. J31:K31) — not a booking; drop from import/ambiguous.
        is_spurious_empty = (
            not is_unit_header
            and not guest
            and not comment
            and not is_label
        )

        if is_unit_header:
            rows.append(
                {
                    "source": "Libro de reservas",
                    "sourceRef": str(m),
                    "unit": unit or "",
                    "roomRaw": room_raw,
                    "checkIn": "",
                    "checkOut": "",
                    "guest": "",
                    "status": "",
                    "price": "",
                    "notes": f"Unit header row for department {unit or room_raw}",
                    "channel": "",
                    "doNotMove": False,
                    "adults": None,
                    "confidence": "n/a",
                    "classification": "unit_header",
                    "issues": [],
                    "parseNotes": [
                        "julian: department row header (calendar label), not a reservation",
                    ],
                    "raw": {"cellValue": val, "comment": comment},
                }
            )
            continue

        if is_spurious_empty:
            rows.append(
                {
                    "source": "Libro de reservas",
                    "sourceRef": str(m),
                    "unit": unit or "",
                    "roomRaw": room_raw,
                    "checkIn": "",
                    "checkOut": "",
                    "guest": "",
                    "status": "",
                    "price": "",
                    "notes": "Spurious empty merge — not a reservation",
                    "channel": "",
                    "doNotMove": False,
                    "adults": None,
                    "confidence": "n/a",
                    "classification": "ignore",
                    "issues": ["spurious_empty_merge"],
                    "parseNotes": [
                        "julian: wrongly merged empty cells; drop from ambiguous/import",
                    ],
                    "raw": {"cellValue": val, "comment": comment},
                }
            )
            continue

        if cin and d_start and abs((cin - d_start).days) > 1:
            notes.append(f"merge_in_differs_from_comment:{d_start}vs{cin}")
        if cout and merge_out and abs((cout - merge_out).days) > 1:
            notes.append(f"merge_out_differs_from_comment:{merge_out}vs{cout}")

        check_in = cin or d_start
        check_out = cout or merge_out
        if not check_in or not check_out:
            issues.append("no_dates")
        elif check_in >= check_out:
            issues.append("out_before_in")

        adults = None
        if guest:
            pm = PAX_RE.search(guest)
            if pm:
                adults = int(pm.group(1))

        do_not_move = bool(
            (comment and NO_MOVER_RE.search(comment))
            or (isinstance(val, str) and NO_MOVER_RE.search(val))
        )
        channel = "Booking" if (comment and BOOKING_RE.search(comment)) else "Excel"

        confidence = "recoverable" if not issues else "ambiguous"
        row = {
            "source": "Libro de reservas",
            "sourceRef": str(m),
            "unit": unit or "",
            "roomRaw": room_raw,
            "checkIn": check_in.isoformat() if check_in else "",
            "checkOut": check_out.isoformat() if check_out else "",
            "dateSource": "comment" if cin else ("merge_seq" if d_start else None),
            "guest": guest or "",
            "status": "CONFIRMADA",
            "price": "",
            "notes": (comment or "")[:2000],
            "channel": channel,
            "doNotMove": do_not_move,
            "adults": adults,
            "confidence": "high" if confidence == "recoverable" else "low",
            "classification": confidence,
            "issues": issues,
            "parseNotes": notes,
            "raw": {"cellValue": val, "comment": comment},
        }
        apply_money_fields(row, money)
        rows.append(row)

    # Emit unit_header for named dept rows whose label isn't an A:B merge (e.g. A42 Romerito).
    header_units = {
        r.get("unit") for r in rows if r.get("classification") == "unit_header"
    }
    for row_idx, room_raw in rooms.items():
        if room_raw not in NAMED_CALENDAR:
            continue
        unit = NAMED_CALENDAR[room_raw]
        if unit in header_units:
            continue
        rows.append(
            {
                "source": "Libro de reservas",
                "sourceRef": f"A{row_idx}",
                "unit": unit,
                "roomRaw": room_raw,
                "checkIn": "",
                "checkOut": "",
                "guest": "",
                "status": "",
                "price": "",
                "notes": f"Unit header cell for department {unit}",
                "channel": "",
                "doNotMove": False,
                "adults": None,
                "confidence": "n/a",
                "classification": "unit_header",
                "issues": [],
                "parseNotes": [
                    "julian: department row header cell (not merged A:B), not a reservation",
                ],
                "raw": {"cellValue": room_raw, "comment": None},
            }
        )
    return rows


def extract_reservas(ws) -> list[dict]:
    rows: list[dict] = []
    for r in range(2, ws.max_row + 1):
        vals = [ws.cell(r, c).value for c in range(1, 11)]
        if not any(v is not None and str(v).strip() for v in vals):
            continue
        rid, room, first, last, cin, cout, pax, plan, estado, obs = vals
        room_s = str(room).strip() if room not in (None, "") else None
        if room_s and room_s.endswith(".0"):
            room_s = room_s[:-2]

        issues: list[str] = []
        unit = None
        if not room_s:
            issues.append("missing_room")
        elif room_s in NAMED_RESERVAS:
            unit = NAMED_RESERVAS[room_s]
        elif room_s.isdigit():
            unit = str(int(room_s))
            if unit in ("4", "20"):
                issues.append("invalid_room")
        else:
            issues.append(f"unknown_room:{room_s}")

        cin_d = cin.date() if isinstance(cin, datetime) else None
        cout_d = cout.date() if isinstance(cout, datetime) else None
        if not cin_d or not cout_d:
            issues.append("missing_dates")
        elif cin_d >= cout_d:
            issues.append("out_before_in")

        first_s = str(first).strip() if first else ""
        last_s = str(last).strip() if last else ""
        if not first_s and not last_s:
            issues.append("missing_guest")

        # ID-only placeholders (#00071…)
        if rid and not room_s and not cin_d and not cout_d and not first_s and not last_s:
            classification = "noise"
            issues = ["id_only_placeholder"]
        elif issues:
            classification = "ambiguous"
        else:
            classification = "recoverable"

        guest = f"{first_s} {last_s}".strip()
        adults = None
        if isinstance(pax, (int, float)):
            adults = int(pax)
        elif isinstance(pax, str) and pax.strip():
            pm = PAX_RE.search(pax)
            adults = int(pm.group(1)) if pm else None

        obs_s = str(obs).strip() if obs else ""
        do_not_move = bool(obs_s and NO_MOVER_RE.search(obs_s))
        service = PLAN_MAP.get(str(plan).strip() if plan else "", None)
        status = ESTADO_MAP.get(str(estado).strip() if estado else "", "PRERRESERVA")

        rows.append(
            {
                "source": "Reservas",
                "sourceRef": f"row:{r}",
                "sourceLine": r,
                "excelId": rid,
                "unit": unit or "",
                "roomRaw": room_s,
                "checkIn": cin_d.isoformat() if cin_d else "",
                "checkOut": cout_d.isoformat() if cout_d else "",
                "guest": guest,
                "firstName": first_s,
                "lastName": last_s,
                "status": status,
                "paymentHint": str(estado).strip() if estado else "",
                "serviceType": service,
                "price": "",
                "notes": obs_s,
                "channel": "Excel",
                "doNotMove": do_not_move,
                "adults": adults,
                "confidence": "high" if classification == "recoverable" else "low",
                "classification": classification,
                "issues": issues,
                "raw": {
                    "habitacion": room_s,
                    "plan": plan,
                    "estado": estado,
                    "pax": pax,
                },
            }
        )
    return rows


def extract_waitlist(ws) -> list[dict]:
    """
    Sheet "Lista de espera Via I" is a *waitlist for* the Via I apartment
    (and sometimes Esquinita), NOT the Via I department bookings themselves.

    Real VIA_I reservations live on:
      - Libro de reservas row "via I" → unit code VIA_I
      - Reservas sheet Habitación = "Vía I"
    Those are extracted as normal recoverable rows elsewhere.
    """
    rows: list[dict] = []
    for r in range(2, ws.max_row + 1):
        vals = [ws.cell(r, c).value for c in range(1, 7)]
        if not any(v is not None and str(v).strip() for v in vals):
            continue
        rows.append(
            {
                "source": "Lista de espera Via I",
                "sourceRef": f"row:{r}",
                "unit": "",
                "guest": str(vals[0]).strip() if vals[0] else "",
                "stayHint": str(vals[1]).strip() if vals[1] else "",
                "requestedAt": vals[2].date().isoformat()
                if isinstance(vals[2], datetime)
                else (str(vals[2]) if vals[2] else ""),
                "channel": str(vals[3]).strip() if vals[3] else "",
                "notes": str(vals[4]).strip() if vals[4] else "",
                "contact": str(vals[5]).strip() if vals[5] else "",
                "classification": "waitlist",
                "confidence": "low",
                "issues": [
                    "waitlist_not_via_i_booking",
                    "waitlist_manual_review",
                ],
                "parseNotes": [
                    "Hoja = lista de espera (aspirantes). Reservas reales de Vía I "
                    "están en Libro fila via I / Reservas Habitación=Vía I (unidad VIA_I)."
                ],
            }
        )
    return rows


def reclassify(row: dict) -> dict:
    """Recompute confidence after manual date corrections."""
    issues = list(row.get("issues") or [])
    # Drop date issues if dates are now valid
    cin = row.get("checkIn") or ""
    cout = row.get("checkOut") or ""
    if cin and cout and cin < cout:
        issues = [i for i in issues if i not in ("out_before_in", "no_dates", "missing_dates")]
    row["issues"] = issues

    if row.get("classification") in ("waitlist", "noise", "unit_header", "ignore"):
        return row
    if issues:
        row["classification"] = "ambiguous"
        row["confidence"] = "low"
    else:
        # Still need identity for merges/reservas
        if row.get("source") == "Libro de reservas":
            if not row.get("unit") or (not row.get("guest") and not (row.get("raw") or {}).get("comment")):
                row["classification"] = "ambiguous"
                row["confidence"] = "low"
                return row
        if row.get("source") == "Reservas":
            if not row.get("unit") or not cin or not cout:
                row["classification"] = "ambiguous"
                row["confidence"] = "low"
                return row
        row["classification"] = "recoverable"
        row["confidence"] = "high"
    return row


def apply_julian_corrections(rows: list[dict]) -> list[dict]:
    """
    Corrections from Julián review 2026-10-28.
    Applied on extracted rows (source Excel left intact).
    """
    applied: list[str] = []
    for row in rows:
        src = row.get("source")
        ref = row.get("sourceRef")
        guest = (row.get("guest") or "").lower()
        last = (row.get("lastName") or "").lower()
        notes = list(row.get("parseNotes") or [])

        # 1) Libro CC12:CI13 Silvia Paiges — out year typo 2025 → 2027
        if src == "Libro de reservas" and ref == "CC12:CI13":
            row["checkOut"] = "2027-02-08"
            row["checkIn"] = row.get("checkIn") or "2027-02-01"
            row["dateSource"] = "julian_correction"
            notes.append("julian: out 2025→2027-02-08")
            applied.append(f"Paiges Libro {ref} out→2027-02-08")

        # 2) Reservas row 39 Ernesto Catani — out year typo 2026 → 2027
        if src == "Reservas" and ref == "row:39":
            row["checkOut"] = "2027-03-02"
            row["checkIn"] = row.get("checkIn") or "2027-02-25"
            notes.append("julian: out 2026-03-02→2027-03-02")
            applied.append("Catani Reservas row:39 out→2027-03-02")

        # 3) Marchese Dec cluster — all Dec-2026 / broken same-day → 23–26 Dec
        #    Keep separate Feb-2027 stay on room 25 (#00053 / Libro CN28:DD28).
        is_marchese = "marchese" in guest or last == "marchese"
        if is_marchese:
            cin = row.get("checkIn") or ""
            cout = row.get("checkOut") or ""
            is_feb_2027_stay = cin.startswith("2027-02") or cin.startswith("2027-03")
            is_dec_cluster = (
                cin.startswith("2026-12")
                or cout.startswith("2026-12")
                or "out_before_in" in (row.get("issues") or [])
            )
            if is_dec_cluster and not is_feb_2027_stay:
                row["checkIn"] = "2026-12-23"
                row["checkOut"] = "2026-12-26"
                notes.append("julian: Marchese Dec stay → 2026-12-23..2026-12-26")
                applied.append(f"Marchese {src} {ref} → 2026-12-23..26")

        row["parseNotes"] = notes
        reclassify(row)

    # stash on a sentinel for logging (main reads applied list via return side)
    for row in rows:
        if row is rows[0]:
            row.setdefault("raw", {})
    print(f"Julián corrections applied: {len(applied)}")
    for a in applied:
        print(f"  - {a}")
    return rows


def write_report(payload: dict, path: Path) -> None:
    rows = payload["rows"]
    skip_cls = {"noise", "unit_header", "ignore"}
    amb = [
        r
        for r in rows
        if r.get("classification") in ("ambiguous", "waitlist")
        or (
            r.get("confidence") not in ("high", "n/a")
            and r.get("classification") not in skip_cls
        )
    ]
    noise = [r for r in rows if r.get("classification") == "noise"]
    headers = [r for r in rows if r.get("classification") == "unit_header"]
    ignored = [r for r in rows if r.get("classification") == "ignore"]
    lines = [
        "# Informe de datos ambiguos (no importar en silencio)",
        "",
        f"Generado: {payload['extractedAt']}",
        f"Fuente: `{payload['sourceFile']}`",
        f"SHA-256: `{payload['sourceSha256']}`",
        "",
        f"Total filas extractadas: **{len(rows)}**",
        f"- Recoverable (`confidence=high`): **{payload['counts']['recoverable']}**",
        f"- Ambiguous / waitlist: **{payload['counts']['ambiguous'] + payload['counts']['waitlist']}**",
        f"- Unit headers (dept rows): **{payload['counts'].get('unitHeaders', len(headers))}**",
        f"- Ignored (spurious merges): **{payload['counts'].get('ignored', len(ignored))}**",
        f"- Noise (placeholders): **{payload['counts']['noise']}**",
        "",
        "## Por hoja",
        "",
        f"- Libro de reservas (merges): recoverable **{payload['counts']['mergesRecoverable']}** · ambiguous **{payload['counts']['mergesAmbiguous']}** · comments **{payload['counts']['mergeComments']}**",
        f"- Reservas (tabla): recoverable **{payload['counts']['reservasRecoverable']}** · ambiguous **{payload['counts']['reservasAmbiguous']}** · noise **{payload['counts']['noise']}**",
        f"- Lista de espera Vía I: **{payload['counts']['waitlist']}**",
        "",
        "## Filas ambiguous / waitlist",
        "",
        "| Fuente | Ref | Unidad | In | Out | Huésped | Issues |",
        "|---|---|---|---|---|---|---|",
    ]
    for r in amb:
        if r.get("classification") in skip_cls:
            continue
        notes = "; ".join(r.get("issues") or [])
        lines.append(
            f"| {r.get('source','')} | {r.get('sourceRef','')} | {r.get('unit') or r.get('roomRaw') or '∅'} | "
            f"{r.get('checkIn') or r.get('stayHint') or '∅'} | {r.get('checkOut') or '∅'} | "
            f"{(r.get('guest') or '∅').replace('|','/')} | {notes.replace('|','/')} |"
        )
    if not any(r.get("classification") == "ambiguous" for r in amb):
        lines.append("| — | — | — | — | — | — | *(ninguna fila ambiguous)* |")

    wait = [r for r in rows if r.get("classification") == "waitlist"]
    via_bookings = [
        r
        for r in rows
        if r.get("unit") == "VIA_I" and r.get("classification") == "recoverable"
    ]
    lines += [
        "",
        "## Unit headers (filas de depto en el Libro)",
        "",
        "A40:B40 / A41 / A42 / A43 son **rótulos de unidad física** del calendario "
        "(Via I, Tilo, Romerito, La Esquinita) — no reservas ni waitlist.",
        "",
        "| Ref | roomRaw | unit seed |",
        "|---|---|---|",
    ]
    for r in headers:
        lines.append(
            f"| {r.get('sourceRef')} | {r.get('roomRaw')} | {r.get('unit')} |"
        )
    lines.append("")
    lines.append(
        "Nota: `A42` (Romerito) no está mergeado A:B; es celda de encabezado de fila. "
        "Las reservas de esa fila son merges de fechas (p. ej. `D42:J42`)."
    )
    lines += [
        "",
        "## Ignored (merges vacíos espurios)",
        "",
        "Merges vacíos sin huésped/comentario (p. ej. `J31:K31`) — **no** son reservas; "
        "excluidos de ambiguous e import.",
        "",
        "| Ref | roomRaw | Nota |",
        "|---|---|---|",
    ]
    for r in ignored:
        lines.append(
            f"| {r.get('sourceRef')} | {r.get('roomRaw') or '∅'} | {'; '.join(r.get('parseNotes') or r.get('issues') or [])} |"
        )
    lines += [
        "",
        "## Noise (ID-only placeholders)",
        "",
        f"{len(noise)} filas solo con ID de reserva y sin datos — no importar.",
        "",
        "## Vía I: waitlist vs reservas del depto (Julián)",
        "",
        "La hoja **«Lista de espera Via I»** no son reservas del departamento Vía I.",
        "Es una **lista de espera** (aspirantes que quieren Esq./Vía si se libera).",
        f"Esas **{len(wait)}** filas siguen en `waitlist` → Consultas / carga manual.",
        "",
        f"Las reservas reales del depto (`unit=VIA_I`) ya están como recoverable: **{len(via_bookings)}** "
        "(Libro fila `via I` + hoja Reservas `Habitación=Vía I`).",
        "",
        "## Correcciones Julián",
        "",
        "### 2026-10-28 (fechas)",
        "",
        "- Libro `CC12:CI13` Silvia Paiges: out **2027-02-08**.",
        "- Reservas row 39 Ernesto Catani: out **2027-03-02**.",
        "- Marchese (estadía dic): **in 2026-12-23 / out 2026-12-26**.",
        "  La estadía febrero 2027 en hab. 25 se mantiene aparte.",
        "",
        "### 2026-10-28 (estructura Libro)",
        "",
        "- `J31:K31`: merge vacío espurio → `ignore` (no reserva).",
        "- `A40:B40`, `A41`, `A42`, `A43`: headers de depto → `unit_header`.",
        "",
        "## Money from comments",
        "",
        f"- Recoverable con `agreedPriceArs`: **{payload['counts'].get('withAgreedPrice', 0)}**",
        f"- Recoverable con ≥1 payment parseado: **{payload['counts'].get('withPayments', 0)}** "
        f"({payload['counts'].get('paymentsExtracted', 0)} pagos)",
        f"- Filas Reservas enriquecidas desde Libro: **{payload['counts'].get('reservasEnrichedFromLibro', 0)}**",
        "",
        "Patrones: ver `docs/migration/excel-money-patterns.md`.",
        "",
        "## Acción requerida",
        "",
        "- Revisar ambiguous restantes (si hay) antes de `ALLOW_EXCEL_SEED=1`.",
        "- `unit_header` / `ignore` / waitlist / noise **nunca** entran al seed.",
        "- Deptos: `D1` (Tilo), `D2` (Romerito), `D3` (Esquinita), `VIA_I`.",
        "- Pagos USD sin FX / seña en blanco / totales multi-hab quedan en `moneyHints`/`moneyWarnings`.",
        "",
    ]
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    xlsx = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_XLSX
    if not xlsx.exists():
        print(f"Excel not found: {xlsx}", file=sys.stderr)
        sys.exit(1)

    digest = sha256(xlsx)
    wb = openpyxl.load_workbook(xlsx)
    merges = extract_merges(wb["Libro de reservas"])
    reservas = extract_reservas(wb[" Reservas"])
    waitlist = extract_waitlist(wb["Lista de espera Via I"])
    all_rows = apply_julian_corrections(merges + reservas + waitlist)
    enrich_reservas_with_libro_money(all_rows)

    # refresh sheet-level counts after corrections
    merges = [r for r in all_rows if r.get("source") == "Libro de reservas"]
    reservas = [r for r in all_rows if r.get("source") == "Reservas"]
    waitlist = [r for r in all_rows if r.get("source") == "Lista de espera Via I"]
    recoverable = [r for r in all_rows if r.get("classification") == "recoverable"]

    counts = {
        "recoverable": len(recoverable),
        "ambiguous": sum(1 for r in all_rows if r.get("classification") == "ambiguous"),
        "noise": sum(1 for r in all_rows if r.get("classification") == "noise"),
        "waitlist": sum(1 for r in all_rows if r.get("classification") == "waitlist"),
        "unitHeaders": sum(1 for r in all_rows if r.get("classification") == "unit_header"),
        "ignored": sum(1 for r in all_rows if r.get("classification") == "ignore"),
        "mergesRecoverable": sum(1 for r in merges if r["classification"] == "recoverable"),
        "mergesAmbiguous": sum(1 for r in merges if r["classification"] == "ambiguous"),
        "mergeComments": sum(1 for r in merges if r.get("raw", {}).get("comment")),
        "reservasRecoverable": sum(1 for r in reservas if r["classification"] == "recoverable"),
        "reservasAmbiguous": sum(1 for r in reservas if r["classification"] == "ambiguous"),
        "bodyMerges": len(merges),
        "viaIBookingsRecoverable": sum(
            1 for r in all_rows if r.get("unit") == "VIA_I" and r.get("classification") == "recoverable"
        ),
        "withAgreedPrice": sum(1 for r in recoverable if r.get("agreedPriceArs")),
        "withPayments": sum(1 for r in recoverable if r.get("payments")),
        "paymentsExtracted": sum(len(r.get("payments") or []) for r in recoverable),
        "reservasEnrichedFromLibro": sum(
            1
            for r in reservas
            if r.get("classification") == "recoverable"
            and any("enriched_from_libro" in h for h in (r.get("moneyHints") or []))
        ),
    }

    payload = {
        "extractedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "sourceFile": str(xlsx.name),
        "sourceSha256": digest,
        "counts": counts,
        "julianCorrections": "2026-10-28",
        "rows": all_rows,
        # Back-compat for older import-staging.ts (expects rows[].confidence)
        "compat": "migration-v2-excel-merges-comments",
    }

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    write_report(payload, OUT_REPORT)

    print(f"Extracted {len(all_rows)} rows → {OUT_JSON}")
    print(
        f"recoverable={counts['recoverable']} ambiguous={counts['ambiguous']} "
        f"noise={counts['noise']} waitlist={counts['waitlist']}"
    )
    print(f"merges: {counts['mergesRecoverable']} recoverable / {counts['mergesAmbiguous']} ambiguous "
          f"({counts['mergeComments']} comments)")
    print(f"Wrote {OUT_REPORT}")
    print("issue tally (ambiguous):", dict(Counter(i for r in all_rows if r.get("classification") == "ambiguous" for i in r.get("issues") or [])))


if __name__ == "__main__":
    main()
