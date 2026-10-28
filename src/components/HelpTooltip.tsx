"use client";

import { useId, useState } from "react";

/** Accessible hover/focus "?" help for non-obvious hotel fields. */
export function HelpTooltip({ text, label = "Ayuda" }: { text: string; label?: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-flex align-middle">
      <button
        type="button"
        className="help-tip"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        ?
      </button>
      {open ? (
        <span id={id} role="tooltip" className="help-tip-panel">
          {text}
        </span>
      ) : null}
    </span>
  );
}

export function FieldLabel({
  children,
  help,
}: {
  children: React.ReactNode;
  help?: string;
}) {
  return (
    <label className="label inline-flex items-center gap-1.5">
      <span>{children}</span>
      {help ? <HelpTooltip text={help} /> : null}
    </label>
  );
}
