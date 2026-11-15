"use client";

import { useEffect, useState } from "react";
import { toPlainText, toSafeHtml } from "@/lib/richText";

/** Renders a stored FAQ answer (HTML or legacy plain text) safely. */
export function RichText({ value, className = "" }: { value: string | null | undefined; className?: string }) {
  // DOMPurify needs the DOM, so render plain text on the server and swap in HTML after mount.
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => setHtml(toSafeHtml(value)), [value]);

  if (html === null) {
    return <div className={`rich-text whitespace-pre-line ${className}`}>{toPlainText(value)}</div>;
  }
  return <div className={`rich-text ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
