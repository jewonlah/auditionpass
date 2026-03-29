/**
 * D-Day 계산 (마감일까지 남은 일수)
 */
export function getDday(deadline: string | null): number | null {
  if (!deadline) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(deadline);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * D-Day 텍스트 포맷
 */
export function formatDday(deadline: string | null): string {
  const dday = getDday(deadline);
  if (dday === null) return "마감일 미정";
  if (dday < 0) return "마감";
  if (dday === 0) return "D-Day";
  return `D-${dday}`;
}

/**
 * 날짜 포맷 (YYYY.MM.DD)
 */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * cn: className 합치기 유틸
 */
export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}
