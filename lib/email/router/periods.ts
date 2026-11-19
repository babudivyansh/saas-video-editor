// Quota periods, all in UTC. Resend documents its daily quota as resetting
// at midnight UTC; Brevo and Mailjet don't publish a reset time, so UTC
// midnight is the assumption for them too, and the dashboard labels their
// counts "estimated".

export type PeriodType = "day" | "month";

export interface Period {
  type: PeriodType;
  start: Date;
  end: Date;
}

export function dayPeriod(now: Date): Period {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return { type: "day", start, end: new Date(start.getTime() + 86_400_000) };
}

export function monthPeriod(now: Date): Period {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { type: "month", start, end };
}

export function periodFor(type: PeriodType, now: Date): Period {
  return type === "day" ? dayPeriod(now) : monthPeriod(now);
}
