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
import { formatDateUi } from "@/lib/dates";
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
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [showCreate, setShowCreate] = useState(false);
  const [showCopyFrom, setShowCopyFrom] = useState(false);
  const [copySourceId, setCopySourceId] = useState("");
  const [copyPercent, setCopyPercent] = useState("0");
  const [bulkValue, setBulkValue] = useState("");
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [bulkService, setBulkService] = useState<ServiceType>(serviceTypes[0] ?? "DESAYUNO");
  const [bulkCategoryId, setBulkCategoryId] = useState(categories[0]?.id ?? "");

  const selected = periods.find((p) => p.id === selectedId) ?? periods[0] ?? null;

  const localOverlaps = useMemo(() => overlaps, [overlaps]);
  const otherPeriods = periods.filter((p) => p.id !== selected?.id);

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

  function fillServiceColumn(service: ServiceType) {
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
    setMessage(`Columna «${SERVICE_TYPE_LABEL[service]}» actualizada`);
  }

  function fillCategoryRow(categoryId: string) {
    if (!selected || !canEdit) return;
    const amount = bulkValue.trim();
    if (amount !== "" && !(Number(amount) > 0)) {
      setError("El monto debe ser mayor a 0");
      return;
    }
    const cat = categories.find((c) => c.id === categoryId);
    setDraft((prev) => {
      const next = { ...prev };
      for (const st of serviceTypes) {
        next[cellKey(selected.id, categoryId, st)] = amount;
      }
      return next;
    });
    setDirtyPeriods((prev) => new Set(prev).add(selected.id));
    setMessage(cat ? `Fila «${cat.name}» actualizada` : "Fila actualizada");
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
        setMessage("Temporada creada");
        window.location.href = `/tarifas?period=${res.id}`;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al crear temporada");
      }
    });
  }

  function onCopyFromOther() {
    if (!selected || !canEdit || !copySourceId) {
      setError("Elegí la temporada de origen");
      return;
    }
    const pct = Number(copyPercent || "0");
    startTransition(async () => {
      try {
        await copyPeriodAction({
          sourcePeriodId: copySourceId,
          targetPeriodId: selected.id,
          percentAdjust: Number.isFinite(pct) ? pct : 0,
        });
        window.location.reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al copiar precios");
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
          <strong>Solapes de temporada:</strong> si coinciden noches, gana el tramo más corto
          (si empatan, el más reciente).{" "}
          {localOverlaps
            .map(
              (o) =>
                `«${o.aName}» ↔ «${o.bName}» (${formatDateUi(o.from)}→${formatDateUi(o.to)})`,
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
            Temporadas = apertura del hotel + precios por categoría y servicio.
            <HelpTooltip text="Fuera de toda temporada activa el hotel figura cerrado. ARS por noche × categoría. Al confirmar una reserva el precio acordado se congela." />
          </p>
        </div>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowCreate(true)}
            >
              + Nueva temporada
            </button>
            {selected && otherPeriods.length > 0 ? (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setShowCopyFrom(true);
                  setCopySourceId(otherPeriods[0]?.id ?? "");
                }}
              >
                Copiar precios de otro período
              </button>
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
            <FieldLabel help="Primera noche abierta / con tarifa.">Desde</FieldLabel>
            <input className="input" type="date" name="validFrom" required />
          </div>
          <div>
            <FieldLabel help="Última noche abierta / con tarifa.">Hasta</FieldLabel>
            <input className="input" type="date" name="validTo" required />
          </div>
          <div className="sm:col-span-2">
            <FieldLabel>Copiar precios desde (opcional)</FieldLabel>
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

      {showCopyFrom && canEdit && selected ? (
        <div className="panel grid gap-3 rounded-xl p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <FieldLabel>
              Copiar precios hacia «{selected.name}» desde
            </FieldLabel>
            <select
              className="select"
              value={copySourceId}
              onChange={(e) => setCopySourceId(e.target.value)}
            >
              {otherPeriods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({formatDateUi(p.validFrom)}–{formatDateUi(p.validTo)})
                </option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel>Ajuste %</FieldLabel>
            <input
              className="input"
              type="number"
              value={copyPercent}
              onChange={(e) => setCopyPercent(e.target.value)}
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending || !copySourceId}
              onClick={onCopyFromOther}
            >
              Copiar precios
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setShowCopyFrom(false)}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <aside className="panel space-y-1 rounded-xl p-2">
          <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Temporadas
          </div>
          {periods.length === 0 ? (
            <p className="px-2 py-3 text-sm text-[var(--muted)]">Sin temporadas aún.</p>
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
                  {formatDateUi(p.validFrom)} → {formatDateUi(p.validTo)}
                  {!p.active ? " · inactiva" : ""}
                </div>
              </button>
            ))
          )}
        </aside>

        <section className="panel space-y-4 rounded-xl p-4">
          {!selected ? (
            <p className="text-sm text-[var(--muted)]">
              Creá una temporada para abrir fechas y cargar tarifas.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-[var(--brand-deep)]">
                    {selected.name}
                  </h2>
                  <p className="text-sm text-[var(--muted)]">
                    Hotel abierto y tarifas del {formatDateUi(selected.validFrom)} al{" "}
                    {formatDateUi(selected.validTo)}
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
                        const from = window.prompt(
                          "Desde (usar el mismo formato del calendario del sistema)",
                          selected.validFrom,
                        );
                        if (!from) return;
                        const to = window.prompt(
                          "Hasta (usar el mismo formato del calendario del sistema)",
                          selected.validTo,
                        );
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
                        if (!window.confirm(`¿Eliminar temporada «${selected.name}»?`)) return;
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
                    <FieldLabel>Monto ARS / noche</FieldLabel>
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
                  <div className="flex flex-wrap items-end gap-1">
                    <select
                      className="select w-auto"
                      value={bulkService}
                      onChange={(e) => setBulkService(e.target.value as ServiceType)}
                    >
                      {serviceTypes.map((st) => (
                        <option key={st} value={st}>
                          {SERVICE_TYPE_LABEL[st]}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => fillServiceColumn(bulkService)}
                    >
                      Rellenar columna
                    </button>
                  </div>
                  <div className="flex flex-wrap items-end gap-1">
                    <select
                      className="select w-auto"
                      value={bulkCategoryId}
                      onChange={(e) => setBulkCategoryId(e.target.value)}
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => fillCategoryRow(bulkCategoryId)}
                    >
                      Rellenar fila
                    </button>
                  </div>
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

              <div className="overflow-auto">
                <MatrixTable
                  periodId={selected.id}
                  categories={categories}
                  services={serviceTypes}
                  draft={draft}
                  canEdit={canEdit}
                  selectedCells={selectedCells}
                  onToggleSelect={toggleCellSelect}
                  onChange={markDirty}
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

/** Filas = categorías; columnas = servicios. */
function MatrixTable({
  periodId,
  categories,
  services,
  draft,
  canEdit,
  selectedCells,
  onToggleSelect,
  onChange,
}: {
  periodId: string;
  categories: Category[];
  services: ServiceType[];
  draft: DraftCells;
  canEdit: boolean;
  selectedCells: Set<string>;
  onToggleSelect: (key: string) => void;
  onChange: (periodId: string, key: string, value: string) => void;
}) {
  return (
    <table className="w-full min-w-[520px] border-collapse text-sm">
      <thead>
        <tr className="border-b border-[var(--line)] text-xs uppercase text-[var(--muted)]">
          <th className="px-2 py-2 text-left">Tipo / categoría</th>
          {services.map((st) => (
            <th key={st} className="px-2 py-2 text-center font-semibold">
              {SERVICE_TYPE_LABEL[st]}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {categories.map((c) => (
          <tr key={c.id} className="border-b border-[var(--line)]">
            <td className="px-2 py-2 font-medium">
              {c.name}
              <div className="text-[10px] font-normal uppercase text-[var(--muted)]">
                {c.code}
              </div>
            </td>
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
        ))}
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
        title="Seleccionar para relleno masivo"
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
