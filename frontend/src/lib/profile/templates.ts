// Original designs: docs/renewal/canvas/{PortfolioActor,PortfolioModel,Cinema,Magazine,Cozy,Dignity}.dc.html
export const TEMPLATE_IDS = ["casting", "portfolio", "career", "classic", "cinema", "magazine", "cozy", "dignity"] as const;
export type TemplateId = typeof TEMPLATE_IDS[number];
export const COMPCARD_TEMPLATES = [
  { id: "classic", name: "클래식", description: "사진과 이력을 정돈한 기본형" },
  { id: "cinema", name: "시네마", description: "어두운 바탕과 선명한 인물 사진" },
  { id: "magazine", name: "매거진", description: "화보와 여백을 살린 세리프 구성" },
  { id: "cozy", name: "포근", description: "따뜻한 색감과 부드러운 구성" },
  { id: "dignity", name: "품격", description: "활동 이력이 돋보이는 차분한 구성" },
] as const;
export const PROFILE_TEMPLATES = [
  ...COMPCARD_TEMPLATES,
  { id: "casting", name: "캐스팅 (이전 서식)", description: "기존 저장본 유지" },
  { id: "portfolio", name: "사진 중심 (이전 서식)", description: "기존 저장본 유지" },
  { id: "career", name: "경력 중심 (이전 서식)", description: "기존 저장본 유지" },
] as const;
export function isCompcard(template: string): boolean { return COMPCARD_TEMPLATES.some(t => t.id === template); }
export function templateName(template?: string | null): string {
  return PROFILE_TEMPLATES.find(t => t.id === (template ?? "casting"))?.name ?? "알 수 없는 서식";
}
