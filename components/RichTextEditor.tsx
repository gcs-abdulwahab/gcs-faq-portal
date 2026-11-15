"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import {
  Bold,
  Heading3,
  ImagePlus,
  Italic,
  Link as LinkIcon,
  List,
  Loader2,
  ListOrdered,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2,
} from "lucide-react";
import { toSafeHtml } from "@/lib/richText";
import { ALLOWED_IMAGE_TYPES, uploadFaqImage } from "@/lib/uploadImage";

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
};

const imageFiles = (list: FileList | null | undefined) =>
  Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));

const altFromName = (name: string) => name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();

const serialize = (editor: Editor) =>
  editor.getText().trim() === "" && !editor.getHTML().includes("<img") ? "" : editor.getHTML();

export function RichTextEditor({ value, onChange, placeholder, autoFocus }: Props) {
  const editorRef = useRef<Editor | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Uploads images one by one and inserts each at `pos` (drop position) or at the cursor.
  const insertImages = async (files: File[], pos?: number) => {
    setUploadError(null);
    for (const file of files) {
      setUploading((n) => n + 1);
      try {
        const src = await uploadFaqImage(file);
        const ed = editorRef.current;
        if (!ed || ed.isDestroyed) return;
        const node = { type: "image", attrs: { src, alt: altFromName(file.name) } };
        if (pos === undefined) ed.chain().focus().insertContent(node).run();
        else ed.chain().focus().insertContentAt(pos, node).run();
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Image upload failed.");
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const editor = useEditor({
    immediatelyRender: false,
    autofocus: autoFocus ? "end" : false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [3] },
        code: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
      }),
      Image.configure({ inline: false, allowBase64: false }),
    ],
    content: toSafeHtml(value),
    editorProps: {
      attributes: {
        class: "rich-text min-h-[140px] max-h-[360px] overflow-y-auto px-3.5 py-2.5 text-sm focus:outline-none",
        ...(placeholder ? { "data-placeholder": placeholder } : {}),
      },
      handlePaste: (_view, event) => {
        const files = imageFiles(event.clipboardData?.files);
        if (!files.length) return false;
        event.preventDefault();
        void insertImages(files);
        return true;
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false; // dragging an image already in the editor
        const files = imageFiles(event.dataTransfer?.files);
        if (!files.length) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        void insertImages(files, pos);
        return true;
      },
    },
    onUpdate: ({ editor }) => onChange(serialize(editor)),
  });
  editorRef.current = editor;

  // Keep the editor in sync when the parent swaps in a different FAQ.
  useEffect(() => {
    if (!editor) return;
    const current = serialize(editor);
    if (value !== current) editor.commands.setContent(toSafeHtml(value), false);
  }, [value, editor]);

  return (
    <div className="rich-text-editor border border-slate-300 rounded-xl bg-white overflow-hidden focus-within:ring-2 focus-within:ring-blue-500/30 focus-within:border-blue-400">
      <Toolbar editor={editor} onPickImage={() => fileInputRef.current?.click()} uploading={uploading > 0} />
      <input
        ref={fileInputRef}
        type="file"
        accept={ALLOWED_IMAGE_TYPES.join(",")}
        multiple
        hidden
        onChange={(e) => {
          const files = imageFiles(e.target.files);
          e.target.value = "";
          if (files.length) void insertImages(files);
        }}
      />
      {(uploading > 0 || uploadError) && (
        <div
          className={`flex items-center gap-2 px-3.5 py-1.5 text-xs border-b ${
            uploadError ? "bg-red-50 border-red-100 text-red-700" : "bg-blue-50 border-blue-100 text-blue-700"
          }`}
        >
          {uploading > 0 ? (
            <>
              <Loader2 size={13} className="animate-spin" /> Uploading image…
            </>
          ) : (
            <>
              <span className="flex-1">{uploadError}</span>
              <button type="button" onClick={() => setUploadError(null)} className="font-semibold hover:underline">
                Dismiss
              </button>
            </>
          )}
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor, onPickImage, uploading }: { editor: Editor | null; onPickImage: () => void; uploading: boolean }) {
  if (!editor) return <div className="h-10 border-b border-slate-200 bg-slate-50" />;

  const setLink = () => {
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL (leave empty to remove)", previous ?? "https://");
    if (url === null) return;
    if (url.trim() === "" || url.trim() === "https://") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    const href = /^(https?:|mailto:|tel:)/i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  };

  const groups: { label: string; icon: React.ReactNode; active?: boolean; disabled?: boolean; run: () => void }[][] = [
    [
      { label: "Bold (Ctrl+B)", icon: <Bold size={15} />, active: editor.isActive("bold"), run: () => editor.chain().focus().toggleBold().run() },
      { label: "Italic (Ctrl+I)", icon: <Italic size={15} />, active: editor.isActive("italic"), run: () => editor.chain().focus().toggleItalic().run() },
      { label: "Underline (Ctrl+U)", icon: <UnderlineIcon size={15} />, active: editor.isActive("underline"), run: () => editor.chain().focus().toggleUnderline().run() },
      { label: "Strikethrough", icon: <Strikethrough size={15} />, active: editor.isActive("strike"), run: () => editor.chain().focus().toggleStrike().run() },
    ],
    [
      { label: "Heading", icon: <Heading3 size={15} />, active: editor.isActive("heading", { level: 3 }), run: () => editor.chain().focus().toggleHeading({ level: 3 }).run() },
      { label: "Bullet list", icon: <List size={15} />, active: editor.isActive("bulletList"), run: () => editor.chain().focus().toggleBulletList().run() },
      { label: "Numbered list", icon: <ListOrdered size={15} />, active: editor.isActive("orderedList"), run: () => editor.chain().focus().toggleOrderedList().run() },
      { label: "Quote", icon: <Quote size={15} />, active: editor.isActive("blockquote"), run: () => editor.chain().focus().toggleBlockquote().run() },
      { label: "Link", icon: <LinkIcon size={15} />, active: editor.isActive("link"), run: setLink },
      { label: "Insert image (or paste / drag one in)", icon: uploading ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />, disabled: uploading, run: onPickImage },
    ],
    [
      { label: "Clear formatting", icon: <RemoveFormatting size={15} />, run: () => editor.chain().focus().unsetAllMarks().clearNodes().run() },
      { label: "Undo (Ctrl+Z)", icon: <Undo2 size={15} />, disabled: !editor.can().undo(), run: () => editor.chain().focus().undo().run() },
      { label: "Redo (Ctrl+Y)", icon: <Redo2 size={15} />, disabled: !editor.can().redo(), run: () => editor.chain().focus().redo().run() },
    ],
  ];

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 px-2 py-1.5">
      {groups.map((group, i) => (
        <div key={i} className="flex items-center gap-0.5">
          {i > 0 && <span className="mx-1 h-5 w-px bg-slate-300" aria-hidden />}
          {group.map((b) => (
            <button
              key={b.label}
              type="button"
              title={b.label}
              aria-label={b.label}
              aria-pressed={b.active}
              disabled={b.disabled}
              onMouseDown={(e) => e.preventDefault()}
              onClick={b.run}
              className={`p-1.5 rounded-md transition-colors disabled:opacity-35 disabled:cursor-not-allowed ${
                b.active ? "bg-blue-100 text-blue-700" : "text-slate-600 hover:bg-slate-200 hover:text-slate-900"
              }`}
            >
              {b.icon}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
