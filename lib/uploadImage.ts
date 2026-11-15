import { supabase } from "@/lib/supabase";

export const FAQ_IMAGE_BUCKET = "faq-images";
export const MAX_IMAGE_BYTES = 500 * 1024; // matches the bucket's file_size_limit (512000)
export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };
const MAX_DIMENSION = 1600; // answers never display wider than this

/** Public URL prefix for images in the FAQ bucket; only images from here are allowed in answers. */
export const faqImageUrlPrefix = () =>
  `${(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "")}/storage/v1/object/public/${FAQ_IMAGE_BUCKET}/`;

const kb = (bytes: number) => `${Math.round(bytes / 1024)} KB`;

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

/**
 * Shrinks a still image (PNG/JPEG/WebP) until it fits under MAX_IMAGE_BYTES:
 * first caps the size at MAX_DIMENSION, then lowers quality, then scales down further.
 */
async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    let scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Your browser could not process this image.");

    for (let attempt = 0; attempt < 8; attempt++) {
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      for (const quality of [0.85, 0.75, 0.65, 0.55]) {
        // WebP keeps transparency and compresses well; browsers without WebP encoding return PNG instead.
        const blob = await toBlob(canvas, "image/webp", quality);
        if (blob && blob.type === "image/webp" && blob.size <= MAX_IMAGE_BYTES) return blob;
        if (blob?.type !== "image/webp") {
          // Fallback: JPEG on a white background (JPEG has no transparency).
          ctx.globalCompositeOperation = "destination-over";
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.globalCompositeOperation = "source-over";
          const jpeg = await toBlob(canvas, "image/jpeg", quality);
          if (jpeg && jpeg.size <= MAX_IMAGE_BYTES) return jpeg;
        }
      }
      scale *= 0.75;
    }
    throw new Error("This image could not be compressed below 500 KB. Try cropping it or using a smaller image.");
  } finally {
    bitmap.close();
  }
}

/** Uploads an image to Supabase Storage and returns its public URL. Throws a readable error. */
export async function uploadFaqImage(file: File): Promise<string> {
  if (!supabase) throw new Error("Image upload is unavailable: Supabase is not configured.");
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) throw new Error("Only PNG, JPEG, GIF or WebP images can be uploaded.");

  let body: Blob = file;
  if (file.size > MAX_IMAGE_BYTES) {
    if (file.type === "image/gif") {
      throw new Error(`GIFs can't be compressed automatically and must be 500 KB or smaller (this one is ${kb(file.size)}).`);
    }
    body = await compressImage(file);
  }

  const now = new Date();
  const path = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}.${EXT[body.type]}`;

  const { error } = await supabase.storage
    .from(FAQ_IMAGE_BUCKET)
    .upload(path, body, { contentType: body.type, cacheControl: "31536000", upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);

  return supabase.storage.from(FAQ_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}
