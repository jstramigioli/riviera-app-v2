"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createReservationAction } from "@/app/actions/reservations";
import { autosaveQueryAction } from "@/app/actions/queries";
import { FieldLabel, HelpTooltip } from "@/components/HelpTooltip";
import { SERVICE_TYPE_LABEL, formatArsPlain } from "@/lib/labels";
import type { AvailabilityCandidate, LiveAvailabilityResult } from "@/lib/availability";
import type { PriceBreakdown } from "@/lib/rates";

export type CreateMode = "consulta" | "reserva";

type AttributeOpt = { id: string; key: string; label: string };

export type CreateStaySeed = {
  mode?: CreateMode;
  checkInDate?: string;
  checkOutDate?: string;
  physicalUnitId?: string;
};

type Props = {
  attributes: AttributeOpt[];
  seed?: CreateStaySeed;
  onClose: () => void;
  /** Keep calendar usable: panel never navigates away on mode switch. */
  onCreated?: (kind: CreateMode, id: string) => void;
};

type AvailabilityPayload = LiveAvailabilityResult & {
  suggestedTotalArs?: number | null;
  priceBreakdown?: PriceBreakdown | null;
  error?: string;
};

function shiftDay(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function CreateStayPanel({ attributes, seed, onClose, onCreated }: Props) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [mode, setMode] = useState<CreateMode>(seed?.mode ?? "reserva");
  const [checkInDate, setCheckInDate] = useState(seed?.checkInDate || today);
  const [checkOutDate, setCheckOutDate] = useState(
    seed?.checkOutDate || shiftDay(seed?.checkInDate || today, 2),
  );
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [serviceType, setServiceType] = useState("DESAYUNO");
  const [status, setStatus] = useState("PRERRESERVA");
  const [channel, setChannel] = useState("");
  const [notes, setNotes] = useState("");
  const [guestFirstName, setGuestFirstName] = useState("");
  const [guestLastName, setGuestLastName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestDocumentNumber, setGuestDocumentNumber] = useState("");
  const [desiredIds, setDesiredIds] = useState<string[]>([]);
  const [selectionKey, setSelectionKey] = useState("");
  const [agreedPrice, setAgreedPrice] = useState("");
  const [priceTouched, setPriceTouched] = useState(false);
  const [overrideAck, setOverrideAck] = useState(false);
  const [overrideNote, setOverrideNote] = useState("");
  const [doNotMove, setDoNotMove] = useState(false);
  const [queryId, setQueryId] = useState<string | undefined>();
  const [queryCode, setQueryCode] = useState<string | undefined>();
  const [data, setData] = useState<AvailabilityPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [pending, startTransition] = useTransition();

  // Apply seed only when the panel opens with a new seed identity (don't fight user mode switches).
  const seedKey = `${seed?.mode ?? ""}|${seed?.checkInDate ?? ""}|${seed?.checkOutDate ?? ""}|${seed?.physicalUnitId ?? ""}`;
  const appliedSeedKey = useRef<string | null>(null);
  useEffect(() => {
    if (appliedSeedKey.current === seedKey) return;
    appliedSeedKey.current = seedKey;
    if (seed?.mode) setMode(seed.mode);
    if (seed?.checkInDate) setCheckInDate(seed.checkInDate);
    if (seed?.checkOutDate) {
      setCheckOutDate(seed.checkOutDate);
    } else if (seed?.checkInDate) {
      setCheckOutDate(shiftDay(seed.checkInDate, 2));
    }
  }, [seedKey, seed?.mode, seed?.checkInDate, seed?.checkOutDate]);

  useEffect(() => {
    if (!checkInDate || !checkOutDate || checkInDate >= checkOutDate) {
      setData(null);
      setFetchError(
        checkInDate && checkOutDate && checkInDate >= checkOutDate
          ? "La salida debe ser posterior a la llegada"
          : null,
      );
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      setFetchError(null);
      try {
        const qs = new URLSearchParams({
          checkInDate,
          checkOutDate,
          adults: String(adults),
          children: String(children),
          serviceType,
          desired: desiredIds.join(","),
        });
        if (selectionKey) qs.set("selectionKey", selectionKey);
        const res = await fetch(`/api/availability?${qs}`, { signal: ctrl.signal });
        const json = (await res.json()) as AvailabilityPayload;
        if (!res.ok) {
          setFetchError(json.error || "No se pudo consultar disponibilidad");
          setData(null);
          return;
        }
        setData(json);
        if (seed?.physicalUnitId && !selectionKey && mode === "reserva") {
          const pref = json.candidates.find(
            (c) => c.kind === "unit" && c.id === seed.physicalUnitId,
          );
          if (pref) {
            setSelectionKey(pref.selectionKey);
            return;
          }
        }
        if (
          selectionKey &&
          !json.candidates.some((c) => c.selectionKey === selectionKey)
        ) {
          setSelectionKey("");
        }
        if (!priceTouched && json.suggestedTotalArs != null) {
          setAgreedPrice(String(Math.round(json.suggestedTotalArs)));
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setFetchError("Error al consultar disponibilidad");
        }
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [
    checkInDate,
    checkOutDate,
    adults,
    children,
    serviceType,
    desiredIds,
    selectionKey,
    priceTouched,
    seed?.physicalUnitId,
    mode,
  ]);

  // Autosave consulta drafts
  useEffect(() => {
    if (mode !== "consulta") return;
    if (!checkInDate || !checkOutDate || checkInDate >= checkOutDate) return;
    const t = setTimeout(async () => {
      setSaveState("saving");
      setSaveError(null);
      const res = await autosaveQueryAction({
        id: queryId,
        checkInDate,
        checkOutDate,
        adults,
        children,
        serviceType: serviceType as "SIN_DESAYUNO" | "DESAYUNO" | "MEDIA_PENSION",
        channel: channel || null,
        notes: notes || null,
        guestFirstName: guestFirstName || null,
        guestLastName: guestLastName || null,
        guestPhone: guestPhone || null,
        guestDocumentNumber: guestDocumentNumber || null,
        desiredAttributeIds: desiredIds,
      });
      if (!res.ok) {
        setSaveError(res.error);
        setSaveState("idle");
        return;
      }
      setQueryId(res.id);
      setQueryCode(res.code);
      setSaveState("saved");
      onCreated?.("consulta", res.id);
    }, 1100);
    return () => clearTimeout(t);
  }, [
    mode,
    queryId,
    checkInDate,
    checkOutDate,
    adults,
    children,
    serviceType,
    channel,
    notes,
    guestFirstName,
    guestLastName,
    guestPhone,
    guestDocumentNumber,
    desiredIds,
    onCreated,
  ]);

  const selected =
    data?.candidates.find((c) => c.selectionKey === selectionKey) ?? null;
  const needsOverride = Boolean(selected && !selected.meetsAllDesired);
  const roomCandidates = (data?.candidates ?? []).filter((c) => c.kind === "unit");
  const communicating = (data?.candidates ?? []).filter(
    (c) => c.kind === "communicating",
  );

  function switchMode(next: CreateMode) {
    setMode(next);
    setSaveError(null);
    setFetchError(null);
    if (next === "consulta") {
      // Keep dates/guest/desired; room only matters for reserva
    } else if (next === "reserva" && !selectionKey && seed?.physicalUnitId) {
      // will re-select via availability effect
    }
  }

  function onSubmitReserva(formData: FormData) {
    if (needsOverride && (!overrideAck || !overrideNote.trim())) return;
    startTransition(() => {
      createReservationAction(formData);
    });
  }

  function toggleDesired(id: string) {
    setDesiredIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  const title =
    mode === "reserva"
      ? "Nueva reserva"
      : queryCode
        ? `Consulta ${queryCode}`
        : "Nueva consulta";

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
        <div>
          <h2
            className="text-xl text-[var(--brand-deep)]"
            style={{ fontFamily: "var(--font-display), serif" }}
          >
            {title}
          </h2>
          <p className="text-xs text-[var(--muted)]">
            {mode === "reserva"
              ? "Con habitación · aparece en el calendario"
              : "Sin habitación · no bloquea · va a Consultas"}
          </p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Cerrar">
          Cerrar
        </button>
      </div>

      <div className="border-b border-[var(--line)] px-4 py-2">
        <div className="mode-switch" role="tablist" aria-label="Tipo de alta">
          <button
            type="button"
            role="tab"
            data-testid="mode-reserva"
            aria-selected={mode === "reserva"}
            className={mode === "reserva" ? "mode-switch-active" : ""}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              switchMode("reserva");
            }}
          >
            Reserva
          </button>
          <button
            type="button"
            role="tab"
            data-testid="mode-consulta"
            aria-selected={mode === "consulta"}
            className={mode === "consulta" ? "mode-switch-active" : ""}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              switchMode("consulta");
            }}
          >
            Consulta
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-[var(--muted)] inline-flex items-center gap-1">
          Podés cambiar de modo sin perder fechas ni cliente.
          <HelpTooltip text="Consulta = indagación sin habitación. Reserva = compromiso con habitación. Al pasar de consulta a reserva elegís habitación y guardás." />
        </p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
        {(fetchError || saveError) && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-[var(--danger)]">
            {fetchError || saveError}
          </div>
        )}

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-[var(--brand-deep)]">Cliente</h3>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <FieldLabel>Nombre</FieldLabel>
              <input
                className="input"
                name="guestFirstName"
                value={guestFirstName}
                onChange={(e) => setGuestFirstName(e.target.value)}
               
              />
            </div>
            <div>
              <FieldLabel>Apellido</FieldLabel>
              <input
                className="input"
                name="guestLastName"
                value={guestLastName}
                onChange={(e) => setGuestLastName(e.target.value)}
               
              />
            </div>
            <div>
              <FieldLabel>Teléfono</FieldLabel>
              <input
                className="input"
                name="phone"
                value={guestPhone}
                onChange={(e) => setGuestPhone(e.target.value)}
               
              />
            </div>
            <div>
              <FieldLabel>Documento</FieldLabel>
              <input
                className="input"
                name="documentNumber"
                value={guestDocumentNumber}
                onChange={(e) => setGuestDocumentNumber(e.target.value)}
               
              />
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-[var(--brand-deep)]">Fechas y ocupación</h3>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <FieldLabel>Llegada</FieldLabel>
              <input
                className="input"
                type="date"
                name="checkInDate"
                required
                value={checkInDate}
                onChange={(e) => {
                  setCheckInDate(e.target.value);
                  if (e.target.value >= checkOutDate) {
                    setCheckOutDate(shiftDay(e.target.value, 1));
                  }
                }}
               
              />
            </div>
            <div>
              <FieldLabel help="La salida no ocupa noche.">Salida</FieldLabel>
              <input
                className="input"
                type="date"
                name="checkOutDate"
                required
                value={checkOutDate}
                onChange={(e) => setCheckOutDate(e.target.value)}
               
              />
            </div>
            <div>
              <FieldLabel>Adultos</FieldLabel>
              <input
                className="input"
                type="number"
                min={1}
                name="adults"
                value={adults}
                onChange={(e) => setAdults(Number(e.target.value) || 1)}
               
              />
            </div>
            <div>
              <FieldLabel>Niños</FieldLabel>
              <input
                className="input"
                type="number"
                min={0}
                name="children"
                value={children}
                onChange={(e) => setChildren(Number(e.target.value) || 0)}
               
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <FieldLabel>Servicio</FieldLabel>
              <select
                className="select"
                name="serviceType"
                value={serviceType}
                onChange={(e) => setServiceType(e.target.value)}
               
              >
                {(Object.keys(SERVICE_TYPE_LABEL) as (keyof typeof SERVICE_TYPE_LABEL)[]).map(
                  (k) => (
                    <option key={k} value={k}>
                      {SERVICE_TYPE_LABEL[k]}
                    </option>
                  ),
                )}
              </select>
            </div>
            <div>
              <FieldLabel>Canal</FieldLabel>
              <input
                className="input"
                name="channel"
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                placeholder="WhatsApp / Tel"
               
              />
            </div>
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex items-center gap-1">
            <h3 className="text-sm font-semibold text-[var(--brand-deep)]">
              Características deseadas
            </h3>
            <HelpTooltip text="Sugieren y ordenan. En reserva podés elegir otra habitación con aviso." />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {attributes.map((a) => {
              const on = desiredIds.includes(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  className={`tag-chip ${on ? "tag-chip-desired" : "tag-chip-off"}`}
                  onClick={() => toggleDesired(a.id)}
                >
                  {a.label}
                </button>
              );
            })}
          </div>
        </section>

        <section
          className={`rounded-lg border px-3 py-2 text-sm ${
            data?.hasAvailability ? "avail-yes" : data ? "avail-no" : "border-[var(--line)]"
          }`}
        >
          <div className="font-semibold text-[var(--brand-deep)]">
            {loading && !data
              ? "Consultando…"
              : data?.hasAvailability
                ? `Libre · ${data.availableCount} opción${data.availableCount === 1 ? "" : "es"}`
                : data
                  ? "Sin habitaciones libres"
                  : "Ingresá fechas"}
          </div>
          {data?.suggestedTotalArs != null ? (
            <div className="text-xs text-[var(--muted)]">
              Sugerido {formatArsPlain(data.suggestedTotalArs)} ARS · {data.nights} noche
              {data.nights === 1 ? "" : "s"}
              {loading ? " · actualizando" : ""}
            </div>
          ) : null}
        </section>

        {mode === "consulta" && data?.priceBreakdown ? (
          <section className="space-y-1">
            <h3 className="text-sm font-semibold text-[var(--brand-deep)]">
              Precio noche a noche
            </h3>
            <ul className="max-h-36 space-y-0.5 overflow-auto text-xs">
              {data.priceBreakdown.nights.map((n) => (
                <li
                  key={n.date}
                  className={`flex justify-between gap-2 ${n.missing ? "text-red-800" : ""}`}
                >
                  <span>{n.date}</span>
                  <span>
                    {n.amountArs != null ? `$ ${formatArsPlain(n.amountArs)}` : "Sin tarifa"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {mode === "reserva" ? (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-[var(--brand-deep)]">Habitación</h3>
            {communicating.length > 0 ? (
              <div className="space-y-1">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Comunicadas
                </div>
                <div className="grid gap-1.5">
                  {communicating.map((c) => (
                    <CandidateRow
                      key={c.selectionKey}
                      candidate={c}
                      selected={selectionKey === c.selectionKey}
                      onSelect={() => {
                        setSelectionKey(c.selectionKey);
                        setOverrideAck(false);
                        setPriceTouched(false);
                      }}
                    />
                  ))}
                </div>
              </div>
            ) : null}
            <div className="grid max-h-48 gap-1.5 overflow-auto">
              {roomCandidates.map((c) => (
                <CandidateRow
                  key={c.selectionKey}
                  candidate={c}
                  selected={selectionKey === c.selectionKey}
                  onSelect={() => {
                    setSelectionKey(c.selectionKey);
                    setOverrideAck(false);
                    setPriceTouched(false);
                  }}
                />
              ))}
              {!loading && data && roomCandidates.length === 0 ? (
                <p className="text-xs text-[var(--muted)]">No hay habitaciones libres.</p>
              ) : null}
            </div>

            {needsOverride ? (
              <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
                <p className="font-semibold">No cumple lo deseado</p>
                <p className="text-xs">
                  Falta: {selected?.missingDesiredLabels.join(", ") || "—"}
                </p>
                <label className="flex items-start gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={overrideAck}
                    onChange={(e) => setOverrideAck(e.target.checked)}
                    className="mt-0.5"
                  />
                  Asignarla igual
                </label>
                <input
                  className="input"
                  value={overrideNote}
                  onChange={(e) => setOverrideNote(e.target.value)}
                  placeholder="Motivo"
                  disabled={!overrideAck}
                />
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <FieldLabel>Estado</FieldLabel>
                <select
                  className="select"
                  name="status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                 
                >
                  <option value="PRERRESERVA">Prerreserva</option>
                  <option value="CONFIRMADA">Confirmada</option>
                  <option value="IN_HOUSE">Ingresada</option>
                </select>
              </div>
              <div>
                <FieldLabel>Precio (ARS)</FieldLabel>
                <input
                  className="input"
                  type="number"
                  min={0}
                  name="agreedPriceArs"
                  value={agreedPrice}
                  onChange={(e) => {
                    setAgreedPrice(e.target.value);
                    setPriceTouched(true);
                  }}
                 
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="doNotMove"
                checked={doNotMove}
                onChange={(e) => setDoNotMove(e.target.checked)}
               
              />
              Habitación fijada
            </label>
          </section>
        ) : (
          <p className="text-xs text-[var(--muted)]">
            {saveState === "saving"
              ? "Guardando consulta…"
              : saveState === "saved"
                ? "Consulta guardada. Podés seguir o pasar a Reserva para asignar habitación."
                : "Se guarda sola con las fechas (sin habitación)."}
          </p>
        )}

        <div>
          <FieldLabel>Notas</FieldLabel>
          <textarea
            className="textarea"
            name="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Opcional"
           
          />
        </div>
      </div>

      <div className="border-t border-[var(--line)] px-4 py-3">
        {mode === "reserva" ? (
          <form id="create-stay-form" action={onSubmitReserva}>
            <input type="hidden" name="checkInDate" value={checkInDate} />
            <input type="hidden" name="checkOutDate" value={checkOutDate} />
            <input type="hidden" name="adults" value={adults} />
            <input type="hidden" name="children" value={children} />
            <input type="hidden" name="serviceType" value={serviceType} />
            <input type="hidden" name="status" value={status} />
            <input type="hidden" name="channel" value={channel} />
            <input type="hidden" name="notes" value={notes} />
            <input type="hidden" name="guestFirstName" value={guestFirstName} />
            <input type="hidden" name="guestLastName" value={guestLastName} />
            <input type="hidden" name="phone" value={guestPhone} />
            <input type="hidden" name="documentNumber" value={guestDocumentNumber} />
            <input type="hidden" name="agreedPriceArs" value={agreedPrice} />
            <input type="hidden" name="desiredAttributeIds" value={desiredIds.join(",")} />
            <input
              type="hidden"
              name="physicalUnitId"
              value={selected?.kind === "unit" ? selected.id : ""}
            />
            <input
              type="hidden"
              name="compositeUnitId"
              value={selected?.kind === "communicating" ? selected.id : ""}
            />
            <input
              type="hidden"
              name="allowDesiredOverride"
              value={needsOverride ? "1" : ""}
            />
            <input type="hidden" name="overrideNote" value={overrideNote} />
            {doNotMove ? <input type="hidden" name="doNotMove" value="on" /> : null}
            <button
              className="btn btn-primary w-full"
              type="submit"
              disabled={
                pending ||
                !selectionKey ||
                Boolean(fetchError) ||
                (needsOverride && (!overrideAck || !overrideNote.trim()))
              }
            >
              {pending ? "Guardando…" : "Crear reserva"}
            </button>
          </form>
        ) : (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="btn btn-primary w-full"
              disabled={!queryId}
              onClick={() => switchMode("reserva")}
            >
              Pasar a reserva (elegir habitación)
            </button>
            <button type="button" className="btn btn-ghost w-full" onClick={onClose}>
              Listo · seguir en calendario
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CandidateRow({
  candidate,
  selected,
  onSelect,
}: {
  candidate: AvailabilityCandidate;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-md border px-2.5 py-1.5 text-left text-sm transition ${
        selected
          ? "border-[var(--brand)] bg-[#e8f5f4]"
          : "border-[var(--line)] bg-white/70 hover:border-[var(--brand)]/40"
      }`}
    >
      <div className="font-semibold">
        {candidate.kind === "communicating"
          ? candidate.label
          : `${candidate.code} · ${candidate.label}`}
      </div>
      <div className="text-[11px] text-[var(--muted)]">
        Cap. {candidate.capacity}
        {!candidate.meetsAllDesired ? " · parcial" : candidate.desiredHits > 0 ? " · cumple" : ""}
      </div>
    </button>
  );
}
