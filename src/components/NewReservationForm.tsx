"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createReservationAction } from "@/app/actions/reservations";
import { FieldLabel, HelpTooltip } from "@/components/HelpTooltip";
import { SERVICE_TYPE_LABEL } from "@/lib/labels";
import type { LiveAvailabilityResult, AvailabilityCandidate } from "@/lib/availability";

type AttributeOpt = { id: string; key: string; label: string };
type TagMode = "off" | "preference" | "mandatory";

type Props = {
  attributes: AttributeOpt[];
  initial?: {
    checkInDate?: string;
    checkOutDate?: string;
    physicalUnitId?: string;
    error?: string;
  };
};

type AvailabilityPayload = LiveAvailabilityResult & {
  suggestedTotalArs?: number | null;
  error?: string;
};

const HELP = {
  checkout:
    "La fecha de salida no ocupa noche: si llega el 10 y se va el 12, duerme el 10 y el 11.",
  tagsMandatory:
    "Obligatorio: solo se listan habitaciones libres que tengan esta característica.",
  tagsPreference:
    "Preferencia: se muestran todas las libres; las que cumplen aparecen primero.",
  tags:
    "Tocá una vez para preferencia, dos para obligatorio, tres para quitar. Filtra las habitaciones libres.",
  communicating:
    "Habitaciones comunicadas (p. ej. 8+9 o 35+36): se reservan juntas y ocupan ambas.",
  doNotMove:
    "Si está marcado, recepción no debería cambiar de habitación salvo decisión consciente.",
  senia:
    "Registrar una seña no confirma sola la reserva: el estado operativo se cambia aparte.",
  status:
    "Consulta no bloquea inventario. Prerreserva y Confirmada sí reservan la habitación.",
  tramos:
    "Si el huésped cambia de habitación a mitad de estadía, la misma reserva se parte en varios tramos contiguos (se edita después en la ficha).",
  grupo:
    "Podés sumar otra habitación libre para el mismo período (familia en dos habitaciones).",
};

function cycleMode(m: TagMode): TagMode {
  if (m === "off") return "preference";
  if (m === "preference") return "mandatory";
  return "off";
}

export function NewReservationForm({ attributes, initial }: Props) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [checkInDate, setCheckInDate] = useState(initial?.checkInDate || today);
  const [checkOutDate, setCheckOutDate] = useState(
    initial?.checkOutDate || shiftDay(today, 2),
  );
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [serviceType, setServiceType] = useState("DESAYUNO");
  const [status, setStatus] = useState("PRERRESERVA");
  const [tagModes, setTagModes] = useState<Record<string, TagMode>>({});
  const [selectionKey, setSelectionKey] = useState<string>("");
  const [extraKeys, setExtraKeys] = useState<string[]>([]);
  const [agreedPrice, setAgreedPrice] = useState<string>("");
  const [priceTouched, setPriceTouched] = useState(false);
  const [data, setData] = useState<AvailabilityPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const mandatoryIds = useMemo(
    () => Object.entries(tagModes).filter(([, m]) => m === "mandatory").map(([id]) => id),
    [tagModes],
  );
  const preferenceIds = useMemo(
    () => Object.entries(tagModes).filter(([, m]) => m === "preference").map(([id]) => id),
    [tagModes],
  );

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
          mandatory: mandatoryIds.join(","),
          preference: preferenceIds.join(","),
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
        if (initial?.physicalUnitId && !selectionKey) {
          const pref = json.candidates.find(
            (c) => c.kind === "unit" && c.id === initial.physicalUnitId,
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
        setExtraKeys((prev) =>
          prev.filter((k) => json.candidates.some((c) => c.selectionKey === k)),
        );
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
    mandatoryIds,
    preferenceIds,
    selectionKey,
    priceTouched,
    initial?.physicalUnitId,
  ]);

  const selected = data?.candidates.find((c) => c.selectionKey === selectionKey) ?? null;
  const roomCandidates = (data?.candidates ?? []).filter((c) => c.kind === "unit");
  const communicating = (data?.candidates ?? []).filter((c) => c.kind === "communicating");

  function onSubmit(formData: FormData) {
    startTransition(() => {
      createReservationAction(formData);
    });
  }

  const physicalUnitId =
    selected?.kind === "unit" ? selected.id : "";
  const compositeUnitId =
    selected?.kind === "communicating" ? selected.id : "";
  const extraUnitIds = extraKeys
    .map((k) => data?.candidates.find((c) => c.selectionKey === k))
    .filter((c): c is AvailabilityCandidate => Boolean(c && c.kind === "unit"))
    .map((c) => c.id)
    .join(",");

  return (
    <form action={onSubmit} className="space-y-5">
      {(initial?.error || fetchError) && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-[var(--danger)]">
          {initial?.error || fetchError}
        </div>
      )}

      <section className="panel space-y-4 rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-[var(--brand-deep)]">Fechas y huéspedes</h2>
          <span className="text-xs text-[var(--muted)] inline-flex items-center gap-1">
            Disponibilidad en vivo
            <HelpTooltip text="Al cambiar fechas, personas o servicio se recalcula qué habitaciones están libres y qué servicios tienen tarifa." />
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
            <FieldLabel help={HELP.checkout}>Salida</FieldLabel>
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
              name="adults"
              type="number"
              min={1}
              value={adults}
              onChange={(e) => setAdults(Number(e.target.value) || 1)}
            />
          </div>
          <div>
            <FieldLabel>Niños</FieldLabel>
            <input
              className="input"
              name="children"
              type="number"
              min={0}
              value={children}
              onChange={(e) => setChildren(Number(e.target.value) || 0)}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <FieldLabel help="Según tarifas cargadas para esas noches.">Servicio / pensión</FieldLabel>
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
            <FieldLabel help={HELP.status}>Estado</FieldLabel>
            <select
              className="select"
              name="status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="CONSULTA">Consulta (no bloquea)</option>
              <option value="PRERRESERVA">Prerreserva</option>
              <option value="CONFIRMADA">Confirmada</option>
            </select>
          </div>
          <div>
            <FieldLabel>Canal</FieldLabel>
            <input className="input" name="channel" placeholder="WhatsApp / Tel / Walk-in" />
          </div>
        </div>
      </section>

      <LiveAvailabilityPanel
        loading={loading}
        data={data}
        serviceType={serviceType}
        onSelectService={(s) => setServiceType(s)}
      />

      <section className="panel space-y-3 rounded-xl p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-[var(--brand-deep)]">
            Características de la habitación
          </h2>
          <HelpTooltip text={HELP.tags} />
        </div>
        <p className="text-xs text-[var(--muted)]">
          Preferencia ordena · Obligatorio filtra.{" "}
          <HelpTooltip text={HELP.tagsMandatory} label="Ayuda obligatorio" />{" "}
          <HelpTooltip text={HELP.tagsPreference} label="Ayuda preferencia" />
        </p>
        <div className="flex flex-wrap gap-2">
          {attributes.map((a) => {
            const mode = tagModes[a.id] || "off";
            return (
              <button
                key={a.id}
                type="button"
                className={`tag-chip tag-chip-${mode}`}
                onClick={() =>
                  setTagModes((prev) => ({ ...prev, [a.id]: cycleMode(mode) }))
                }
              >
                {a.label}
                {mode !== "off" ? (
                  <span className="tag-chip-badge">
                    {mode === "mandatory" ? "Oblig." : "Pref."}
                  </span>
                ) : null}
              </button>
            );
          })}
          {attributes.length === 0 ? (
            <span className="text-sm text-[var(--muted)]">
              No hay características cargadas (Admin → Inventario).
            </span>
          ) : null}
        </div>
      </section>

      <section className="panel space-y-3 rounded-xl p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-[var(--brand-deep)]">Elegir habitación</h2>
          <HelpTooltip text="Solo se muestran habitaciones libres en esas fechas. Asignación concreta: sin reserva flotante." />
        </div>

        {communicating.length > 0 ? (
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)] inline-flex items-center gap-1">
              Habitaciones comunicadas
              <HelpTooltip text={HELP.communicating} />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {communicating.map((c) => (
                <CandidateCard
                  key={c.selectionKey}
                  candidate={c}
                  selected={selectionKey === c.selectionKey}
                  onSelect={() => {
                    setSelectionKey(c.selectionKey);
                    setExtraKeys([]);
                    setPriceTouched(false);
                  }}
                />
              ))}
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Habitaciones y departamentos libres
            {data ? ` · ${roomCandidates.length}` : ""}
          </div>
          {loading && !data ? (
            <p className="text-sm text-[var(--muted)]">Consultando…</p>
          ) : roomCandidates.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[var(--line)] px-3 py-4 text-sm text-[var(--muted)]">
              {data?.hasAvailability === false
                ? mandatoryIds.length
                  ? "No hay habitaciones libres que cumplan los requisitos obligatorios."
                  : "No hay habitaciones libres en esas fechas."
                : "Elegí fechas para ver disponibilidad."}
            </p>
          ) : (
            <div className="grid max-h-72 gap-2 overflow-auto sm:grid-cols-2 lg:grid-cols-3">
              {roomCandidates.map((c) => (
                <CandidateCard
                  key={c.selectionKey}
                  candidate={c}
                  selected={selectionKey === c.selectionKey}
                  onSelect={() => {
                    setSelectionKey(c.selectionKey);
                    setExtraKeys((prev) => prev.filter((k) => k !== c.selectionKey));
                    setPriceTouched(false);
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {selected?.kind === "unit" && roomCandidates.length > 1 ? (
          <div className="space-y-2 border-t border-[var(--line)] pt-3">
            <div className="text-sm font-semibold inline-flex items-center gap-1">
              Sumar otra habitación al grupo
              <HelpTooltip text={HELP.grupo} />
            </div>
            <div className="flex flex-wrap gap-2">
              {roomCandidates
                .filter((c) => c.selectionKey !== selectionKey)
                .map((c) => {
                  const on = extraKeys.includes(c.selectionKey);
                  return (
                    <button
                      key={c.selectionKey}
                      type="button"
                      className={`tag-chip ${on ? "tag-chip-preference" : "tag-chip-off"}`}
                      onClick={() =>
                        setExtraKeys((prev) =>
                          on
                            ? prev.filter((k) => k !== c.selectionKey)
                            : [...prev, c.selectionKey],
                        )
                      }
                    >
                      {c.code}
                    </button>
                  );
                })}
            </div>
            {extraKeys.length > 0 ? (
              <input className="input" name="groupName" placeholder="Nombre del grupo (Familia…)" />
            ) : null}
          </div>
        ) : null}

        <input type="hidden" name="physicalUnitId" value={physicalUnitId} />
        <input type="hidden" name="compositeUnitId" value={compositeUnitId} />
        <input type="hidden" name="extraUnitIds" value={extraUnitIds} />
        <input type="hidden" name="mandatoryAttributeIds" value={mandatoryIds.join(",")} />
        <input type="hidden" name="preferenceAttributeIds" value={preferenceIds.join(",")} />
      </section>

      <section className="panel space-y-4 rounded-xl p-5">
        <h2 className="text-lg font-semibold text-[var(--brand-deep)]">Titular y notas</h2>
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel>Nombre</FieldLabel>
            <input className="input" name="guestFirstName" />
          </div>
          <div>
            <FieldLabel>Apellido</FieldLabel>
            <input className="input" name="guestLastName" />
          </div>
          <div>
            <FieldLabel>Documento</FieldLabel>
            <input className="input" name="documentNumber" />
          </div>
          <div>
            <FieldLabel>Teléfono</FieldLabel>
            <input className="input" name="phone" />
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel help="Sugerido por tarifas; editable. Se congela al confirmar.">
              Precio acordado (ARS)
            </FieldLabel>
            <input
              className="input"
              name="agreedPriceArs"
              type="number"
              min={0}
              step="1"
              value={agreedPrice}
              onChange={(e) => {
                setAgreedPrice(e.target.value);
                setPriceTouched(true);
              }}
            />
            {data?.suggestedTotalArs != null && !priceTouched ? (
              <p className="mt-1 text-xs text-[var(--muted)]">
                Sugerido por tarifa · {data.nights} noche{data.nights === 1 ? "" : "s"}
              </p>
            ) : null}
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm pb-2">
              <input type="checkbox" name="doNotMove" />
              No mover de habitación
              <HelpTooltip text={HELP.doNotMove} />
            </label>
          </div>
        </div>

        <div>
          <FieldLabel help="Solo matices que no estén en las características (ej. lejos del ascensor).">
            Notas adicionales
          </FieldLabel>
          <textarea className="textarea" name="notes" placeholder="Opcional" />
        </div>

        <p className="text-xs text-[var(--muted)] inline-flex items-center gap-1">
          <HelpTooltip text={HELP.senia} /> La seña se carga después en la ficha y no confirma sola.
          <span className="mx-1">·</span>
          <HelpTooltip text={HELP.tramos} /> Los cambios de habitación a mitad de estadía se cargan
          como tramos en la ficha.
        </p>

        <button
          className="btn btn-primary"
          type="submit"
          disabled={pending || !selectionKey || Boolean(fetchError)}
        >
          {pending
            ? "Guardando…"
            : status === "CONSULTA"
              ? "Guardar consulta"
              : "Crear reserva"}
        </button>
      </section>
    </form>
  );
}

function LiveAvailabilityPanel({
  loading,
  data,
  serviceType,
  onSelectService,
}: {
  loading: boolean;
  data: AvailabilityPayload | null;
  serviceType: string;
  onSelectService: (s: string) => void;
}) {
  const ok = data?.hasAvailability;
  return (
    <section
      className={`panel rounded-xl p-5 transition-colors ${
        ok === true
          ? "avail-yes"
          : ok === false
            ? "avail-no"
            : ""
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Disponibilidad
          </div>
          <div className="mt-1 text-2xl font-semibold text-[var(--brand-deep)]" style={{ fontFamily: "var(--font-display), serif" }}>
            {loading && !data
              ? "Consultando…"
              : ok === true
                ? `Sí · ${data!.availableCount} opción${data!.availableCount === 1 ? "" : "es"}`
                : ok === false
                  ? "No hay opciones libres"
                  : "Ingresá fechas"}
          </div>
          {data ? (
            <p className="text-sm text-[var(--muted)]">
              {data.nights} noche{data.nights === 1 ? "" : "s"} ·{" "}
              {data.checkInDate} → {data.checkOutDate}
            </p>
          ) : null}
        </div>
        {loading ? (
          <span className="live-pulse text-xs font-semibold text-[var(--brand)]">Actualizando</span>
        ) : null}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {(data?.services ?? [
          { serviceType: "SIN_DESAYUNO", available: false, suggestedNightlyArs: null },
          { serviceType: "DESAYUNO", available: false, suggestedNightlyArs: null },
          { serviceType: "MEDIA_PENSION", available: false, suggestedNightlyArs: null },
        ]).map((s) => {
          const key = s.serviceType as keyof typeof SERVICE_TYPE_LABEL;
          const active = serviceType === s.serviceType;
          return (
            <button
              key={s.serviceType}
              type="button"
              disabled={!s.available}
              onClick={() => onSelectService(s.serviceType)}
              className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                active
                  ? "border-[var(--brand)] bg-white shadow-sm"
                  : "border-[var(--line)] bg-white/50"
              } ${s.available ? "" : "opacity-45 cursor-not-allowed"}`}
            >
              <div className="font-semibold">{SERVICE_TYPE_LABEL[key]}</div>
              <div className="text-xs text-[var(--muted)]">
                {s.available
                  ? s.suggestedNightlyArs != null
                    ? `Desde ${Math.round(s.suggestedNightlyArs).toLocaleString("es-AR")} ARS/noche`
                    : "Con tarifa"
                  : "Sin tarifa en esas fechas"}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function CandidateCard({
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
      className={`rounded-lg border px-3 py-2 text-left transition ${
        selected
          ? "border-[var(--brand)] bg-[#e8f5f4] shadow-sm"
          : "border-[var(--line)] bg-white/70 hover:border-[var(--brand)]/40"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold">
            {candidate.kind === "communicating"
              ? candidate.label
              : `${candidate.code} · ${candidate.label}`}
          </div>
          <div className="text-xs text-[var(--muted)]">
            Cap. {candidate.capacity}
            {candidate.memberCodes ? ` · ${candidate.memberCodes.join(" + ")}` : ""}
            {!candidate.capacityOk ? " · supera capacidad" : ""}
          </div>
        </div>
        {candidate.meetsAllPreferences && candidate.preferenceHits > 0 ? (
          <span className="rounded bg-[var(--brand)]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--brand-deep)]">
            Cumple preferencias
          </span>
        ) : null}
      </div>
      {candidate.attributeLabels.length ? (
        <div className="mt-1 text-[11px] text-[var(--muted)]">
          {candidate.attributeLabels.join(" · ")}
        </div>
      ) : null}
    </button>
  );
}

function shiftDay(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
