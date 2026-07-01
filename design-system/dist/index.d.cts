import * as React from 'react';

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md" | "lg";
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    /** Shows an inline spinner and disables the button without changing its layout. */
    loading?: boolean;
}
declare function Button({ variant, size, loading, disabled, className, children, ...props }: ButtonProps): React.JSX.Element;

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    /** Error message — renders below the field and switches the border to danger. */
    error?: string;
}
declare const Input: React.ForwardRefExoticComponent<InputProps & React.RefAttributes<HTMLInputElement>>;

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
    label?: string;
    error?: string;
}
declare const Textarea: React.ForwardRefExoticComponent<TextareaProps & React.RefAttributes<HTMLTextAreaElement>>;

interface SelectOption {
    value: string;
    label: string;
}
interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "children"> {
    label?: string;
    error?: string;
    options: SelectOption[];
}
declare const Select: React.ForwardRefExoticComponent<SelectProps & React.RefAttributes<HTMLSelectElement>>;

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: React.ReactNode;
    /** "accent" is reserved for Veo3-only contexts, matching the app's purple checkbox convention. */
    tone?: "primary" | "accent";
}
declare const Checkbox: React.ForwardRefExoticComponent<CheckboxProps & React.RefAttributes<HTMLInputElement>>;

interface SwitchProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label?: React.ReactNode;
    disabled?: boolean;
    className?: string;
}
declare function Switch({ checked, onChange, label, disabled, className }: SwitchProps): React.JSX.Element;

type BadgeTone = "neutral" | "primary" | "success" | "warning" | "danger" | "accent";
interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
    tone?: BadgeTone;
}
declare function Badge({ tone, className, children, ...props }: BadgeProps): React.JSX.Element;

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
    /** Matches the app's "most popular" pricing-card treatment: filled primary background, scaled up, deeper shadow. */
    highlighted?: boolean;
}
declare function Card({ highlighted, className, children, ...props }: CardProps): React.JSX.Element;

interface ModalProps {
    open: boolean;
    onClose: () => void;
    title?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
}
declare function Modal({ open, onClose, title, children, className }: ModalProps): React.JSX.Element | null;

interface TabItem {
    value: string;
    label: React.ReactNode;
}
interface TabsProps {
    items: TabItem[];
    value: string;
    onChange: (value: string) => void;
    className?: string;
}
/** Segmented-control tabs, matching the pricing page's Monthly/Yearly term toggle. */
declare function Tabs({ items, value, onChange, className }: TabsProps): React.JSX.Element;

interface TooltipProps {
    content: React.ReactNode;
    children: React.ReactElement;
    className?: string;
}
declare function Tooltip({ content, children, className }: TooltipProps): React.JSX.Element;

interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
    src?: string | null;
    name?: string;
    size?: "sm" | "md" | "lg";
}
declare function Avatar({ src, name, size, className, ...props }: AvatarProps): React.JSX.Element;

type AlertTone = "success" | "warning" | "danger" | "info";
interface AlertProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
    tone?: AlertTone;
    title?: React.ReactNode;
}
declare function Alert({ tone, title, className, children, ...props }: AlertProps): React.JSX.Element;

type SpinnerTone = "light" | "dark";
interface SpinnerProps extends React.HTMLAttributes<HTMLSpanElement> {
    /** "light" renders a white spinner for use on filled/colored buttons; "dark" renders a blue spinner for use on light backgrounds. */
    tone?: SpinnerTone;
    size?: "sm" | "md";
}
declare function Spinner({ tone, size, className, ...props }: SpinnerProps): React.JSX.Element;

interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
    /** 0–100 */
    value: number;
}
declare function ProgressBar({ value, className, ...props }: ProgressBarProps): React.JSX.Element;

interface PricingCardProps {
    /** Plan name shown as the small uppercase eyebrow, e.g. "Creator". */
    name: string;
    /** Formatted price, e.g. "₹799". */
    price: string;
    /** Billing period suffix, e.g. "/mo". */
    period?: string;
    /** Short line under the price, e.g. "50 credits / month". */
    subtitle?: string;
    features: string[];
    /** Renders the filled primary card with the floating badge — the app's "Most Popular" treatment. */
    highlighted?: boolean;
    badgeLabel?: string;
    ctaLabel: string;
    onCtaClick?: () => void;
    className?: string;
}
declare function PricingCard({ name, price, period, subtitle, features, highlighted, badgeLabel, ctaLabel, onCtaClick, className, }: PricingCardProps): React.JSX.Element;

interface CreditBadgeProps {
    /** Credit cost, or "free" for the app's free-tool pill. */
    cost: number | "free";
    /** Veo3-restricted credits render in the purple accent tone rather than primary blue. */
    veo3?: boolean;
    className?: string;
}
declare function CreditBadge({ cost, veo3, className }: CreditBadgeProps): React.JSX.Element;

interface ToolCardProps {
    /** Tool name, e.g. "AI Voiceover". */
    name: string;
    /** Underlying engine, e.g. "ElevenLabs TTS" — shown as a small muted subtitle. */
    engine?: string;
    cost: CreditBadgeProps["cost"];
    veo3?: boolean;
    className?: string;
}
/** Matches the app's credit-cost list row (pricing page "Credit Costs" section). */
declare function ToolCard({ name, engine, cost, veo3, className }: ToolCardProps): React.JSX.Element;

interface FAQAccordionItemProps {
    question: string;
    answer: React.ReactNode;
    open: boolean;
    onToggle: () => void;
    className?: string;
}
/** Grid-rows collapse animation, matching the app's FAQ section. */
declare function FAQAccordionItem({ question, answer, open, onToggle, className }: FAQAccordionItemProps): React.JSX.Element;

interface NavLinkItem {
    label: string;
    href: string;
}
interface NavBarProps {
    /** Rendered as-is at the left — pass an <img> or wordmark component. */
    logo: React.ReactNode;
    links: NavLinkItem[];
    cta?: NavLinkItem;
    className?: string;
}
/**
 * Simplified NavBar shell ported from SiteNavbar.tsx's structural pattern
 * (sticky white header, flat nav links, primary CTA, mobile menu). The real
 * app's mega-menu dropdowns are app-specific and not reproduced here.
 */
declare function NavBar({ logo, links, cta, className }: NavBarProps): React.JSX.Element;

interface FooterColumn {
    title: string;
    links: {
        label: string;
        href: string;
    }[];
}
interface FooterSocial {
    icon: React.ReactNode;
    label: string;
    href: string;
}
interface FooterProps {
    logo: React.ReactNode;
    tagline?: string;
    columns: FooterColumn[];
    socials?: FooterSocial[];
    copyright: string;
    bottomLinks?: {
        label: string;
        href: string;
    }[];
    className?: string;
}
/** Ported from SiteFooter.tsx's structural pattern: brand blurb + link columns + bottom bar. */
declare function Footer({ logo, tagline, columns, socials, copyright, bottomLinks, className }: FooterProps): React.JSX.Element;

type IconProps = React.SVGAttributes<SVGSVGElement> & {
    className?: string;
};
declare function CheckIcon({ className, ...props }: IconProps): React.JSX.Element;
declare function XIcon({ className, ...props }: IconProps): React.JSX.Element;
declare function ChevronDownIcon({ className, ...props }: IconProps): React.JSX.Element;
declare function ZapIcon({ className, ...props }: IconProps): React.JSX.Element;
declare function SparklesIcon({ className, ...props }: IconProps): React.JSX.Element;
declare function ArrowRightIcon({ className, ...props }: IconProps): React.JSX.Element;
declare function PlayIcon({ className, ...props }: IconProps): React.JSX.Element;
declare function StarIcon({ className, ...props }: IconProps): React.JSX.Element;
declare function AlertTriangleIcon({ className, ...props }: IconProps): React.JSX.Element;
declare function InfoIcon({ className, ...props }: IconProps): React.JSX.Element;

export { Alert, type AlertProps, type AlertTone, AlertTriangleIcon, ArrowRightIcon, Avatar, type AvatarProps, Badge, type BadgeProps, type BadgeTone, Button, type ButtonProps, type ButtonSize, type ButtonVariant, Card, type CardProps, CheckIcon, Checkbox, type CheckboxProps, ChevronDownIcon, CreditBadge, type CreditBadgeProps, FAQAccordionItem, type FAQAccordionItemProps, Footer, type FooterColumn, type FooterProps, type FooterSocial, type IconProps, InfoIcon, Input, type InputProps, Modal, type ModalProps, NavBar, type NavBarProps, type NavLinkItem, PlayIcon, PricingCard, type PricingCardProps, ProgressBar, type ProgressBarProps, Select, type SelectOption, type SelectProps, SparklesIcon, Spinner, type SpinnerProps, type SpinnerTone, StarIcon, Switch, type SwitchProps, type TabItem, Tabs, type TabsProps, Textarea, type TextareaProps, ToolCard, type ToolCardProps, Tooltip, type TooltipProps, XIcon, ZapIcon };
