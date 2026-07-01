import { useState } from "react";
import { Tabs } from "@clipiro/ui";

const items = [
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly (save 20%)" },
];

export function BillingToggle() {
  const [value, setValue] = useState("yearly");
  return <Tabs items={items} value={value} onChange={setValue} />;
}
