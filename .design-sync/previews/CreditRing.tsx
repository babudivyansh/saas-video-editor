import { CreditRing } from "@clipiro/ui";

// Monthly credit usage ring: `used` of `total`, number in the centre.
export const WithCaption = () => (
  <div className="flex items-center gap-4">
    <CreditRing used={640} total={1000} />
    <div>
      <p className="text-sm font-semibold text-fg">640 of 1,000 credits used</p>
      <p className="text-xs text-fg-muted">Refills on 12 October</p>
    </div>
  </div>
);

export const Levels = () => (
  <div className="flex items-center gap-6">
    <CreditRing used={120} total={1000} />
    <CreditRing used={500} total={1000} />
    <CreditRing used={950} total={1000} />
    <CreditRing used={500} total={1000} size={48} />
  </div>
);
