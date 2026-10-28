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
TARIFA_RE = re.compile(r"Tarifa\s*x\s*d[:\s]*\$?\s*([\d.]+)", re.I)
TOTAL_RE = re.compile(r"Total\s*x\s*\d+\s*d[:\s]*\$?\s*([\d.]+)", re.I)
NO_MOVER_RE = re.compile(r"no\s*mover", re.I)
BOOKING_RE = re.compile(r"Booking", re.I)
PAX_RE = re.compile(r"x\s*(\d+)", re.I)


def parse_year(y: str) -> int:
    n = int(y)
    return n + 2000 if n < 100 else n


def parse_money(s: str) -> int | None:
    try:
        return int(s.replace(".", "").replace(" ", ""))
    except ValueError:
        return None


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
        tarifa = total = None
        if comment:
            mo = IN_OUT_RE.search(comment)
            if mo:
                d1, m1, y1, d2, m2, y2 = mo.groups()
                cin = date(parse_year(y1), int(m1), int(d1))
                cout = date(parse_year(y2), int(m2), int(d2))
            tm = TARIFA_RE.search(comment)
            if tm:
                tarifa = parse_money(tm.group(1))
            tt = TOTAL_RE.search(comment)
            if tt:
                total = parse_money(tt.group(1))

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
        if not room_raw:
            issues.append("no_room_row")
        elif room_raw in NAMED_CALENDAR:
            unit = NAMED_CALENDAR[room_raw]
        elif room_raw.isdigit():
            unit = str(int(room_raw))
            if unit in ("4", "20"):
                issues.append("invalid_room_code")
        else:
            issues.append(f"unknown_room:{room_raw}")

        if (not guest) and not comment:
            issues.append("empty_or_label_only")
        if is_label and not comment:
            issues.append("row_label_not_booking")

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
        rows.append(
            {
                "source": "Libro de reservas",
                "sourceRef": str(m),
                "unit": unit or "",
                "roomRaw": room_raw,
                "checkIn": check_in.isoformat() if check_in else "",
                "checkOut": check_out.isoformat() if check_out else "",
                "dateSource": "comment" if cin else ("merge_seq" if d_start else None),
                "guest": guest or "",
                "status": "CONFIRMADA",
                "price": str(total) if total is not None else "",
                "nightlyRateArs": tarifa,
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

    if row.get("classification") in ("waitlist", "noise"):
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
    amb = [r for r in rows if r.get("classification") in ("ambiguous", "waitlist") or r.get("confidence") != "high"]
    noise = [r for r in rows if r.get("classification") == "noise"]
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
        if r.get("classification") == "noise":
            continue
        notes = "; ".join(r.get("issues") or [])
        lines.append(
            f"| {r.get('source','')} | {r.get('sourceRef','')} | {r.get('unit') or r.get('roomRaw') or '∅'} | "
            f"{r.get('checkIn') or r.get('stayHint') or '∅'} | {r.get('checkOut') or '∅'} | "
            f"{(r.get('guest') or '∅').replace('|','/')} | {notes.replace('|','/')} |"
        )
    wait = [r for r in rows if r.get("classification") == "waitlist"]
    via_bookings = [
        r
        for r in rows
        if r.get("unit") == "VIA_I" and r.get("classification") == "recoverable"
    ]
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
        "## Correcciones Julián (2026-10-28)",
        "",
        "- Libro `CC12:CI13` Silvia Paiges: out **2027-02-08** (año mal en comentario).",
        "- Reservas row 39 Ernesto Catani: out **2027-03-02**.",
        "- Marchese (estadía dic): **in 2026-12-23 / out 2026-12-26** (incluye filas same-day).",
        "  La estadía febrero 2027 en hab. 25 se mantiene aparte.",
        "",
        "## Acción requerida",
        "",
        "- Revisar ambiguous restantes con recepción antes de `ALLOW_EXCEL_SEED=1`.",
        "- Fechas del calendario: preferir **comentarios** (`In:`/`Out:`) + correcciones Julián.",
        "- Deptos: `D1` (Tilo), `D2` (Romerito), `D3` (Esquinita), `VIA_I`.",
        "- Waitlist → Consultas / carga manual (no son bookings de `VIA_I`).",
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

    # refresh sheet-level counts after corrections
    merges = [r for r in all_rows if r.get("source") == "Libro de reservas"]
    reservas = [r for r in all_rows if r.get("source") == "Reservas"]
    waitlist = [r for r in all_rows if r.get("source") == "Lista de espera Via I"]

    counts = {
        "recoverable": sum(1 for r in all_rows if r.get("classification") == "recoverable"),
        "ambiguous": sum(1 for r in all_rows if r.get("classification") == "ambiguous"),
        "noise": sum(1 for r in all_rows if r.get("classification") == "noise"),
        "waitlist": sum(1 for r in all_rows if r.get("classification") == "waitlist"),
        "mergesRecoverable": sum(1 for r in merges if r["classification"] == "recoverable"),
        "mergesAmbiguous": sum(1 for r in merges if r["classification"] == "ambiguous"),
        "mergeComments": sum(1 for r in merges if r.get("raw", {}).get("comment")),
        "reservasRecoverable": sum(1 for r in reservas if r["classification"] == "recoverable"),
        "reservasAmbiguous": sum(1 for r in reservas if r["classification"] == "ambiguous"),
        "bodyMerges": len(merges),
        "viaIBookingsRecoverable": sum(
            1 for r in all_rows if r.get("unit") == "VIA_I" and r.get("classification") == "recoverable"
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
