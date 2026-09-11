/** Crop positions use the same 0–100% convention as CSS object-position. */
export function cropRectangle(width: number, height: number, x = 50, y = 50) {
  const w = Math.min(width, Math.floor(height * 3 / 4));
  const h = Math.min(height, Math.floor(width * 4 / 3));
  return { left: Math.round((width - w) * x / 100), top: Math.round((height - h) * y / 100), width: w, height: h };
}

/** Odd final photos span the full row; no unbalanced empty cell. */
export function photoRows<T>(photos: T[]): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < photos.length; i += 2) rows.push(photos.slice(i, i + 2));
  return rows;
}

/** Never fetch arbitrary profile URLs on the server (SSRF or another user's private image). */
export function ownedPhotoPath(url: string, userId: string, storageUrl: string): string {
  const parsed = new URL(url);
  const base = new URL(storageUrl);
  const prefix = `/storage/v1/object/public/profiles/${userId}/`;
  if (parsed.origin !== base.origin || !parsed.pathname.startsWith(prefix) || parsed.search || parsed.hash) throw Error("지원 사진을 다시 업로드해주세요.");
  const filename = decodeURIComponent(parsed.pathname.slice(prefix.length));
  if (!/^[a-zA-Z0-9_.-]+\.(jpg|jpeg|png|webp)$/i.test(filename) || filename.includes("..")) throw Error("사진 경로를 확인해주세요.");
  return `${userId}/${filename}`;
}
