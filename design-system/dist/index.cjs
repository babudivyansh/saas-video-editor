"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  Alert: () => Alert,
  AlertTriangleIcon: () => AlertTriangleIcon,
  ArrowRightIcon: () => ArrowRightIcon,
  Avatar: () => Avatar,
  Badge: () => Badge,
  Button: () => Button,
  Card: () => Card,
  CheckIcon: () => CheckIcon,
  Checkbox: () => Checkbox,
  ChevronDownIcon: () => ChevronDownIcon,
  CreditBadge: () => CreditBadge,
  FAQAccordionItem: () => FAQAccordionItem,
  Footer: () => Footer,
  InfoIcon: () => InfoIcon,
  Input: () => Input,
  Modal: () => Modal,
  NavBar: () => NavBar,
  PlayIcon: () => PlayIcon,
  PricingCard: () => PricingCard,
  ProgressBar: () => ProgressBar,
  Select: () => Select,
  SparklesIcon: () => SparklesIcon,
  Spinner: () => Spinner,
  StarIcon: () => StarIcon,
  Switch: () => Switch,
  Tabs: () => Tabs,
  Textarea: () => Textarea,
  ToolCard: () => ToolCard,
  Tooltip: () => Tooltip,
  XIcon: () => XIcon,
  ZapIcon: () => ZapIcon
});
module.exports = __toCommonJS(index_exports);

// src/utils/cx.ts
function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

// src/components/Spinner/Spinner.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var toneClasses = {
  light: "border-white/30 border-t-white",
  dark: "border-primary/20 border-t-primary"
};
var sizeClasses = {
  sm: "w-4 h-4 border-2",
  md: "w-6 h-6 border-[3px]"
};
function Spinner({ tone = "dark", size = "sm", className = "", ...props }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "span",
    {
      role: "status",
      "aria-label": "Loading",
      className: cx("inline-block rounded-full animate-spin", toneClasses[tone], sizeClasses[size], className),
      ...props
    }
  );
}

// src/components/Button/Button.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
var variantClasses = {
  primary: "bg-primary text-white hover:bg-primary-hover hover:scale-[1.02] shadow-sm dark:hover:scale-[1.02]",
  secondary: "border border-gray-200 bg-white text-gray-800 hover:border-gray-300 hover:bg-gray-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800",
  ghost: "text-primary hover:text-primary-hover bg-transparent"
};
var sizeClasses2 = {
  sm: "px-4 py-2 text-sm rounded-full",
  md: "px-6 py-3 text-base rounded-full",
  lg: "px-8 py-4 text-base rounded-full"
};
function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className = "",
  children,
  ...props
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
    "button",
    {
      className: cx(
        "inline-flex items-center justify-center gap-2 font-bold transition-all disabled:opacity-60 disabled:cursor-wait",
        variantClasses[variant],
        sizeClasses2[size],
        className
      ),
      disabled: disabled || loading,
      ...props,
      children: [
        loading && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Spinner, { tone: variant === "primary" ? "light" : "dark" }),
        children
      ]
    }
  );
}

// src/components/Input/Input.tsx
var React = __toESM(require("react"), 1);
var import_jsx_runtime3 = require("react/jsx-runtime");
var Input = React.forwardRef(function Input2({ label, error, id, className = "", ...props }, ref) {
  const inputId = id ?? React.useId();
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "w-full", children: [
    label && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { htmlFor: inputId, className: "text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5 dark:text-zinc-400", children: label }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      "input",
      {
        ref,
        id: inputId,
        className: cx(
          "w-full bg-gray-50 border rounded-xl px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-transparent transition-all",
          "dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500",
          error ? "border-danger" : "border-gray-200 dark:border-zinc-700",
          className
        ),
        "aria-invalid": !!error,
        ...props
      }
    ),
    error && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "mt-1.5 text-xs font-medium text-danger", children: error })
  ] });
});

// src/components/Textarea/Textarea.tsx
var React2 = __toESM(require("react"), 1);
var import_jsx_runtime4 = require("react/jsx-runtime");
var Textarea = React2.forwardRef(function Textarea2({ label, error, id, className = "", rows = 4, ...props }, ref) {
  const textareaId = id ?? React2.useId();
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "w-full", children: [
    label && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("label", { htmlFor: textareaId, className: "text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5 dark:text-zinc-400", children: label }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      "textarea",
      {
        ref,
        id: textareaId,
        rows,
        className: cx(
          "w-full bg-gray-50 border rounded-xl px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-transparent transition-all resize-y",
          "dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500",
          error ? "border-danger" : "border-gray-200 dark:border-zinc-700",
          className
        ),
        "aria-invalid": !!error,
        ...props
      }
    ),
    error && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "mt-1.5 text-xs font-medium text-danger", children: error })
  ] });
});

// src/components/Select/Select.tsx
var React3 = __toESM(require("react"), 1);

// src/icons/index.tsx
var import_jsx_runtime5 = require("react/jsx-runtime");
function CheckIcon({ className = "", ...props }) {
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("svg", { className, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", "aria-hidden": "true", ...props, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("path", { d: "M20 6L9 17l-5-5", strokeLinecap: "round", strokeLinejoin: "round" }) });
}
function XIcon({ className = "", ...props }) {
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("svg", { className, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", "aria-hidden": "true", ...props, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("path", { d: "M18 6L6 18M6 6l12 12", strokeLinecap: "round", strokeLinejoin: "round" }) });
}
function ChevronDownIcon({ className = "", ...props }) {
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("svg", { className, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", "aria-hidden": "true", ...props, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("path", { d: "M6 9l6 6 6-6", strokeLinecap: "round", strokeLinejoin: "round" }) });
}
function ZapIcon({ className = "", ...props }) {
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("svg", { className, viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": "true", ...props, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("path", { d: "M13 2L3 14h9l-1 8 10-12h-9l1-8z" }) });
}
function SparklesIcon({ className = "", ...props }) {
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("svg", { className, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", "aria-hidden": "true", ...props, children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("path", { d: "M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z", strokeLinejoin: "round" }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("path", { d: "M19 14l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z", strokeLinejoin: "round" })
  ] });
}
function ArrowRightIcon({ className = "", ...props }) {
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("svg", { className, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", "aria-hidden": "true", ...props, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("path", { d: "M5 12h14M12 5l7 7-7 7", strokeLinecap: "round", strokeLinejoin: "round" }) });
}
function PlayIcon({ className = "", ...props }) {
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("svg", { className, viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": "true", ...props, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("path", { d: "M8 5v14l11-7z" }) });
}
function StarIcon({ className = "", ...props }) {
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("svg", { className, viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": "true", ...props, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("path", { d: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" }) });
}
function AlertTriangleIcon({ className = "", ...props }) {
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("svg", { className, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", "aria-hidden": "true", ...props, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("path", { d: "M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z", strokeLinecap: "round", strokeLinejoin: "round" }) });
}
function InfoIcon({ className = "", ...props }) {
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("svg", { className, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", "aria-hidden": "true", ...props, children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("circle", { cx: "12", cy: "12", r: "9" }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("path", { d: "M12 11v5m0-8h.01", strokeLinecap: "round", strokeLinejoin: "round" })
  ] });
}

// src/components/Select/Select.tsx
var import_jsx_runtime6 = require("react/jsx-runtime");
var Select = React3.forwardRef(function Select2({ label, error, id, options, className = "", ...props }, ref) {
  const selectId = id ?? React3.useId();
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "w-full", children: [
    label && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("label", { htmlFor: selectId, className: "text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5 dark:text-zinc-400", children: label }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "relative", children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
        "select",
        {
          ref,
          id: selectId,
          className: cx(
            "w-full appearance-none bg-gray-50 border rounded-xl px-4 py-3 pr-10 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-transparent transition-all",
            "dark:bg-zinc-900 dark:text-zinc-100",
            error ? "border-danger" : "border-gray-200 dark:border-zinc-700",
            className
          ),
          "aria-invalid": !!error,
          ...props,
          children: options.map((opt) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: opt.value, children: opt.label }, opt.value))
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(ChevronDownIcon, { className: "pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" })
    ] }),
    error && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "mt-1.5 text-xs font-medium text-danger", children: error })
  ] });
});

// src/components/Checkbox/Checkbox.tsx
var React4 = __toESM(require("react"), 1);
var import_jsx_runtime7 = require("react/jsx-runtime");
var Checkbox = React4.forwardRef(function Checkbox2({ label, tone = "primary", id, className = "", ...props }, ref) {
  const checkboxId = id ?? React4.useId();
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("label", { htmlFor: checkboxId, className: "flex items-start gap-2.5 cursor-pointer", children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
      "input",
      {
        ref,
        type: "checkbox",
        id: checkboxId,
        className: cx("mt-0.5 w-4 h-4 flex-shrink-0", tone === "accent" ? "accent-accent" : "accent-primary", className),
        ...props
      }
    ),
    label && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "text-sm text-gray-700 dark:text-zinc-300", children: label })
  ] });
});

// src/components/Switch/Switch.tsx
var import_jsx_runtime8 = require("react/jsx-runtime");
function Switch({ checked, onChange, label, disabled, className = "" }) {
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("label", { className: cx("inline-flex items-center gap-2.5 cursor-pointer", disabled && "opacity-60 cursor-not-allowed", className), children: [
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
      "button",
      {
        type: "button",
        role: "switch",
        "aria-checked": checked,
        disabled,
        onClick: () => onChange(!checked),
        className: cx(
          "relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors",
          checked ? "bg-primary" : "bg-gray-200 dark:bg-zinc-700"
        ),
        children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
          "span",
          {
            className: cx(
              "inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform",
              checked ? "translate-x-5" : "translate-x-1"
            )
          }
        )
      }
    ),
    label && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "text-sm text-gray-700 dark:text-zinc-300", children: label })
  ] });
}

// src/components/Badge/Badge.tsx
var import_jsx_runtime9 = require("react/jsx-runtime");
var toneClasses2 = {
  neutral: "bg-gray-100 text-gray-700 dark:bg-zinc-800 dark:text-zinc-300",
  primary: "bg-blue-50 text-blue-700",
  success: "bg-green-100 text-green-700",
  warning: "bg-amber-100 text-amber-700",
  danger: "bg-red-100 text-red-700",
  /** Reserved for Veo3-only features, matching the app's purple accent convention. */
  accent: "bg-purple-100 text-purple-700"
};
function Badge({ tone = "neutral", className = "", children, ...props }) {
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
    "span",
    {
      className: cx(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide",
        toneClasses2[tone],
        className
      ),
      ...props,
      children
    }
  );
}

// src/components/Card/Card.tsx
var import_jsx_runtime10 = require("react/jsx-runtime");
function Card({ highlighted = false, className = "", children, ...props }) {
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
    "div",
    {
      className: cx(
        "rounded-2xl p-8 border-2 transition-all",
        highlighted ? "border-primary bg-primary text-white shadow-2xl md:scale-105" : "border-gray-100 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900",
        className
      ),
      ...props,
      children
    }
  );
}

// src/components/Modal/Modal.tsx
var import_jsx_runtime11 = require("react/jsx-runtime");
function Modal({ open, onClose, title, children, className = "" }) {
  if (!open) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "fixed inset-0 z-50 flex items-center justify-center p-4", children: [
    /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "fixed inset-0 bg-black/60 backdrop-blur-sm", onClick: onClose, "aria-hidden": "true" }),
    /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(
      "div",
      {
        role: "dialog",
        "aria-modal": "true",
        className: cx(
          "relative z-10 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden bg-white dark:bg-zinc-900",
          className
        ),
        children: [
          title && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl dark:border-zinc-800 dark:bg-zinc-900", children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("h2", { className: "font-bold text-gray-900 dark:text-zinc-100", children: title }) }),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
            "button",
            {
              type: "button",
              onClick: onClose,
              "aria-label": "Close",
              className: "absolute top-4 right-4 z-10 p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all dark:hover:bg-zinc-800",
              children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(XIcon, { className: "h-4 w-4" })
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "p-6", children })
        ]
      }
    )
  ] });
}

// src/components/Tabs/Tabs.tsx
var import_jsx_runtime12 = require("react/jsx-runtime");
function Tabs({ items, value, onChange, className = "" }) {
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: cx("inline-flex items-center gap-1 rounded-full bg-gray-100 p-1 dark:bg-zinc-800", className), role: "tablist", children: items.map((item) => {
    const active = item.value === value;
    return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
      "button",
      {
        type: "button",
        role: "tab",
        "aria-selected": active,
        onClick: () => onChange(item.value),
        className: cx(
          "px-4 py-2 text-sm font-semibold rounded-full transition-colors",
          active ? "bg-primary text-white" : "text-gray-600 hover:text-gray-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        ),
        children: item.label
      },
      item.value
    );
  }) });
}

// src/components/Tooltip/Tooltip.tsx
var React5 = __toESM(require("react"), 1);
var import_jsx_runtime13 = require("react/jsx-runtime");
function Tooltip({ content, children, className = "" }) {
  const [visible, setVisible] = React5.useState(false);
  return /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)(
    "span",
    {
      className: "relative inline-flex",
      onMouseEnter: () => setVisible(true),
      onMouseLeave: () => setVisible(false),
      onFocus: () => setVisible(true),
      onBlur: () => setVisible(false),
      children: [
        children,
        visible && /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
          "span",
          {
            role: "tooltip",
            className: cx(
              "pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg z-20",
              className
            ),
            children: content
          }
        )
      ]
    }
  );
}

// src/components/Avatar/Avatar.tsx
var import_jsx_runtime14 = require("react/jsx-runtime");
var sizeClasses3 = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-lg"
};
function initials(name) {
  if (!name) return "";
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}
function Avatar({ src, name, size = "md", className = "", ...props }) {
  return /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
    "span",
    {
      className: cx(
        "inline-flex items-center justify-center rounded-full overflow-hidden bg-blue-50 text-primary font-bold flex-shrink-0",
        sizeClasses3[size],
        className
      ),
      ...props,
      children: src ? /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("img", { src, alt: name ?? "Avatar", className: "h-full w-full object-cover" }) : initials(name)
    }
  );
}

// src/components/Alert/Alert.tsx
var import_jsx_runtime15 = require("react/jsx-runtime");
var toneConfig = {
  success: { box: "bg-green-50 border-green-200", title: "text-green-900", body: "text-green-700", Icon: CheckIcon },
  warning: { box: "bg-amber-50 border-amber-200", title: "text-amber-900", body: "text-amber-700", Icon: AlertTriangleIcon },
  danger: { box: "bg-red-50 border-red-100", title: "text-red-900", body: "text-red-600", Icon: XIcon },
  info: { box: "bg-blue-50 border-blue-100", title: "text-blue-900", body: "text-blue-700", Icon: InfoIcon }
};
function Alert({ tone = "info", title, className = "", children, ...props }) {
  const { box, title: titleClass, body, Icon } = toneConfig[tone];
  return /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: cx("rounded-xl border p-4 flex items-start gap-3", box, className), ...props, children: [
    /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(Icon, { className: cx("h-4 w-4 flex-shrink-0 mt-0.5", titleClass) }),
    /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "flex-1 min-w-0", children: [
      title && /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("p", { className: cx("text-sm font-semibold", titleClass), children: title }),
      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: cx("text-xs mt-0.5", body), children })
    ] })
  ] });
}

// src/components/ProgressBar/ProgressBar.tsx
var import_jsx_runtime16 = require("react/jsx-runtime");
function ProgressBar({ value, className = "", ...props }) {
  const clamped = Math.max(0, Math.min(100, value));
  return /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(
    "div",
    {
      role: "progressbar",
      "aria-valuenow": clamped,
      "aria-valuemin": 0,
      "aria-valuemax": 100,
      className: cx("w-full h-2 rounded-full bg-gray-100 overflow-hidden dark:bg-zinc-800", className),
      ...props,
      children: /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("div", { className: "h-full rounded-full bg-primary transition-all duration-300", style: { width: `${clamped}%` } })
    }
  );
}

// src/components/PricingCard/PricingCard.tsx
var import_jsx_runtime17 = require("react/jsx-runtime");
function PricingCard({
  name,
  price,
  period = "/mo",
  subtitle,
  features,
  highlighted = false,
  badgeLabel = "Most Popular",
  ctaLabel,
  onCtaClick,
  className = ""
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)(
    "div",
    {
      className: cx(
        "relative rounded-2xl p-8 border-2 transition-all",
        highlighted ? "border-primary bg-primary text-white shadow-2xl md:scale-105" : "border-gray-100 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900",
        className
      ),
      children: [
        highlighted && /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { className: "absolute -top-3.5 left-1/2 -translate-x-1/2 bg-green-400 text-green-900 text-xs font-black px-4 py-1 rounded-full uppercase tracking-wide whitespace-nowrap", children: badgeLabel }),
        /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("p", { className: cx("text-xs font-bold uppercase tracking-widest", highlighted ? "text-white/80" : "text-gray-400"), children: name }),
        /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("p", { className: "mt-2 flex items-baseline gap-1", children: [
          /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { className: "text-4xl font-black", children: price }),
          /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { className: cx("text-sm font-normal", highlighted ? "text-white/70" : "text-gray-400"), children: period })
        ] }),
        subtitle && /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("p", { className: cx("mt-1 text-sm", highlighted ? "text-white/80" : "text-gray-500 dark:text-zinc-400"), children: subtitle }),
        /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("ul", { className: "mt-6 space-y-3", children: features.map((feature) => /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("li", { className: "flex items-center gap-2 text-sm", children: [
          /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(CheckIcon, { className: cx("h-4 w-4 flex-shrink-0", highlighted ? "text-white" : "text-primary") }),
          /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("span", { className: highlighted ? "text-white/90" : "text-gray-700 dark:text-zinc-300", children: feature })
        ] }, feature)) }),
        /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(
          Button,
          {
            variant: highlighted ? "secondary" : "primary",
            className: cx("w-full mt-8", highlighted && "!bg-white !text-primary !border-white hover:!bg-white/90"),
            onClick: onCtaClick,
            children: ctaLabel
          }
        )
      ]
    }
  );
}

// src/components/CreditBadge/CreditBadge.tsx
var import_jsx_runtime18 = require("react/jsx-runtime");
function CreditBadge({ cost, veo3 = false, className = "" }) {
  const isFree = cost === "free";
  const label = isFree ? "Free" : `${cost} credit${cost === 1 ? "" : "s"}`;
  return /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(
    "span",
    {
      className: cx(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
        isFree ? "bg-green-100 text-green-700" : veo3 ? "bg-purple-100 text-purple-700" : "bg-blue-50 text-blue-700",
        className
      ),
      children: label
    }
  );
}

// src/components/ToolCard/ToolCard.tsx
var import_jsx_runtime19 = require("react/jsx-runtime");
function ToolCard({ name, engine, cost, veo3, className = "" }) {
  return /* @__PURE__ */ (0, import_jsx_runtime19.jsxs)(
    "div",
    {
      className: cx(
        "flex items-center justify-between gap-4 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900",
        className
      ),
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime19.jsxs)("div", { className: "min-w-0", children: [
          /* @__PURE__ */ (0, import_jsx_runtime19.jsx)("p", { className: "text-sm font-bold text-gray-900 truncate dark:text-zinc-100", children: name }),
          engine && /* @__PURE__ */ (0, import_jsx_runtime19.jsx)("p", { className: "text-xs text-gray-400 truncate", children: engine })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime19.jsx)(CreditBadge, { cost, veo3 })
      ]
    }
  );
}

// src/components/FAQAccordionItem/FAQAccordionItem.tsx
var import_jsx_runtime20 = require("react/jsx-runtime");
function FAQAccordionItem({ question, answer, open, onToggle, className = "" }) {
  return /* @__PURE__ */ (0, import_jsx_runtime20.jsxs)("div", { className: cx("rounded-xl border border-gray-100 bg-white overflow-hidden dark:border-zinc-800 dark:bg-zinc-900", className), children: [
    /* @__PURE__ */ (0, import_jsx_runtime20.jsxs)(
      "button",
      {
        type: "button",
        onClick: onToggle,
        "aria-expanded": open,
        className: "w-full flex items-center justify-between gap-4 px-6 py-4 text-left",
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("span", { className: "font-semibold text-gray-900 dark:text-zinc-100", children: question }),
          /* @__PURE__ */ (0, import_jsx_runtime20.jsx)(
            ChevronDownIcon,
            {
              className: cx("h-4 w-4 flex-shrink-0 text-gray-400 transition-transform", open && "rotate-180")
            }
          )
        ]
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime20.jsx)(
      "div",
      {
        className: "grid transition-all duration-300 ease-out",
        style: { gridTemplateRows: open ? "1fr" : "0fr" },
        children: /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("div", { className: "overflow-hidden", children: /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("p", { className: "px-6 pb-4 text-sm text-gray-500 leading-relaxed dark:text-zinc-400", children: answer }) })
      }
    )
  ] });
}

// src/components/NavBar/NavBar.tsx
var React6 = __toESM(require("react"), 1);
var import_jsx_runtime21 = require("react/jsx-runtime");
function NavBar({ logo, links, cta, className = "" }) {
  const [mobileOpen, setMobileOpen] = React6.useState(false);
  return /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("header", { className: cx("sticky top-0 z-40 bg-white border-b border-gray-100 dark:bg-zinc-950 dark:border-zinc-800", className), children: [
    /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("div", { className: "mx-auto flex h-16 max-w-screen-2xl items-center justify-between px-4 lg:px-12", children: [
      logo,
      /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("nav", { className: "hidden md:flex items-center gap-8", children: links.map((link) => /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("a", { href: link.href, className: "text-base font-semibold text-gray-700 hover:text-gray-900 transition-colors dark:text-zinc-300 dark:hover:text-white", children: link.label }, link.href)) }),
      /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("div", { className: "flex items-center gap-4", children: [
        cta && /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(
          "a",
          {
            href: cta.href,
            className: "hidden md:inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-base font-bold text-white hover:bg-primary-hover hover:scale-[1.02] transition-all",
            children: cta.label
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(
          "button",
          {
            type: "button",
            "aria-label": "Toggle menu",
            onClick: () => setMobileOpen((o) => !o),
            className: "md:hidden p-2 -mr-2 text-gray-700 dark:text-zinc-300",
            children: mobileOpen ? /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(XIcon, { className: "h-5 w-5" }) : /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(ChevronDownIcon, { className: "h-5 w-5" })
          }
        )
      ] })
    ] }),
    mobileOpen && /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("nav", { className: "md:hidden border-t border-gray-100 bg-white px-4 py-4 flex flex-col gap-3 dark:bg-zinc-950 dark:border-zinc-800", children: [
      links.map((link) => /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("a", { href: link.href, className: "text-base font-semibold text-gray-700 dark:text-zinc-300", children: link.label }, link.href)),
      cta && /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("a", { href: cta.href, className: "inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-base font-bold text-white", children: cta.label })
    ] })
  ] });
}

// src/components/Footer/Footer.tsx
var import_jsx_runtime22 = require("react/jsx-runtime");
function Footer({ logo, tagline, columns, socials = [], copyright, bottomLinks = [], className = "" }) {
  return /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("footer", { className: cx("border-t border-gray-100 bg-white dark:bg-zinc-950 dark:border-zinc-800", className), children: /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: "mx-auto w-full max-w-screen-2xl px-4 py-16 md:px-12", children: [
    /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: "grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-6", children: [
      /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: "col-span-2 sm:col-span-3 lg:col-span-1", children: [
        logo,
        tagline && /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("p", { className: "mt-4 max-w-xs text-sm leading-relaxed text-gray-500 dark:text-zinc-400", children: tagline }),
        socials.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("div", { className: "mt-5 flex items-center gap-2", children: socials.map((s) => /* @__PURE__ */ (0, import_jsx_runtime22.jsx)(
          "a",
          {
            href: s.href,
            "aria-label": s.label,
            className: "flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition-colors hover:border-primary hover:text-primary dark:border-zinc-700",
            children: s.icon
          },
          s.label
        )) })
      ] }),
      columns.map((col) => /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("p", { className: "mb-4 text-sm font-bold text-gray-900 dark:text-zinc-100", children: col.title }),
        /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("ul", { className: "space-y-2.5", children: col.links.map((link) => /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("a", { href: link.href, className: "text-sm text-gray-500 transition-colors hover:text-primary dark:text-zinc-400", children: link.label }) }, link.label)) })
      ] }, col.title))
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: "mt-12 flex flex-col items-center justify-between gap-4 border-t border-gray-100 pt-8 sm:flex-row dark:border-zinc-800", children: [
      /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("p", { className: "text-sm text-gray-400", children: copyright }),
      bottomLinks.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("div", { className: "flex items-center gap-6 text-sm text-gray-400", children: bottomLinks.map((link) => /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("a", { href: link.href, className: "hover:text-gray-700 dark:hover:text-zinc-200", children: link.label }, link.label)) })
    ] })
  ] }) });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Alert,
  AlertTriangleIcon,
  ArrowRightIcon,
  Avatar,
  Badge,
  Button,
  Card,
  CheckIcon,
  Checkbox,
  ChevronDownIcon,
  CreditBadge,
  FAQAccordionItem,
  Footer,
  InfoIcon,
  Input,
  Modal,
  NavBar,
  PlayIcon,
  PricingCard,
  ProgressBar,
  Select,
  SparklesIcon,
  Spinner,
  StarIcon,
  Switch,
  Tabs,
  Textarea,
  ToolCard,
  Tooltip,
  XIcon,
  ZapIcon
});
//# sourceMappingURL=index.cjs.map