import * as React from "react";
import { cx } from "../../utils/cx";

export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  src?: string | null;
  name?: string;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-lg",
};

function initials(name?: string) {
  if (!name) return "";
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join("");
}

export function Avatar({ src, name, size = "md", className = "", ...props }: AvatarProps) {
  return (
    <span
      className={cx(
        "inline-flex items-center justify-center rounded-full overflow-hidden bg-blue-50 text-primary font-bold flex-shrink-0",
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {src ? (
        <img src={src} alt={name ?? "Avatar"} className="h-full w-full object-cover" />
      ) : (
        initials(name)
      )}
    </span>
  );
}
