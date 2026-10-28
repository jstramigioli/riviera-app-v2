"use client";

import { useState, useTransition } from "react";
import {
  applyOptimizerAction,
  previewOptimizerAction,
} from "@/app/actions/optimizer";
import { FieldLabel, HelpTooltip } from "@/components/HelpTooltip";
import type { OptimizerPreview } from "@/lib/optimizer";

function shiftDay(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function OptimizerPanel() {
  const today = new Date().toISOString().slice(0, 10);
  const [windowStart, setWindowStart] = useState(today);
  const [windowEnd, setWindowEnd] = useState(shiftDay(today, 21));
  const [preview, setPreview] = useState<OptimizerPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmText, setConfirmText] = useState("");

  function runPreview() {
    setError(null);
    setSuccess(null);
    setConfirmText("");
    const fd = new FormData();
    fd.set("windowStart", windowStart);
    fd.set("windowEnd", windowEnd);
    startTransition(async () => {
      const res = await previewOptimizerAction(fd);
      if (!res.ok) {
        setPreview(null);
        setError(res.error);
        return;
      }
      setPreview(res.preview);
    });
  }

  function applyMoves() {
    if (!preview?.moves.length) return;
    if (confirmText.trim().toLowerCase() !== "aplicar") {
      setError('Escribí «aplicar» para confirmar los cambios del preview.');
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set(
      "movesJson",
      JSON.stringify(
        preview.moves.map((m) => ({
          reservationId: m.reservationId,
          toUnitId: m.toUnitId,
        })),
      ),
    );
    fd.set("confirmApply", "yes");
    startTransition(async () => {
      const res = await applyOptimizerAction(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(`Se aplicaron ${res.applied} cambio${res.applied === 1 ? "" : "s"}.`);
      setPreview(null);
      setConfirmText("");
    });
  }

  return (
    <div className="space-y-5">
      <section className="panel space-y-4 rounded-xl p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-[var(--brand-deep)]">
            Ventana a optimizar
          </h2>
          <HelpTooltip text="Solo propone mover prerreservas y confirmadas con asignación flexible. No toca habitaciones fijadas ni huéspedes en casa." />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <FieldLabel>Desde</FieldLabel>
            <input
              className="input"
              type="date"
              value={windowStart}
              onChange={(e) => setWindowStart(e.target.value)}
            />
          </div>
          <div>
            <FieldLabel>Hasta</FieldLabel>
            <input
              className="input"
              type="date"
              value={windowEnd}
              onChange={(e) => setWindowEnd(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <button
              className="btn btn-primary w-full"
              type="button"
              disabled={pending}
              onClick={runPreview}
            >
              {pending ? "Calculando…" : "Ver preview"}
            </button>
          </div>
        </div>
        <ul className="text-xs text-[var(--muted)] space-y-1 list-disc pl-4">
          <li>Manual: nada se mueve hasta que confirmés el preview.</li>
          <li>Flexible = sin «habitación fijada»; respeta características obligatorias.</li>
          <li>Objetivo: menos huecos entre estadías (mejor ocupación).</li>
        </ul>
      </section>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900">
          {success}
        </div>
      ) : null}

      {preview ? (
        <section className="panel space-y-4 rounded-xl p-5">
          <div>
            <h2 className="text-lg font-semibold text-[var(--brand-deep)]">Preview</h2>
            <p className="text-sm text-[var(--muted)]">{preview.summary}</p>
            <p className="text-xs text-[var(--muted)] mt-1">
              Flexibles revisadas: {preview.movableCount} · Fijadas omitidas:{" "}
              {preview.fixedSkipped} · En casa omitidas: {preview.inHouseSkipped}
            </p>
          </div>

          {preview.moves.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              No hay reasignaciones útiles en esta ventana.
            </p>
          ) : (
            <>
              <div className="overflow-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="text-xs uppercase text-[var(--muted)] border-b border-[var(--line)]">
                    <tr>
                      <th className="py-2 pr-2">Reserva</th>
                      <th className="py-2 pr-2">Fechas</th>
                      <th className="py-2 pr-2">De</th>
                      <th className="py-2 pr-2">A</th>
                      <th className="py-2">Por qué</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.moves.map((m) => (
                      <tr key={m.reservationId} className="border-b border-[var(--line)]">
                        <td className="py-2 pr-2">
                          <div className="font-semibold">{m.reservationCode}</div>
                          <div className="text-xs text-[var(--muted)]">
                            {m.guestName || "—"}
                          </div>
                        </td>
                        <td className="py-2 pr-2 whitespace-nowrap">
                          {m.checkInDate} → {m.checkOutDate}
                        </td>
                        <td className="py-2 pr-2 font-semibold">{m.fromUnitCode}</td>
                        <td className="py-2 pr-2 font-semibold text-[var(--brand-deep)]">
                          {m.toUnitCode}
                        </td>
                        <td className="py-2 text-[var(--muted)]">{m.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 space-y-3">
                <p className="text-sm text-amber-950">
                  Revisá la tabla. Para aplicar, escribí <strong>aplicar</strong> y confirmá.
                  Esto cambia habitaciones en el calendario.
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[180px] flex-1">
                    <FieldLabel>Confirmación</FieldLabel>
                    <input
                      className="input"
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      placeholder="aplicar"
                      autoComplete="off"
                    />
                  </div>
                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={pending || confirmText.trim().toLowerCase() !== "aplicar"}
                    onClick={applyMoves}
                  >
                    {pending ? "Aplicando…" : "Aplicar cambios"}
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}
