// First focusable element on every shell: lets a keyboard user jump past the
// navbar/sidebar straight to the page content. Invisible until focused.
// The target is the shell's <main id="main" tabIndex={-1}>.
export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-full focus:bg-primary focus:text-on-primary focus:text-sm focus:font-semibold focus:outline-none focus:ring-2 focus:ring-primary/70 focus:ring-offset-2 focus:ring-offset-bg"
    >
      Skip to content
    </a>
  );
}
