import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Enlaces de texto navegables", () => {
  it("define clases text-link y text-link-back con subrayado y hover", () => {
    const css = readFileSync(join(__dirname, "../src/app/globals.css"), "utf8");
    expect(css).toMatch(/a\.text-link\s*\{/);
    expect(css).toMatch(/a\.text-link-back\s*\{/);
    expect(css).toMatch(/text-decoration:\s*underline/);
    expect(css).toMatch(/a\.text-link:hover/);
    expect(css).toMatch(/a\.text-link-back:hover/);
  });

  it("el nombre del huésped en detalle de reserva usa text-link hacia /huespedes", () => {
    const src = readFileSync(
      join(__dirname, "../src/app/(app)/reservas/[id]/page.tsx"),
      "utf8",
    );
    expect(src).toMatch(
      /href=\{`\/huespedes\/\$\{rg\.guestId\}`\}[^>]*className="text-link/,
    );
  });
});
