"use client";

import { useMemo, useState } from "react";
import { setUnitAttributesAction } from "@/app/actions/inventory";

type Attr = { id: string; label: string };
type UnitOpt = {
  id: string;
  code: string;
  name: string;
  attributeIds: string[];
};

export function UnitAttributesForm({
  units,
  attributes,
}: {
  units: UnitOpt[];
  attributes: Attr[];
}) {
  const [unitId, setUnitId] = useState(units[0]?.id ?? "");
  const selectedUnit = useMemo(
    () => units.find((u) => u.id === unitId) ?? null,
    [units, unitId],
  );
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(units[0]?.attributeIds ?? []),
  );

  function onUnitChange(id: string) {
    setUnitId(id);
    const u = units.find((x) => x.id === id);
    setChecked(new Set(u?.attributeIds ?? []));
  }

  return (
    <form action={setUnitAttributesAction} className="space-y-3">
      <select
        className="select max-w-md"
        name="unitId"
        required
        value={unitId}
        onChange={(e) => onUnitChange(e.target.value)}
      >
        {units.map((u) => (
          <option key={u.id} value={u.id}>
            {u.code} · {u.name}
          </option>
        ))}
      </select>
      <div className="flex flex-wrap gap-3">
        {attributes.map((a) => {
          const on = checked.has(a.id);
          return (
            <label
              key={a.id}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                on
                  ? "border-[var(--brand)] bg-[#e8f5f4]"
                  : "border-[var(--line)] bg-white/70"
              }`}
            >
              <input
                type="checkbox"
                name="attributeIds"
                value={a.id}
                checked={on}
                onChange={() => {
                  setChecked((prev) => {
                    const next = new Set(prev);
                    if (next.has(a.id)) next.delete(a.id);
                    else next.add(a.id);
                    return next;
                  });
                }}
              />
              {a.label}
            </label>
          );
        })}
        {attributes.length === 0 ? (
          <span className="text-sm text-[var(--muted)]">
            Primero creá características arriba.
          </span>
        ) : null}
      </div>
      {selectedUnit ? (
        <p className="text-xs text-[var(--muted)]">
          Editando {selectedUnit.code}: se guardan exactamente las marcadas.
        </p>
      ) : null}
      <button className="btn btn-primary" type="submit" disabled={!unitId}>
        Guardar características
      </button>
    </form>
  );
}
