"use client";

// Pure JSON → JSX walker over Lexical's SerializedEditorState, used to render
// rich (per-run bold/italic/underline/strikethrough/color/highlight/list)
// text live on the canvas preview. Deliberately does NOT mount a live
// LexicalComposer per visible clip — that would be heavy (one composer
// instance per on-screen text overlay) and fights Lexical's single-edit-focus
// model. Walking the already-serialized JSON is stable and lightweight.

import React from "react";
import { IS_BOLD, IS_ITALIC, IS_STRIKETHROUGH, IS_UNDERLINE } from "lexical";
import type { RichTextState } from "@/lib/editor/types";

interface LexicalNodeJSON {
  type: string;
  children?: LexicalNodeJSON[];
  text?: string;
  format?: number | string;
  style?: string;
  listType?: "bullet" | "number" | "check";
  [key: string]: unknown;
}

function parseInlineStyle(style: string | undefined): React.CSSProperties {
  if (!style) return {};
  const out: React.CSSProperties = {};
  for (const decl of style.split(";")) {
    const [prop, value] = decl.split(":").map((s) => s?.trim());
    if (!prop || !value) continue;
    if (prop === "color") out.color = value;
    else if (prop === "background-color") out.backgroundColor = value;
    else if (prop === "font-family") out.fontFamily = value;
    else if (prop === "font-size") out.fontSize = value;
  }
  return out;
}

function renderTextNode(node: LexicalNodeJSON, key: React.Key): React.ReactNode {
  const format = typeof node.format === "number" ? node.format : 0;
  let content: React.ReactNode = node.text ?? "";
  if (format & IS_BOLD) content = <strong>{content}</strong>;
  if (format & IS_ITALIC) content = <em>{content}</em>;
  if (format & IS_UNDERLINE) content = <u>{content}</u>;
  if (format & IS_STRIKETHROUGH) content = <s>{content}</s>;
  const style = parseInlineStyle(node.style);
  return (
    <span key={key} style={style}>
      {content}
    </span>
  );
}

function renderChildren(children: LexicalNodeJSON[] | undefined): React.ReactNode[] {
  if (!children) return [];
  return children.map((child, i) => renderNode(child, i));
}

function renderNode(node: LexicalNodeJSON, key: React.Key): React.ReactNode {
  switch (node.type) {
    case "text":
      return renderTextNode(node, key);
    case "linebreak":
      return <br key={key} />;
    case "paragraph": {
      const align = typeof node.format === "string" && node.format ? node.format : undefined;
      return (
        <p key={key} style={{ margin: 0, textAlign: align as React.CSSProperties["textAlign"] }}>
          {renderChildren(node.children)}
        </p>
      );
    }
    case "list": {
      const Tag = node.listType === "number" ? "ol" : "ul";
      return (
        <Tag key={key} style={{ margin: 0, paddingLeft: "1.4em" }}>
          {renderChildren(node.children)}
        </Tag>
      );
    }
    case "listitem":
      return <li key={key}>{renderChildren(node.children)}</li>;
    default:
      return <React.Fragment key={key}>{renderChildren(node.children)}</React.Fragment>;
  }
}

/** Falls back to plain text for legacy clips with no richText, or malformed state. */
export function renderRichTextToReact(richText: RichTextState | undefined, fallbackText: string): React.ReactNode {
  const root = richText?.root as LexicalNodeJSON | undefined;
  if (!root || !Array.isArray(root.children)) return fallbackText;
  return renderChildren(root.children);
}
