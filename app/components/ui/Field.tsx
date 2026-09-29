// Form field primitives for the emerald design system.
//
// `error` and `hint` render under the control and are wired to it with
// aria-describedby (and aria-invalid for an error), so a screen reader
// announces the message when the field is focused instead of the form only
// ever reporting problems through a banner or a toast.

import { useId } from "react";

export function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-semibold text-ink-soft uppercase tracking-wide mb-1.5">
      {children}
    </label>
  );
}

interface FieldMessageProps {
  /** Shown in the error color and marks the control aria-invalid. */
  error?: string | null;
  /** Neutral helper text; hidden while an error is showing. */
  hint?: string | null;
}

// Placeholder uses fg-subtle (~5:1 on panel) — the old ink-soft/50 was ~2.6:1.
const CONTROL =
  "w-full text-sm bg-panel border rounded-xl px-4 py-2.5 text-ink placeholder:text-fg-subtle outline-none focus:ring-2 transition-all disabled:bg-surface disabled:text-ink-soft";
const CONTROL_OK = "border-card-border focus:border-primary/60 focus:ring-primary/25";
const CONTROL_ERROR = "border-error/60 focus:border-error focus:ring-error/25";

function useFieldMessage({ error, hint }: FieldMessageProps, id: string | undefined) {
  const generated = useId();
  const baseId = id ?? generated;
  const messageId = error || hint ? `${baseId}-msg` : undefined;
  const message = error ? (
    <p id={messageId} role="alert" className="mt-1.5 text-xs text-error">{error}</p>
  ) : hint ? (
    <p id={messageId} className="mt-1.5 text-xs text-fg-muted">{hint}</p>
  ) : null;
  return { messageId, message, invalid: !!error };
}

function describedBy(own: string | undefined, extra: string | undefined): string | undefined {
  return [own, extra].filter(Boolean).join(" ") || undefined;
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement> & FieldMessageProps) {
  const { className = "", error, hint, ...rest } = props;
  const { messageId, message, invalid } = useFieldMessage({ error, hint }, rest.id);
  const input = (
    <input
      {...rest}
      aria-invalid={invalid || rest["aria-invalid"] || undefined}
      aria-describedby={describedBy(rest["aria-describedby"], messageId)}
      className={`${CONTROL} ${invalid ? CONTROL_ERROR : CONTROL_OK} ${className}`}
    />
  );
  return message ? <>{input}{message}</> : input;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & FieldMessageProps) {
  const { className = "", error, hint, ...rest } = props;
  const { messageId, message, invalid } = useFieldMessage({ error, hint }, rest.id);
  const textarea = (
    <textarea
      {...rest}
      aria-invalid={invalid || rest["aria-invalid"] || undefined}
      aria-describedby={describedBy(rest["aria-describedby"], messageId)}
      className={`${CONTROL} ${invalid ? CONTROL_ERROR : CONTROL_OK} resize-y ${className}`}
    />
  );
  return message ? <>{textarea}{message}</> : textarea;
}
