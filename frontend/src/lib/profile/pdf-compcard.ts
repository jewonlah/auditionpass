import PDFDocument from "pdfkit";
import path from "node:path";
import { buildProfileDocument } from "./document";
import type { Profile } from "@/types";

/** Layouts translated from the six original canvas compcards, with contain framing (55).
 * Text is paginated, never clipped or shrunk to fit. Only supplied facts are rendered. */
export async function renderCompcardPdf(input: Partial<Profile>, photos: Buffer[], savedAt: string): Promise<Buffer> {
  const { template, profile: p } = buildProfileDocument(input);
  const dark = template === "cinema", warm = template === "cozy", serif = template === "magazine" || template === "dignity";
  const colors = { bg: dark ? "#161615" : warm ? "#FBF6EC" : serif ? "#FAFAF7" : "#FFFFFF",
    ink: dark ? "#FAFAF7" : "#141414", muted: dark ? "#C9C7C1" : warm ? "#8A7B64" : "#4A4A48",
    line: dark ? "#3A3A38" : warm ? "#EBD9BC" : "#E7E5E0", accent: dark ? "#A5B4FC" : warm ? "#B45309" : "#4F46E5" };
  const pdf = new PDFDocument({ size: "A4", margin: 0, bufferPages: true, autoFirstPage: false,
    info: { Title: `${p.name} 포트폴리오`, Author: p.name, CreationDate: new Date(savedAt), ModDate: new Date(savedAt) } });
  pdf.registerFont("body", path.join(process.cwd(), "assets/fonts/NanumGothic-Regular.ttf"));
  pdf.registerFont("serif", path.join(process.cwd(), "assets/fonts/NanumMyeongjo-Regular.ttf"));
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    pdf.on("data", (b: Buffer) => chunks.push(b)); pdf.on("end", () => resolve(Buffer.concat(chunks))); pdf.on("error", reject);
  });
  const W = 595.28, H = 841.89, margin = 42, inner = W - 84, bottom = 754;
  function page() { pdf.addPage(); pdf.rect(0, 0, W, H).fill(colors.bg); }
  function write(value: string, x: number, y: number, width: number, size = 9.5, color = colors.ink, face = "body") {
    pdf.font(face).fontSize(size).fillColor(color).text(value, x, y, { width, lineGap: 3 }); return pdf.y;
  }
  function rule(x: number, y: number, width: number, color = colors.line) { pdf.moveTo(x, y).lineTo(x + width, y).lineWidth(.7).strokeColor(color).stroke(); }
  function photo(index: number, x: number, y: number, width: number, height: number) {
    if (!photos[index]) return;
    pdf.save(); pdf.roundedRect(x, y, width, height, warm ? 10 : 2).fill(dark ? "#201F1E" : colors.bg);
    pdf.image(photos[index], x, y, { fit: [width, height], align: "center", valign: "center" }); pdf.restore();
  }
  const facts = [p.birth_year ? `${p.birth_year}년생` : p.age ? `${p.age}세` : "", p.gender, ...(p.genre ?? [])].filter(Boolean).join(" · ");
  const measures = [p.height ? `${p.height} cm` : "", p.weight ? `${p.weight} kg` : "", p.agency].filter(Boolean).join(" · ");
  const titles: Record<string, string> = { classic: p.template_variant === "model" ? "MODEL · COMP CARD" : "ACTOR · COMP CARD", cinema: "CINEMA · ACTOR COMP CARD", magazine: "MAGAZINE · COMP CARD", cozy: "COZY · COMP CARD", dignity: "DIGNITY · COMP CARD" };
  const deferred: Array<[string, string]> = [];
  function section(label: string, value: string | null | undefined, x: number, y: number, width: number, end = bottom): number {
    if (!value?.trim()) return y;
    pdf.font("body").fontSize(9.5);
    const height = pdf.heightOfString(value, { width, lineGap: 3 });
    if (y + height + 30 > end) { deferred.push([label, value]); return y; }
    write(label, x, y, width, 8, colors.accent); rule(x, y + 14, width);
    return write(value, x, y + 23, width, 9.5, colors.muted) + 16;
  }
  try {
    page();
    if (template === "magazine") {
      const x = 36, width = 218;
      write(titles[template], x, 42, width, 8, colors.accent);
      let y = write(p.name || "포트폴리오", x, 76, width, 34, colors.ink, "serif") + 18;
      y = write(facts, x, y, width, 10, colors.muted) + 25;
      y = section("MEASUREMENTS", measures, x, y, width);
      y = section("SELECTED WORK", p.career, x, y, width);
      y = section("ABOUT", p.bio, x, y, width);
      y = section("SKILLS", p.specialty?.join(" · "), x, y, width);
      y = section("EDUCATION", [p.education, p.training].filter(Boolean).join("\n"), x, y, width);
      section("AWARDS", p.awards, x, y, width);
      photo(0, 280, 0, W - 280, photos.length > 1 ? 580 : 775);
      photo(1, 280, 588, (W - 288) / 2, 172); photo(2, 288 + (W - 288) / 2, 588, (W - 288) / 2, 172);
    } else {
      const center = template === "dignity";
      write(titles[template], margin, 36, inner, 8, colors.accent);
      const yName = write(p.name || "포트폴리오", margin, 58, inner, center ? 34 : 29, colors.ink, serif ? "serif" : "body");
      const headerEnd = write(facts, margin, yName + 10, inner, 9, colors.muted) + 16;
      rule(margin, headerEnd, inner, warm ? "#E4B15C" : colors.ink);
      const top = headerEnd + 18;
      if (template === "classic" && p.template_variant === "model") {
        const h = 350;
        photo(0, margin, top, 297, h); photo(1, 349, top, 204, 170); photo(2, 349, top + 180, 204, 170);
        let y = top + h + 15;
        rule(margin, y, inner, colors.ink); y = write(measures, margin + 12, y + 12, inner - 24, 12) + 15; rule(margin, y, inner, colors.ink);
        y = section("EXPERIENCE", p.career, margin, y + 16, inner);
        y = section("SKILLS · ABOUT", [p.specialty?.join(" · "), p.bio].filter(Boolean).join("\n"), margin, y, inner);
        y = section("EDUCATION", [p.education, p.training].filter(Boolean).join("\n"), margin, y, inner);
        section("AWARDS", p.awards, margin, y, inner);
      } else {
        const pw = dark ? 240 : center ? 218 : 225, gap = 21, x = margin + pw + gap, tw = inner - pw - gap;
        const ph = warm ? 300 : center ? 290 : dark ? 327 : 354;
        photo(0, margin, top, pw, ph);
        if (warm && (p.guardian_name || p.guardian_phone)) {
          section("보호자 연락처", [p.guardian_name, p.guardian_phone].filter(Boolean).join(" · "), margin, top + ph + 22, pw);
        } else if (center) {
          section("PROFILE", measures, margin, top + ph + 18, pw);
        } else if (!warm) {
          photo(1, margin, top + ph + 10, (pw - 8) / 2, 158); photo(2, margin + (pw + 8) / 2, top + ph + 10, (pw - 8) / 2, 158);
        }
        let y = top;
        if (!center) y = section("PROFILE", measures, x, y, tw);
        y = section("SKILLS", p.specialty?.join(" · "), x, y, tw);
        y = section(center ? "CAREER" : "FILMOGRAPHY", p.career, x, y, tw);
        y = section("EDUCATION", [p.education, p.training].filter(Boolean).join("\n"), x, y, tw);
        y = section("ABOUT", p.bio, x, y, tw);
        section("AWARDS", p.awards, x, y, tw);
      }
    }
    if (!warm && (p.guardian_name || p.guardian_phone)) deferred.push(["보호자 연락처", [p.guardian_name, p.guardian_phone].filter(Boolean).join(" · ")]);
    const links: Array<[string, string | null | undefined]> = [["자기소개 영상", p.introduction_url], ["활동 영상", p.performance_url], ["음성 샘플", p.audio_url], ["인스타그램", p.instagram_url], ["유튜브", p.youtube_url], ["포트폴리오", p.other_url]];
    for (const [label, value] of links) if (value) deferred.push([label, value]);
    // Additional photos and long text always remain in the exported document.
    const consumed = template === "cozy" || template === "dignity" ? 1 : 3;
    const extra = photos.slice(consumed);
    if (deferred.length || extra.length) {
      page(); let y = 42;
      write(`${p.name} · 추가 자료`, margin, y, inner, 18, colors.ink, serif ? "serif" : "body"); y += 42;
      for (const [label, value] of deferred) {
        if (y > bottom - 60) { page(); y = 42; }
        y = write(label, margin, y, inner, 9, colors.accent) + 12;
        // Break by measured lines, including unbroken URLs, before reaching footer.
        let line = "";
        const flush = () => { if (y > bottom - 16) { page(); y = 42; } const start = y; y = write(line || " ", margin, y, inner, 10, colors.muted) + 2; if (/^https?:\/\//i.test(value)) pdf.link(margin, start, inner, y - start, value); line = ""; };
        for (const ch of value) {
          pdf.font("body").fontSize(10);
          if (ch === "\n") { flush(); continue; }
          if (pdf.widthOfString(line + ch) > inner) flush();
          line += ch;
        }
        if (line) flush(); y += 18;
      }
      for (let i = 0; i < extra.length; i += 2) {
        if (y + 315 > bottom) { page(); y = 42; }
        photo(consumed + i, margin, y, (inner - 12) / 2, 300); photo(consumed + i + 1, margin + (inner + 12) / 2, y, (inner - 12) / 2, 300); y += 315;
      }
    }
    const { count } = pdf.bufferedPageRange();
    for (let i = 0; i < count; i++) {
      pdf.switchToPage(i); rule(margin, 777, inner);
      write(p.phone ? `연락 · ${p.phone}` : p.name || "", margin, 791, inner - 90, 8, colors.muted);
      write(`${i + 1} / ${count}`, W - 82, 791, 40, 8, colors.muted);
      write("AUDITIONPASS", margin, 812, inner, 7, colors.accent);
    }
    pdf.end();
  } catch (error) { pdf.destroy(error as Error); }
  return done;
}
