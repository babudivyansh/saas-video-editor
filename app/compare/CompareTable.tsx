import type { CompareRow } from "./data";

/** Side-by-side table: a real <table> with row headers, scrolling inside its own box on phones. */
export default function CompareTable({ them, rows, caption }: { them: string; rows: CompareRow[]; caption: string }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-card-border bg-panel">
      <table className="w-full min-w-[560px] border-collapse text-left text-[14px]">
        <caption className="caption-bottom px-5 py-3 text-left text-[12.5px] text-ink-soft">{caption}</caption>
        <thead>
          <tr className="bg-surface">
            <th scope="col" className="w-[22%] border-b border-card-border px-5 py-3 font-semibold text-ink">
              <span className="sr-only">Feature</span>
            </th>
            <th scope="col" className="border-b border-card-border px-5 py-3 font-semibold text-ink">{them}</th>
            <th scope="col" className="border-b border-card-border px-5 py-3 font-semibold text-brand">Clipiro</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-card-border align-top last:border-b-0">
              <th scope="row" className="px-5 py-3 font-semibold text-ink">{row.label}</th>
              <td className="px-5 py-3 leading-[1.55] text-ink-soft">{row.them}</td>
              <td className="px-5 py-3 leading-[1.55] text-ink">{row.us}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
