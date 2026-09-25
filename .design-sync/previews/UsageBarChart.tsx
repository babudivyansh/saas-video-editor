import { Card, UsageBarChart } from "@clipiro/ui";

const DAYS = [42, 18, 65, 30, 0, 12, 88, 54, 47, 20, 71, 96, 38, 60].map((credits, i) => ({
  date: `Sep ${String(i + 11).padStart(2, "0")}`,
  credits,
}));

// Daily credit usage as gradient bars, with first/last date and the peak
// underneath. Fills its container's width; `height` sets the plot height.
export const InCard = () => (
  <Card padding="md" className="max-w-xl">
    <p className="text-sm font-semibold text-fg mb-3">Credits used · last 14 days</p>
    <UsageBarChart data={DAYS} />
  </Card>
);

export const Empty = () => (
  <Card padding="md" className="max-w-xl">
    <p className="text-sm font-semibold text-fg mb-3">Credits used · last 14 days</p>
    <UsageBarChart data={[]} />
  </Card>
);
