import * as React from "react";
import { cx } from "../../utils/cx";
import { AlertTriangleIcon, InfoIcon, CheckIcon, XIcon } from "../../icons";

export type AlertTone = "success" | "warning" | "danger" | "info";

export interface AlertProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  tone?: AlertTone;
  title?: React.ReactNode;
}

const toneConfig: Record<AlertTone, { box: string; title: string; body: string; Icon: React.ComponentType<{ className?: string }> }> = {
  success: { box: "bg-green-50 border-green-200", title: "text-green-900", body: "text-green-700", Icon: CheckIcon },
  warning: { box: "bg-amber-50 border-amber-200", title: "text-amber-900", body: "text-amber-700", Icon: AlertTriangleIcon },
  danger: { box: "bg-red-50 border-red-100", title: "text-red-900", body: "text-red-600", Icon: XIcon },
  info: { box: "bg-blue-50 border-blue-100", title: "text-blue-900", body: "text-blue-700", Icon: InfoIcon },
};

export function Alert({ tone = "info", title, className = "", children, ...props }: AlertProps) {
  const { box, title: titleClass, body, Icon } = toneConfig[tone];
  return (
    <div className={cx("rounded-xl border p-4 flex items-start gap-3", box, className)} {...props}>
      <Icon className={cx("h-4 w-4 flex-shrink-0 mt-0.5", titleClass)} />
      <div className="flex-1 min-w-0">
        {title && <p className={cx("text-sm font-semibold", titleClass)}>{title}</p>}
        <div className={cx("text-xs mt-0.5", body)}>{children}</div>
      </div>
    </div>
  );
}
