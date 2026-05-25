export const maxUploadBytes = 20 * 1024 * 1024;

export function validateUploadedFile(file: File) {
  if (file.size > maxUploadBytes) {
    return {
      ok: false as const,
      status: 413,
      message: "File exceeds 20MB MVP limit."
    };
  }

  return { ok: true as const };
}
