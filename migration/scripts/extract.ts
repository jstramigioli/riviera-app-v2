/**
 * Extract reservations from a normalized CSV into staging JSON.
 * Expected CSV headers (flexible):
 * unit,checkIn,checkOut,guest,status,price,notes,channel
 */
import fs from "fs";
import path from "path";

const root = path.join(process.cwd(), "migration");
const inputDir = path.join(root, "staging", "input");
const outFile = path.join(root, "staging", "extracted.json");

type RawRow = Record<string, string>;

function parseCsv(text: string): RawRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    const row: RawRow = {};
    headers.forEach((h, i) => {
      row[h] = (cols[i] ?? "").trim();
    });
    return row;
  });
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQ = !inQ;
    } else if (ch === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function confidence(row: RawRow): "high" | "low" {
  const unit = row.unit || row.habitacion || row.hab || "";
  const checkIn = row.checkin || row.entrada || row.from || "";
  const checkOut = row.checkout || row.salida || row.to || "";
  if (!unit || !checkIn || !checkOut) return "low";
  if (/[?\*]/.test(unit) || unit.toLowerCase().includes("ver nota")) return "low";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) return "low";
  return "high";
}

function main() {
  fs.mkdirSync(inputDir, { recursive: true });
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const files = fs.readdirSync(inputDir).filter((f) => f.endsWith(".csv"));
  if (files.length === 0) {
    const sample = path.join(inputDir, "sample.csv");
    if (!fs.existsSync(sample)) {
      fs.writeFileSync(
        sample,
        "unit,checkIn,checkOut,guest,status,price,notes,channel\n1,2026-12-01,2026-12-05,Perez Ana,CONFIRMADA,450000,demo,WhatsApp\n?,2026-12-10,2026-12-15,Ver nota,PRERRESERVA,,ver nota excel,Tel\n",
      );
      console.log("Created sample CSV at", sample);
    }
  }

  const all = fs
    .readdirSync(inputDir)
    .filter((f) => f.endsWith(".csv"))
    .flatMap((f) => {
      const text = fs.readFileSync(path.join(inputDir, f), "utf8");
      return parseCsv(text).map((row, idx) => ({
        sourceFile: f,
        sourceLine: idx + 2,
        unit: row.unit || row.habitacion || row.hab || "",
        checkIn: row.checkin || row.entrada || row.from || "",
        checkOut: row.checkout || row.salida || row.to || "",
        guest: row.guest || row.huesped || row.nombre || "",
        status: (row.status || row.estado || "CONSULTA").toUpperCase(),
        price: row.price || row.precio || "",
        notes: row.notes || row.notas || "",
        channel: row.channel || row.canal || "",
        confidence: confidence(row),
        raw: row,
      }));
    });

  fs.writeFileSync(outFile, JSON.stringify({ extractedAt: new Date().toISOString(), rows: all }, null, 2));
  console.log(`Extracted ${all.length} rows → ${outFile}`);
  console.log(
    `high=${all.filter((r) => r.confidence === "high").length} low=${all.filter((r) => r.confidence === "low").length}`,
  );
}

main();
