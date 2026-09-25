// SHA-256 datoteke se izračuna v brskalniku — datoteka ne zapusti tehnikovega
// računalnika, na strežnik gre le rezultat. Web Crypto zahteva HTTPS ali localhost.

export interface FileHash {
  fileName: string;
  fileSize: number;
  sha256: string;
}

export async function sha256File(file: File): Promise<FileHash> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto ni na voljo — stran mora teči prek HTTPS");
  }
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const sha256 = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return { fileName: file.name, fileSize: file.size, sha256 };
}

export const SHA256_RE = /^[0-9a-f]{64}$/;

export function isSha256(v: string | null | undefined): boolean {
  return !!v && SHA256_RE.test(v.trim().toLowerCase());
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
