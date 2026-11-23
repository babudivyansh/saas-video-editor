import type { DemoClipsResponse } from "./model";

// Under a demo project's clips: the footage's credit, which its CC BY licence
// requires wherever it is shown (title, creator, link, changes made).

export function DemoCredit({ demo }: { demo: DemoClipsResponse["demo"] }) {
  return (
    <p className="pt-2 text-center text-xs text-fg-subtle">
      Demo footage:{" "}
      <a href={demo.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:text-fg-muted hover:underline">
        “{demo.title}”, {demo.creator}
      </a>
      , CC BY, cut to 10 min.
    </p>
  );
}
