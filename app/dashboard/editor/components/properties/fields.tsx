"use client";

// Small form primitives shared by the property editors.

import React from "react";

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</p>
      <div className="flex flex-col gap-2.5">{children}</div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs font-medium text-zinc-300">
      {label}
      {children}
    </label>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        value={Number(value.toFixed(2))}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
        className="w-20 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-right text-xs text-zinc-100 outline-none focus:border-violet-500"
      />
    </Field>
  );
}

export function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
}) {
  return (
    <Field label={label}>
      <span className="flex items-center gap-2">
        <input
          type="range"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-24 accent-violet-500"
        />
        <span className="w-8 text-right text-[10px] text-zinc-500">{Math.round(value * 100)}%</span>
      </span>
    </Field>
  );
}

export function TextField({
  label,
  value,
  onChange,
  onCommit,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onCommit?: () => void;
}) {
  return (
    <Field label={label}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        className="w-32 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-violet-500"
      />
    </Field>
  );
}

export function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-32 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-violet-500"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function ColorField({
  label,
  value,
  onChange,
  allowNone,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  allowNone?: boolean;
}) {
  return (
    <Field label={label}>
      <span className="flex items-center gap-1.5">
        {allowNone && (
          <button
            onClick={() => onChange(null)}
            className={`rounded px-1.5 py-0.5 text-[10px] cursor-pointer ${
              value === null ? "bg-violet-600/15 text-violet-400" : "text-zinc-500 hover:text-zinc-200"
            }`}
          >
            None
          </button>
        )}
        <input
          type="color"
          value={value ?? "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-6 w-8 cursor-pointer rounded border border-zinc-700 bg-zinc-950 p-0"
        />
      </span>
    </Field>
  );
}
