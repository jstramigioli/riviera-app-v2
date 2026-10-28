"use client";

import { useMemo, useState, useTransition } from "react";
import type { ServiceType } from "@prisma/client";
import {
  copyPeriodAction,
  createPeriodAction,
  deletePeriodAction,
  savePeriodMatrixAction,
  updatePeriodMetaAction,
} from "@/app/actions/rates";
import { FieldLabel, HelpTooltip } from "@/components/HelpTooltip";
import { SERVICE_TYPE_LABEL, formatArsPlain } from "@/lib/labels";
import type { PeriodOverlap, PeriodWithMatrix } from "@/lib/rates";

type Category = { id: string; code: string; name: string; sortOrder: number };

type Props = {
  initialPeriods: PeriodWithMatrix[];
  overlaps: PeriodOverlap[];
  categories: Category[];
  serviceTypes: ServiceType[];
  canEdit: boolean;
};

type DraftCells = Record<string, string>; // key = `${periodId}:${catId}:${service}` → amount string or ""

function cellKey(periodId: string, catId: string, service: ServiceType) {
  return `${periodId}:${catId}:${service}`;
}

export function TarifasBoard({
  initialPeriods,
  overlaps,
  categories,
  serviceTypes,
  canEdit,
}: Props) {
  const [periods, setPeriods] = useState(initialPeriods);
  const [selectedId, setSelectedId] = useState(periods[0]?.id ?? "");
  const [draft, setDraft] = useState<DraftCells>(() => buildDraft(initialPeriods));
  const [dirtyPeriods, setDirtyPeriods] = useState<Set<string>>(new Set());
  const [mobileService, setMobileService] = useState<ServiceType>(serviceTypes[0] ?? "DESAYUNO");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [showCreate, setShowCreate] = useState(false);
  const [bulkValue, setBulkValue] = useState("");
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());

  const selected = periods.find((p) => p.id === selectedId) ?? periods[0] ?? null;

  const localOverlaps = useMemo(() => overlaps, [overlaps]);

  function markDirty(periodId: string, key: string, value: string) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setDirtyPeriods((prev) => new Set(prev).add(periodId));
    setMessage(null);
  }

  function toggleCellSelect(key: string) {
    setSelectedCells((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function applyBulkFill() {
    if (!selected || !canEdit) return;
    const amount = bulkValue.trim() === "" ? "" : bulkValue;
    if (amount !== "" && !(Number(amount) > 0)) {
      setError("El monto debe ser mayor a 0");
      return;
    }
    const keys =
      selectedCells.size > 0
        ? [...selectedCells].filter((k) => k.startsWith(`${selected.id}:`))
        : serviceTypes.flatMap((st) =>
            categories.map((c) => cellKey(selected.id, c.id, st)),
          );
    setDraft((prev) => {
      const next = { ...prev };
      for (const k of keys) next[k] = amount;
      return next;
    });
    setDirtyPeriods((prev) => new Set(prev).add(selected.id));
    setSelectedCells(new Set());
    setMessage(keys.length ? `Rellenadas ${keys.length} celdas` : null);
  }

  function fillServiceRow(service: ServiceType) {
    if (!selected || !canEdit) return;
    const amount = bulkValue.trim();
    if (amount !== "" && !(Number(amount) > 0)) {
      setError("El monto debe ser mayor a 0");
      return;
    }
    setDraft((prev) => {
      const next = { ...prev };
      for (const c of categories) {
        next[cellKey(selected.id, c.id, service)] = amount;
      }
      return next;
    });
    setDirtyPeriods((prev) => new Set(prev).add(selected.id));
  }

  function savePeriod(periodId: string) {
    if (!canEdit) return;
    setError(null);
    const cells = categories.flatMap((c) =>
      serviceTypes.map((st) => {
        const raw = draft[cellKey(periodId, c.id, st)] ?? "";
        const amountArs = raw.trim() === "" ? null : Number(raw);
        return {
          commercialCategoryId: c.id,
          serviceType: st,
          amountArs,
        };
      }),
    );
    for (const cell of cells) {
      if (cell.amountArs != null && !(cell.amountArs > 0)) {
        setError("Hay montos inválidos (deben ser > 0 o vacíos)");
        return;
      }
    }
    startTransition(async () => {
      try {
        await savePeriodMatrixAction({ periodId, cells });
        setDirtyPeriods((prev) => {
          const next = new Set(prev);
          next.delete(periodId);
          return next;
        });
        setMessage("Cambios guardados");
        // Refresh local period cells from draft
        setPeriods((prev) =>
          prev.map((p) => {
            if (p.id !== periodId) return p;
            return {
              ...p,
              cells: cells.map((c) => ({
                commercialCategoryId: c.commercialCategoryId,
                serviceType: c.serviceType,
                amountArs: c.amountArs,
                rateId: null,
                ratePlanId: null,
              })),
            };
          }),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al guardar");
      }
    });
  }

  function onCreate(formData: FormData) {
    if (!canEdit) return;
    startTransition(async () => {
      try {
        const res = await createPeriodAction(formData);
        setShowCreate(false);
        setMessage("Período creado");
        // Soft reload via navigation
        window.location.href = `/tarifas?period=${res.id}`;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al crear período");
      }
    });
  }

  function onCopyToNew() {
    if (!selected || !canEdit) return;
    const name = window.prompt("Nombre del nuevo período", `${selected.name} (copia)`);
    if (!name) return;
    const from = window.prompt("Desde (AAAA-MM-DD)", selected.validFrom);
    if (!from) return;
    const to = window.prompt("Hasta (AAAA-MM-DD)", selected.validTo);
    if (!to) return;
    const pctRaw = window.prompt("Ajuste % (0 = igual)", "0") ?? "0";
    const fd = new FormData();
    fd.set("name", name);
    fd.set("validFrom", from);
    fd.set("validTo", to);
    fd.set("copyFromPeriodId", selected.id);
    fd.set("percentAdjust", pctRaw);
    onCreate(fd);
  }

  function onCopyIntoExisting() {
    if (!selected || !canEdit || periods.length < 2) return;
    const others = periods.filter((p) => p.id !== selected.id);
    const pick = window.prompt(
      `Copiar montos DE otro período A «${selected.name}».\nIDs:\n${others
        .map((p) => `${p.id.slice(0, 8)}… ${p.name}`)
        .join("\n")}\n\nPegá el id completo del origen:`,
    );
    if (!pick) return;
    const source = periods.find((p) => p.id === pick || p.id.startsWith(pick));
    if (!source) {
      setError("Período origen no encontrado");
      return;
    }
    startTransition(async () => {
      try {
        await copyPeriodAction({
          sourcePeriodId: source.id,
          targetPeriodId: selected.id,
        });
        window.location.reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al copiar");
      }
    });
  }

  return (
    <div className="space-y-4">
      {(message || error) && (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${
            error
              ? "border-red-200 bg-red-50 text-[var(--danger)]"
              : "border-teal-200 bg-teal-50 text-[var(--brand-deep)]"
          }`}
        >
          {error || message}
        </div>
      )}

      {localOverlaps.length > 0 ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <strong>Solapes de período:</strong> si coinciden noches, gana el tramo más corto
          (si empatan, el más reciente).{" "}
          {localOverlaps
            .map(
              (o) =>
                `«${o.aName}» ↔ «${o.bName}» (${o.from}→${o.to})`,
            )
            .join(" · ")}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1
            className="text-3xl text-[var(--brand-deep)]"
            style={{ fontFamily: "var(--font-display), serif" }}
          >
            Tarifas
          </h1>
          <p className="text-sm text-[var(--muted)] inline-flex items-center gap-1">
            Precios por noche según temporada, tipo de habitación y servicio.
            <HelpTooltip text="ARS por noche × categoría. Al confirmar una reserva el precio acordado se congela." />
          </p>
        </div>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowCreate(true)}
            >
              + Nuevo período
            </button>
            {selected ? (
              <>
                <button type="button" className="btn btn-ghost" onClick={onCopyToNew}>
                  Copiar a otro período
                </button>
                <button type="button" className="btn btn-ghost" onClick={onCopyIntoExisting}>
                  Pegar desde…
                </button>
              </>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-[var(--muted)]">Solo lectura (recepción)</p>
        )}
      </div>

      {showCreate && canEdit ? (
        <form
          action={onCreate}
          className="panel grid gap-3 rounded-xl p-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <div className="sm:col-span-2">
            <FieldLabel>Nombre</FieldLabel>
            <input className="input" name="name" placeholder="Ej. Verano 26/27" required />
          </div>
          <div>
            <FieldLabel help="Primera noche cubierta.">Desde</FieldLabel>
            <input className="input" type="date" name="validFrom" required />
          </div>
          <div>
            <FieldLabel help="Última noche cubierta.">Hasta</FieldLabel>
            <input className="input" type="date" name="validTo" required />
          </div>
          <div className="sm:col-span-2">
            <FieldLabel>Copiar montos desde (opcional)</FieldLabel>
            <select className="select" name="copyFromPeriodId" defaultValue="">
              <option value="">— vacío —</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel>Ajuste % al copiar</FieldLabel>
            <input className="input" type="number" name="percentAdjust" defaultValue={0} />
          </div>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-1">
            <button className="btn btn-primary" type="submit" disabled={pending}>
              Crear
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => setShowCreate(false)}
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <aside className="panel space-y-1 rounded-xl p-2">
          <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Períodos
          </div>
          {periods.length === 0 ? (
            <p className="px-2 py-3 text-sm text-[var(--muted)]">Sin períodos aún.</p>
          ) : (
            periods.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedId(p.id)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                  selected?.id === p.id
                    ? "bg-[var(--brand)]/10 text-[var(--brand-deep)] font-semibold"
                    : "hover:bg-white/70"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span>{p.name}</span>
                  {dirtyPeriods.has(p.id) ? (
                    <span className="text-[10px] text-amber-700">●</span>
                  ) : null}
                </div>
                <div className="text-[11px] text-[var(--muted)]">
                  {p.validFrom} → {p.validTo}
                  {!p.active ? " · inactivo" : ""}
                </div>
              </button>
            ))
          )}
        </aside>

        <section className="panel space-y-4 rounded-xl p-4">
          {!selected ? (
            <p className="text-sm text-[var(--muted)]">Creá un período para cargar tarifas.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-[var(--brand-deep)]">
                    {selected.name}
                  </h2>
                  <p className="text-sm text-[var(--muted)]">
                    Noches del {selected.validFrom} al {selected.validTo}
                  </p>
                </div>
                {canEdit ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={pending || !dirtyPeriods.has(selected.id)}
                      onClick={() => savePeriod(selected.id)}
                    >
                      Guardar cambios
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => {
                        const name = window.prompt("Nombre", selected.name);
                        if (!name) return;
                        const from = window.prompt("Desde", selected.validFrom);
                        if (!from) return;
                        const to = window.prompt("Hasta", selected.validTo);
                        if (!to) return;
                        startTransition(async () => {
                          await updatePeriodMetaAction({
                            id: selected.id,
                            name,
                            validFrom: from,
                            validTo: to,
                          });
                          window.location.reload();
                        });
                      }}
                    >
                      Editar fechas
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost text-[var(--danger)]"
                      onClick={() => {
                        if (!window.confirm(`¿Eliminar período «${selected.name}»?`)) return;
                        const fd = new FormData();
                        fd.set("id", selected.id);
                        startTransition(async () => {
                          await deletePeriodAction(fd);
                          window.location.href = "/tarifas";
                        });
                      }}
                    >
                      Eliminar
                    </button>
                  </div>
                ) : null}
              </div>

              {canEdit ? (
                <div className="flex flex-wrap items-end gap-2 rounded-lg border border-[var(--line)] bg-[#fffdf8] p-3">
                  <div>
                    <FieldLabel>Rellenar selección / fila</FieldLabel>
                    <input
                      className="input w-36"
                      type="number"
                      min={1}
                      placeholder="ARS/noche"
                      value={bulkValue}
                      onChange={(e) => setBulkValue(e.target.value)}
                    />
                  </div>
                  <button type="button" className="btn btn-ghost" onClick={applyBulkFill}>
                    Aplicar a selección
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => fillServiceRow(mobileService)}
                  >
                    Rellenar fila «{SERVICE_TYPE_LABEL[mobileService]}»
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      setBulkValue("");
                      applyBulkFill();
                    }}
                  >
                    Vaciar selección
                  </button>
                </div>
              ) : null}

              {/* Mobile: tabs by service (layout A) */}
              <div className="lg:hidden space-y-3">
                <div className="flex flex-wrap gap-1">
                  {serviceTypes.map((st) => (
                    <button
                      key={st}
                      type="button"
                      className={`rounded-md px-2.5 py-1.5 text-sm ${
                        mobileService === st
                          ? "bg-[var(--brand)]/15 font-semibold text-[var(--brand-deep)]"
                          : "text-[var(--muted)]"
                      }`}
                      onClick={() => setMobileService(st)}
                    >
                      {SERVICE_TYPE_LABEL[st]}
                    </button>
                  ))}
                </div>
                <MatrixTable
                  periodId={selected.id}
                  categories={categories}
                  services={[mobileService]}
                  draft={draft}
                  canEdit={canEdit}
                  selectedCells={selectedCells}
                  onToggleSelect={toggleCellSelect}
                  onChange={markDirty}
                />
              </div>

              {/* Desktop: wide matrix grouped by service (layout B) */}
              <div className="hidden lg:block overflow-auto">
                <MatrixTable
                  periodId={selected.id}
                  categories={categories}
                  services={serviceTypes}
                  draft={draft}
                  canEdit={canEdit}
                  selectedCells={selectedCells}
                  onToggleSelect={toggleCellSelect}
                  onChange={markDirty}
                  grouped
                />
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function buildDraft(periods: PeriodWithMatrix[]): DraftCells {
  const draft: DraftCells = {};
  for (const p of periods) {
    for (const c of p.cells) {
      draft[cellKey(p.id, c.commercialCategoryId, c.serviceType)] =
        c.amountArs != null ? String(Math.round(c.amountArs)) : "";
    }
  }
  return draft;
}

function MatrixTable({
  periodId,
  categories,
  services,
  draft,
  canEdit,
  selectedCells,
  onToggleSelect,
  onChange,
  grouped,
}: {
  periodId: string;
  categories: Category[];
  services: ServiceType[];
  draft: DraftCells;
  canEdit: boolean;
  selectedCells: Set<string>;
  onToggleSelect: (key: string) => void;
  onChange: (periodId: string, key: string, value: string) => void;
  grouped?: boolean;
}) {
  return (
    <table className="w-full min-w-[520px] border-collapse text-sm">
      <thead>
        {grouped ? (
          <tr className="border-b border-[var(--line)] text-xs text-[var(--muted)]">
            <th className="px-2 py-2 text-left" rowSpan={2}>
              ARS / noche
            </th>
            {services.map((st) => (
              <th
                key={st}
                className="px-2 py-1 text-center font-semibold"
                colSpan={categories.length}
              >
                {SERVICE_TYPE_LABEL[st]}
              </th>
            ))}
          </tr>
        ) : null}
        <tr className="border-b border-[var(--line)] text-xs uppercase text-[var(--muted)]">
          {!grouped ? <th className="px-2 py-2 text-left">Categoría</th> : null}
          {services.map((st) =>
            categories.map((c) => (
              <th key={`${st}-${c.id}`} className="px-2 py-2 text-center font-semibold">
                {grouped ? c.code : c.name}
              </th>
            )),
          )}
        </tr>
      </thead>
      <tbody>
        {grouped ? (
          <tr>
            <td className="px-2 py-2 text-[var(--muted)]">Monto</td>
            {services.map((st) =>
              categories.map((c) => {
                const key = cellKey(periodId, c.id, st);
                return (
                  <td key={key} className="px-1 py-1">
                    <CellInput
                      value={draft[key] ?? ""}
                      selected={selectedCells.has(key)}
                      canEdit={canEdit}
                      onSelect={() => onToggleSelect(key)}
                      onChange={(v) => onChange(periodId, key, v)}
                    />
                  </td>
                );
              }),
            )}
          </tr>
        ) : (
          categories.map((c) => (
            <tr key={c.id} className="border-b border-[var(--line)]">
              <td className="px-2 py-2 font-medium">{c.name}</td>
              {services.map((st) => {
                const key = cellKey(periodId, c.id, st);
                return (
                  <td key={key} className="px-1 py-1">
                    <CellInput
                      value={draft[key] ?? ""}
                      selected={selectedCells.has(key)}
                      canEdit={canEdit}
                      onSelect={() => onToggleSelect(key)}
                      onChange={(v) => onChange(periodId, key, v)}
                    />
                  </td>
                );
              })}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function CellInput({
  value,
  selected,
  canEdit,
  onSelect,
  onChange,
}: {
  value: string;
  selected: boolean;
  canEdit: boolean;
  onSelect: () => void;
  onChange: (v: string) => void;
}) {
  if (!canEdit) {
    return (
      <div className="rounded border border-[var(--line)] bg-white/60 px-2 py-1.5 text-right tabular-nums">
        {value ? `$ ${formatArsPlain(Number(value))}` : "—"}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        title="Seleccionar para bulk fill"
        onClick={onSelect}
        className={`h-7 w-2 shrink-0 rounded-sm ${
          selected ? "bg-[var(--brand)]" : "bg-[var(--line)]"
        }`}
      />
      <input
        className="input px-2 py-1.5 text-right tabular-nums"
        type="number"
        min={1}
        placeholder="—"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
    </div>
  );
}
