import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("AppShell Admin nav", () => {
  it("hides Admin link for non-ADMIN via role filter", () => {
    const src = readFileSync(
      join(__dirname, "../src/components/AppShell.tsx"),
      "utf8",
    );
    expect(src).toMatch(/adminOnly:\s*true/);
    expect(src).toMatch(/user\.role === ["']ADMIN["']/);
    expect(src).toMatch(/navItems/);
  });
});
