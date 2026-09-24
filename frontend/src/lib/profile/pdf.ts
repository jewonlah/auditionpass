import { renderCompcardPdf } from "./pdf-compcard";
import { renderLegacyProfilePdf } from "./pdf-legacy";
import { isCompcard } from "./templates";
import PDFDocument from "pdfkit";
import path from "node:path";
import sharp from "sharp";
import { buildProfileDocument } from "./document";
import { photoRows } from "./photos";
import type { Profile } from "@/types";

export async function renderProfilePdf(profile: Partial<Profile>, photos: Buffer[], savedAt: string, renderer = isCompcard(profile.template_id ?? "casting") ? "compcard-v1" : "legacy-v1"): Promise<Buffer> {
  if (renderer === "compcard-v1" && isCompcard(profile.template_id ?? "")) return renderCompcardPdf(profile, photos, savedAt);
  if (renderer === "legacy-v1" && !isCompcard(profile.template_id ?? "casting")) return renderLegacyProfilePdf(profile, photos, savedAt);
  throw new Error("지원하지 않는 문서 렌더러입니다.");
}

// Prior session improvement retained separately; saved legacy revisions use the deployed renderer.
export async function renderEnhancedLegacyPdf(profile: Partial<Profile>, photos: Buffer[], savedAt: string): Promise<Buffer> {
  const document = buildProfileDocument(profile);
  const p = document.profile;
  const photoSizes = new Map(await Promise.all(photos.map(async (photo) => {
    const size = await sharp(photo).metadata();
    return [photo, { width: size.width || 1, height: size.height || 1 }] as const;
  })));
  const font = path.join(process.cwd(), "assets/fonts/NanumGothic-Regular.ttf");
  const pdf = new PDFDocument({ size: "A4", margins: { top: 42, left: 42, right: 42, bottom: 62 }, font, bufferPages: true,
    info: { Title: `${p.name} 프로필`, Author: p.name, CreationDate: new Date(savedAt), ModDate: new Date(savedAt) } });
  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => {
    pdf.on("data", (chunk) => chunks.push(chunk));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);
  });
  const left = 42, width = 511, bottom = 770;
  let y = 42;
  function room(height: number) { if (y + height > bottom) { pdf.addPage(); y = 42; } }
  function text(value: string | null | undefined, size = 11, color = "#34312f") {
    if (!value) return;
    pdf.fontSize(size);
    const height = pdf.heightOfString(value, { width, lineGap: 4 });
    room(Math.min(height + 10, 60));
    pdf.fillColor(color).text(value, left, y, { width, lineGap: 4 });
    y = pdf.y + 12;
  }
  function section(label: string, value?: string | null) {
    if (!value) return;
    room(70); text(label, 10, "#a54124"); text(value);
  }
  function gallery(items: Buffer[]) {
    let titled = false;
    for (const row of photoRows(items)) {
      // A lone full-length image should use a real portfolio page, not a small
      // thumbnail followed by half an empty sheet. Keep the original framing.
      const reserve = titled ? 16 : 52;
      const remaining = bottom - y - reserve;
      const size = photoSizes.get(row[0])!;
      const singleHeight = Math.min(600, width * size.height / size.width);
      const h = row.length === 1 ? (remaining >= 360 ? Math.min(singleHeight, remaining) : singleHeight) : 300;
      room(h + reserve);
      if (!titled) { text("프로필 사진", 10, "#a54124"); titled = true; }
      const w = row.length === 1 ? width : (width - 12) / 2;
      row.forEach((photo, i) => {
        const dimensions = photoSizes.get(photo)!;
        const ratio = dimensions.width / dimensions.height;
        const drawWidth = Math.min(w, h * ratio);
        const drawHeight = drawWidth / ratio;
        pdf.image(photo, left + i * (w + 12) + (w - drawWidth) / 2, y + (h - drawHeight) / 2,
          { width: drawWidth, height: drawHeight });
      });
      y += h + 16;
    }
  }
  try {
    text(({ casting: "CASTING PROFILE", career: "CAREER PROFILE", portfolio: "PORTFOLIO" } as Record<string, string>)[document.template], 10, "#bd4728");
    const facts = [p.birth_year ? `${p.birth_year}년생` : p.age ? `${p.age}세` : null, p.gender,
      p.height ? `${p.height}cm` : null, p.weight ? `${p.weight}kg` : null, p.agency].filter(Boolean).join(" · ");
    if (photos[0] && document.template !== "portfolio") {
      const h = document.template === "casting" ? 210 : 140;
      const photoWidth = document.template === "casting" ? 190 : 110;
      pdf.image(photos[0], left, y, { fit: [photoWidth, h], align: "center", valign: "center" });
      const nameX = left + photoWidth + 24, nameWidth = width - photoWidth - 24;
      const headerTop = y;
      pdf.fillColor("#34312f").fontSize(25).text(p.name || "프로필", nameX, y + 15, { width: nameWidth, lineGap: 3 });
      pdf.moveDown(0.5).fontSize(11).text(p.genre?.join(" · ") || "", { width: nameWidth, lineGap: 4 });
      pdf.moveDown(0.6).fontSize(10).fillColor("#655d57").text(facts, { width: nameWidth, lineGap: 4 });
      y = Math.max(headerTop + h, pdf.y) + 24;
    } else {
    if (photos[0]) {
      const h = 310;
      pdf.image(photos[0], left, y, { fit: [width, h], align: "center", valign: "center" });
      y += h + 20;
    }
    text(p.name || "프로필", 27);
    text(p.genre?.join(" · "), 12, "#655d57");
    text(facts, 10);
    }
    if (document.template === "career") section("활동 이력", p.career);
    section("소개", p.bio);
    section("특기", p.specialty?.join(" · "));
    if (document.template !== "career") section("활동 이력", p.career);
    section("교육·트레이닝", p.training);
    gallery(photos.slice(1));
    section("연락처", p.phone);
    for (const [label, url] of [["자기소개 영상", p.introduction_url], ["연기·노래·댄스 영상", p.performance_url], ["음성·보컬 샘플", p.audio_url], ["인스타그램", p.instagram_url], ["유튜브", p.youtube_url], ["포트폴리오", p.other_url]]) {
      if (!url) continue;
      room(60); text(label, 10, "#a54124");
      pdf.fillColor("#51433a").fontSize(10).text(url, left, y, { width, link: url, underline: true });
      y = pdf.y + 14;
    }
    const { count } = pdf.bufferedPageRange();
    for (let page = 0; page < count; page++) {
      pdf.switchToPage(page);
      const previousMargin = pdf.page.margins.bottom;
      pdf.page.margins.bottom = 0;
      pdf.save().strokeColor("#e6e0da").lineWidth(0.5).moveTo(left, 783).lineTo(left + width, 783).stroke().restore();
      pdf.fontSize(8).fillColor("#877e76").text(`${p.name} · ${page + 1} / ${count}`, left, 795, { width, align: "right", lineBreak: false, lineGap: 0 });
      pdf.page.margins.bottom = previousMargin;
    }
    pdf.end();
  } catch (error) { pdf.destroy(error as Error); }
  return finished;
}
