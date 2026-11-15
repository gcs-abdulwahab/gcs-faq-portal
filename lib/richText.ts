import DOMPurify from "dompurify";
import { faqImageUrlPrefix } from "@/lib/uploadImage";

const ALLOWED_TAGS = ["p", "br", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "a", "h3", "blockquote", "img"];
const ALLOWED_ATTR = ["href", "target", "rel", "src", "alt", "title"];

let hooksInstalled = false;
function installHooks() {
  if (hooksInstalled) return;
  hooksInstalled = true;
  // Only allow images hosted in our own FAQ bucket (no external tracking pixels or hotlinks).
  DOMPurify.addHook("uponSanitizeElement", (node, data) => {
    if (data.tagName !== "img") return;
    const src = (node as Element).getAttribute?.("src") ?? "";
    if (!src.startsWith(faqImageUrlPrefix())) node.parentNode?.removeChild(node);
  });
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "IMG") node.setAttribute("loading", "lazy");
  });
}

const looksLikeHtml = (value: string) => /<\/?[a-z][\s\S]*>/i.test(value);

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Turn stored answer text (plain text from older FAQs, or HTML from the editor) into safe HTML. */
export function toSafeHtml(value: string | null | undefined): string {
  if (!value) return "";
  const html = looksLikeHtml(value)
    ? value
    : value
        .split(/\n{2,}/)
        .map((para) => `<p>${escapeHtml(para).replace(/\n/g, "<br>")}</p>`)
        .join("");
  if (typeof window === "undefined") return html.replace(/<[^>]*>/g, " "); // SSR fallback: text only
  installHooks();
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR: [...ALLOWED_ATTR, "loading"] });
}

/** Plain-text version of an answer, for search, similarity matching and diffs. */
export function toPlainText(value: string | null | undefined, imagePlaceholder = ""): string {
  if (!value) return "";
  if (!looksLikeHtml(value)) return value;
  return value
    .replace(/<img[^>]*>/gi, imagePlaceholder)
    .replace(/<\/(p|li|h3|blockquote)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const isBlankRichText = (value: string | null | undefined) =>
  toPlainText(value).trim() === "" && !/<img\s/i.test(value ?? "");
