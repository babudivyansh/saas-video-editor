// Form field primitives for the vibrant-gradient design system.

export function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-semibold text-ink-soft uppercase tracking-wide mb-1.5">
      {children}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return (
    <input
      {...rest}
      className={`w-full text-sm bg-panel border border-card-border rounded-xl px-4 py-2.5 text-ink placeholder:text-ink-soft/50 outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/25 transition-all disabled:bg-surface disabled:text-ink-soft ${className}`}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = "", ...rest } = props;
  return (
    <textarea
      {...rest}
      className={`w-full text-sm bg-panel border border-card-border rounded-xl px-4 py-2.5 text-ink placeholder:text-ink-soft/50 outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/25 transition-all disabled:bg-surface disabled:text-ink-soft resize-y ${className}`}
    />
  );
}
