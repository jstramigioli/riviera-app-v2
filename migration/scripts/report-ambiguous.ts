import fs from "fs";
import path from "path";

const extractedPath = path.join(process.cwd(), "migration/staging/extracted.json");
const outPath = path.join(process.cwd(), "migration/staging/ambiguous-report.md");

type Row = {
  sourceFile: string;
  sourceLine: number;
  unit: string;
  checkIn: string;
  checkOut: string;
  guest: string;
  notes: string;
  confidence: string;
};

function main() {
  if (!fs.existsSync(extractedPath)) {
    console.error("Run npm run migration:extract first");
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(extractedPath, "utf8")) as {
    extractedAt: string;
    rows: Row[];
  };
  const low = data.rows.filter((r) => r.confidence !== "high");
  const lines = [
    "# Informe de datos ambiguos (no importar en silencio)",
    "",
    `Generado: ${new Date().toISOString()}`,
    `Extracción: ${data.extractedAt}`,
    `Total filas: ${data.rows.length} · Ambiguas: ${low.length}`,
    "",
    "| Archivo | Línea | Unidad | In | Out | Huésped | Notas |",
    "|---|---:|---|---|---|---|---|",
    ...low.map(
      (r) =>
        `| ${r.sourceFile} | ${r.sourceLine} | ${r.unit || "∅"} | ${r.checkIn || "∅"} | ${r.checkOut || "∅"} | ${r.guest || "∅"} | ${(r.notes || "").replace(/\|/g, "/")} |`,
    ),
    "",
    "## Acción requerida",
    "",
    "- Resolver cada fila con recepción antes del import staging.",
    "- Tras corrección, re-correr extract + report.",
    "- Solo `confidence=high` entra a `migration:import-staging`.",
    "",
  ];
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join("\n"));
  console.log(`Wrote ${outPath} (${low.length} ambiguous)`);
}

main();
