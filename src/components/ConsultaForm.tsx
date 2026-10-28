"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { autosaveQueryAction, convertQueryAction } from "@/app/actions/queries";
import { FieldLabel, HelpTooltip } from "@/components/HelpTooltip";
import { SERVICE_TYPE_LABEL, formatArsPlain } from "@/lib/labels";
import type { AvailabilityCandidate, LiveAvailabilityResult } from "@/lib/availability";
import type { PriceBreakdown } from "@/lib/rates";

type AttributeOpt = { id: string; key: string; label: string };

type InitialQuery = {
  id: string;
  code: string;
  checkInDate: string;
  checkOutDate: string;
  adults: number;
  children: number;
  serviceType: string;
  channel?: string | null;
  notes?: string | null;
  guestFirstName?: string | null;
  guestLastName?: string | null;
  guestPhone?: string | null;
  guestEmail?: string | null;
  guestDocumentNumber?: string | null;
  desiredIds: string[];
};

type Props = {
  attributes: AttributeOpt[];
  initial?: InitialQuery;
  error?: string;
};

type AvailabilityPayload = LiveAvailabilityResult & {
  suggestedTotalArs?: number | null;
  priceBreakdown?: PriceBreakdown | null;
  error?: string;
};

const HELP = {
  consulta:
    "Una consulta es una indagación: se guarda el cliente, fechas y lo que pide, pero no asigna habitación ni aparece en el calendario.",
  autosave:
    "Se guarda solo al tener fechas (y conviene el nombre del cliente). Sin habitación hasta convertir.",
  convert:
    "Al convertir elegís habitación y pasás a prerreserva, confirmada o ingresada. Ahí sí bloquea inventario y se ve en el calendario.",
  override:
    "Podés elegir una habitación que no cumple las características deseadas; el sistema te pide confirmar con un motivo.",
  roomLocked:
    "Habitación fijada: no la mueve el optimizador. Flexible: puede reasignarse entre habitaciones compatibles.",
  desired:
    "Características deseadas: sugieren y ordenan habitaciones. Recepción puede asignar otra con advertencia.",
  nightByNight:
    "Desglose noche a noche según el plan tarifario. El total sugerido es editable al acordar.",
};

function shiftDay(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function ConsultaForm({ attributes, initial, error }: Props) {
  const router = useRouter();
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [queryId, setQueryId] = useState(initial?.id);
  const [code, setCode] = useState(initial?.code);
  const [checkInDate, setCheckInDate] = useState(initial?.checkInDate || today);
  const [checkOutDate, setCheckOutDate] = useState(
    initial?.checkOutDate || shiftDay(today, 2),
  );
  const [adults, setAdults] = useState(initial?.adults ?? 2);
  const [children, setChildren] = useState(initial?.children ?? 0);
  const [serviceType, setServiceType] = useState(initial?.serviceType || "DESAYUNO");
  const [channel, setChannel] = useState(initial?.channel || "");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [guestFirstName, setGuestFirstName] = useState(initial?.guestFirstName || "");
  const [guestLastName, setGuestLastName] = useState(initial?.guestLastName || "");
  const [guestPhone, setGuestPhone] = useState(initial?.guestPhone || "");
  const [guestEmail, setGuestEmail] = useState(initial?.guestEmail || "");
  const [guestDocumentNumber, setGuestDocumentNumber] = useState(
    initial?.guestDocumentNumber || "",
  );
  const [desiredIds, setDesiredIds] = useState<string[]>(initial?.desiredIds ?? []);
  const [selectionKey, setSelectionKey] = useState("");
  const [convertStatus, setConvertStatus] = useState("PRERRESERVA");
  const [roomLocked, setRoomLocked] = useState(false);
  const [overrideAck, setOverrideAck] = useState(false);
  const [overrideNote, setOverrideNote] = useState("");
  const [agreedPrice, setAgreedPrice] = useState("");
  const [data, setData] = useState<AvailabilityPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingConvert, startConvert] = useTransition();
  const skipFirstAutosave = useRef(Boolean(initial?.id));

  useEffect(() => {
    if (!checkInDate || !checkOutDate || checkInDate >= checkOutDate) return;
    if (skipFirstAutosave.current) {
      skipFirstAutosave.current = false;
      return;
    }
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
        guestEmail: guestEmail || null,
        guestDocumentNumber: guestDocumentNumber || null,
        desiredAttributeIds: desiredIds,
      });
      if (!res.ok) {
        setSaveState("error");
        setSaveError(res.error);
        return;
      }
      setSaveState("saved");
      if (!queryId) {
        setQueryId(res.id);
        setCode(res.code);
        router.replace(`/consultas/${res.id}`);
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [
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
    guestEmail,
    guestDocumentNumber,
    desiredIds,
    router,
  ]);

  useEffect(() => {
    if (!checkInDate || !checkOutDate || checkInDate >= checkOutDate) {
      setData(null);
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
        if (
          selectionKey &&
          !json.candidates.some((c) => c.selectionKey === selectionKey)
        ) {
          setSelectionKey("");
        }
        if (json.suggestedTotalArs != null && !agreedPrice) {
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
    agreedPrice,
  ]);

  const selected =
    data?.candidates.find((c) => c.selectionKey === selectionKey) ?? null;
  const needsOverride = Boolean(selected && !selected.meetsAllDesired);

  function toggleDesired(id: string) {
    setDesiredIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function onConvert(formData: FormData) {
    if (!queryId) return;
    if (needsOverride && (!overrideAck || !overrideNote.trim())) return;
    startConvert(() => {
      convertQueryAction(formData);
    });
  }

  return (
    <div className="space-y-5">
      {(error || fetchError || saveError) && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-[var(--danger)]">
          {error || fetchError || saveError}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--muted)]">
        <span className="inline-flex items-center gap-1">
          {code ? (
            <>
              Consulta <strong className="text-[var(--ink)]">{code}</strong>
            </>
          ) : (
            "Borrador nuevo"
          )}
          <HelpTooltip text={HELP.consulta} />
        </span>
        <span className="inline-flex items-center gap-1">
          {saveState === "saving"
            ? "Guardando…"
            : saveState === "saved"
              ? "Guardado"
              : saveState === "error"
                ? "Error al guardar"
                : "Autosave"}
          <HelpTooltip text={HELP.autosave} />
        </span>
      </div>

      <section className="panel space-y-4 rounded-xl p-5">
        <h2 className="text-lg font-semibold text-[var(--brand-deep)]">Cliente y fechas</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <FieldLabel>Nombre</FieldLabel>
            <input
              className="input"
              value={guestFirstName}
              onChange={(e) => setGuestFirstName(e.target.value)}
            />
          </div>
          <div>
            <FieldLabel>Apellido</FieldLabel>
            <input
              className="input"
              value={guestLastName}
              onChange={(e) => setGuestLastName(e.target.value)}
            />
          </div>
          <div>
            <FieldLabel>Teléfono</FieldLabel>
            <input
              className="input"
              value={guestPhone}
              onChange={(e) => setGuestPhone(e.target.value)}
            />
          </div>
          <div>
            <FieldLabel>Documento</FieldLabel>
            <input
              className="input"
              value={guestDocumentNumber}
              onChange={(e) => setGuestDocumentNumber(e.target.value)}
            />
          </div>
          <div>
            <FieldLabel>Email</FieldLabel>
            <input
              className="input"
              type="email"
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <FieldLabel>Llegada</FieldLabel>
            <input
              className="input"
              type="date"
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
              value={children}
              onChange={(e) => setChildren(Number(e.target.value) || 0)}
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel>Servicio / pensión</FieldLabel>
            <select
              className="select"
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
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              placeholder="WhatsApp / Tel / Walk-in"
            />
          </div>
        </div>
        <div>
          <FieldLabel>Notas</FieldLabel>
          <textarea
            className="textarea"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Opcional"
          />
        </div>
      </section>

      <section className="panel space-y-3 rounded-xl p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-[var(--brand-deep)]">
            Características deseadas
          </h2>
          <HelpTooltip text={HELP.desired} />
        </div>
        <div className="flex flex-wrap gap-2">
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

      <LivePanel
        loading={loading}
        data={data}
        serviceType={serviceType}
        onSelectService={setServiceType}
      />

      {selectionKey && data?.priceBreakdown ? (
        <NightByNightPanel breakdown={data.priceBreakdown} />
      ) : null}

      <section className="panel space-y-3 rounded-xl p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-[var(--brand-deep)]">
            Explorar habitaciones (para convertir)
          </h2>
          <HelpTooltip text={HELP.convert} />
        </div>
        <p className="text-xs text-[var(--muted)]">
          La consulta no reserva habitación. Elegí una acá solo cuando vayas a convertir.
        </p>
        <div className="grid max-h-80 gap-2 overflow-auto sm:grid-cols-2 lg:grid-cols-3">
          {(data?.candidates ?? []).map((c) => (
            <SuggestionCard
              key={c.selectionKey}
              candidate={c}
              selected={selectionKey === c.selectionKey}
              onSelect={() => {
                setSelectionKey(c.selectionKey);
                setOverrideAck(false);
                setAgreedPrice("");
              }}
            />
          ))}
          {!loading && data && data.candidates.length === 0 ? (
            <p className="text-sm text-[var(--muted)] sm:col-span-2">
              No hay habitaciones libres en esas fechas.
            </p>
          ) : null}
        </div>
      </section>

      {queryId && selected ? (
        <section className="panel space-y-4 rounded-xl p-5">
          <h2 className="text-lg font-semibold text-[var(--brand-deep)]">
            Convertir en reserva
          </h2>
          {needsOverride ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-950 space-y-2">
              <p className="font-semibold inline-flex items-center gap-1">
                Esta habitación no cumple lo deseado
                <HelpTooltip text={HELP.override} />
              </p>
              <p>
                Falta:{" "}
                {selected.missingDesiredLabels.join(", ") || "características deseadas"}
              </p>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={overrideAck}
                  onChange={(e) => setOverrideAck(e.target.checked)}
                  className="mt-1"
                />
                <span>Entiendo y quiero asignarla igual</span>
              </label>
              <div>
                <FieldLabel>Motivo del override</FieldLabel>
                <input
                  className="input"
                  value={overrideNote}
                  onChange={(e) => setOverrideNote(e.target.value)}
                  placeholder="Ej. cliente acepta sin balcón"
                  disabled={!overrideAck}
                />
              </div>
            </div>
          ) : null}

          <form action={onConvert} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="queryId" value={queryId} />
            <input
              type="hidden"
              name="physicalUnitId"
              value={selected.kind === "unit" ? selected.id : ""}
            />
            <input
              type="hidden"
              name="compositeUnitId"
              value={selected.kind === "communicating" ? selected.id : ""}
            />
            <input
              type="hidden"
              name="allowDesiredOverride"
              value={needsOverride ? "1" : ""}
            />
            <input type="hidden" name="overrideNote" value={overrideNote} />
            <div>
              <FieldLabel>Estado al convertir</FieldLabel>
              <select
                className="select"
                name="status"
                value={convertStatus}
                onChange={(e) => setConvertStatus(e.target.value)}
              >
                <option value="PRERRESERVA">Prerreserva</option>
                <option value="CONFIRMADA">Confirmada</option>
                <option value="IN_HOUSE">Ingresada</option>
              </select>
            </div>
            <div>
              <FieldLabel help={HELP.nightByNight}>Precio acordado (ARS)</FieldLabel>
              <input
                className="input"
                name="agreedPriceArs"
                type="number"
                min={0}
                value={agreedPrice}
                onChange={(e) => setAgreedPrice(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                name="roomLocked"
                checked={roomLocked}
                onChange={(e) => setRoomLocked(e.target.checked)}
              />
              Habitación fijada
              <HelpTooltip text={HELP.roomLocked} />
            </label>
            <button
              className="btn btn-primary sm:col-span-2"
              type="submit"
              disabled={
                pendingConvert ||
                (needsOverride && (!overrideAck || !overrideNote.trim()))
              }
            >
              {pendingConvert ? "Convirtiendo…" : `Convertir → ${selected.code}`}
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}

function NightByNightPanel({ breakdown }: { breakdown: PriceBreakdown }) {
  return (
    <section className="panel space-y-3 rounded-xl p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold text-[var(--brand-deep)]">
          Desglose de precio sugerido
        </h2>
        <HelpTooltip text="Precio noche a noche según tarifas. Si hay solapes de período, gana el tramo más corto." />
      </div>
      <div className="overflow-auto">
        <table className="w-full min-w-[320px] text-sm">
          <thead className="text-xs uppercase text-[var(--muted)] border-b border-[var(--line)]">
            <tr>
              <th className="py-1.5 text-left font-semibold">Noche</th>
              <th className="py-1.5 text-left font-semibold">Período</th>
              <th className="py-1.5 text-right font-semibold">ARS</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.nights.map((n) => (
              <tr
                key={n.date}
                className={`border-b border-[var(--line)] ${
                  n.missing ? "bg-red-50 text-red-900" : ""
                }`}
              >
                <td className="py-1.5">{n.date}</td>
                <td className="py-1.5 text-[var(--muted)]">
                  {n.missing ? "Sin tarifa cargada" : n.periodName || "—"}
                </td>
                <td className="py-1.5 text-right font-medium">
                  {n.amountArs != null ? `$ ${formatArsPlain(n.amountArs)}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="pt-2 font-semibold" colSpan={2}>
                Total sugerido
              </td>
              <td className="pt-2 text-right font-semibold">
                {breakdown.totalArs != null
                  ? `$ ${formatArsPlain(breakdown.totalArs)}`
                  : "Incompleto"}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function LivePanel({
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
  const matching = data?.candidates.filter((c) => c.meetsAllDesired).length ?? 0;
  const total = data?.candidates.length ?? 0;
  return (
    <section
      className={`panel rounded-xl p-5 ${
        total > 0 ? "avail-yes" : data ? "avail-no" : ""
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Disponibilidad (exploración)
          </div>
          <div
            className="mt-1 text-2xl font-semibold text-[var(--brand-deep)]"
            style={{ fontFamily: "var(--font-display), serif" }}
          >
            {loading && !data
              ? "Consultando…"
              : data
                ? total > 0
                  ? matching > 0
                    ? `Sí · ${total} libres · ${matching} con lo deseado`
                    : `Sí · ${total} libres (ninguna con todos los deseados)`
                  : "Sin habitaciones libres"
                : "Ingresá fechas"}
          </div>
        </div>
        {loading ? (
          <span className="live-pulse text-xs font-semibold text-[var(--brand)]">
            Actualizando
          </span>
        ) : null}
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {(data?.services ?? []).map((s) => {
          const key = s.serviceType as keyof typeof SERVICE_TYPE_LABEL;
          const active = serviceType === s.serviceType;
          return (
            <button
              key={s.serviceType}
              type="button"
              disabled={!s.available}
              onClick={() => onSelectService(s.serviceType)}
              className={`rounded-lg border px-3 py-2 text-left text-sm ${
                active ? "border-[var(--brand)] bg-white shadow-sm" : "border-[var(--line)]"
              } ${s.available ? "" : "opacity-45 cursor-not-allowed"}`}
            >
              <div className="font-semibold">{SERVICE_TYPE_LABEL[key]}</div>
              <div className="text-xs text-[var(--muted)]">
                {s.available
                  ? s.suggestedNightlyArs != null
                    ? `Desde ${formatArsPlain(s.suggestedNightlyArs)} ARS/noche`
                    : "Con tarifa"
                  : "Sin tarifa"}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function SuggestionCard({
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
          <div className="text-xs text-[var(--muted)]">Cap. {candidate.capacity}</div>
        </div>
        {candidate.meetsAllDesired ? (
          <span className="rounded bg-[var(--brand)]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--brand-deep)]">
            Cumple
          </span>
        ) : (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
            Parcial
          </span>
        )}
      </div>
      {!candidate.meetsAllDesired && candidate.missingDesiredLabels.length ? (
        <div className="mt-1 text-[11px] text-amber-800">
          Falta: {candidate.missingDesiredLabels.join(", ")}
        </div>
      ) : null}
    </button>
  );
}
