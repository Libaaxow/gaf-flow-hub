import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Make a user-provided filename safe to use as a Storage object key segment.
 * Does NOT modify the file data; it only sanitizes the path/name used for upload.
 */
export function sanitizeStorageFilename(filename: string) {
  const base = (filename.split(/[/\\]/).pop() || "file").trim();

  const nameParts = base.split(".");
  const ext = nameParts.length > 1 ? nameParts.pop() : undefined;
  const stem = nameParts.join(".");

  const normalize = (s: string) =>
    s
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "");

  const safeStem = normalize(stem)
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 160);

  const safeExt = ext
    ? normalize(ext)
        .replace(/[^a-zA-Z0-9]+/g, "")
        .slice(0, 12)
    : "";

  const finalName = safeExt
    ? `${safeStem || "file"}.${safeExt}`
    : safeStem || "file";

  // Keep keys reasonably short (Postgres + storage limits)
  return finalName.slice(0, 180);
}

