// Design-environment adapter for next/link. The real component needs a mounted
// Next.js App Router and throws without one; in a Claude Design render there is
// no router, so a plain anchor is the faithful equivalent. Next-only props are
// dropped so they never reach the DOM.
import { forwardRef, type AnchorHTMLAttributes, type ReactNode } from "react";

type Href = string | { pathname?: string; query?: Record<string, string | number>; hash?: string };

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: Href;
  children?: ReactNode;
  prefetch?: boolean | null;
  replace?: boolean;
  scroll?: boolean;
  shallow?: boolean;
  passHref?: boolean;
  legacyBehavior?: boolean;
  locale?: string | false;
};

function toHref(href: Href): string {
  if (typeof href === "string") return href;
  const qs = href.query
    ? "?" + new URLSearchParams(Object.entries(href.query).map(([k, v]) => [k, String(v)])).toString()
    : "";
  return `${href.pathname ?? ""}${qs}${href.hash ? `#${href.hash}` : ""}`;
}

const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { href, prefetch: _p, replace: _r, scroll: _s, shallow: _sh, passHref: _ph, legacyBehavior: _lb, locale: _l, ...rest },
  ref,
) {
  return <a ref={ref} href={toHref(href)} {...rest} />;
});

export default Link;
