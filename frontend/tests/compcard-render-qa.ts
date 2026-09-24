import { mkdir, readFile, writeFile } from "node:fs/promises";
import { renderProfilePdf } from "../src/lib/profile/pdf";
import type { Profile } from "../src/types";
async function main() {
const output = "../output/pdf/compcards";
await mkdir(output, { recursive: true });
const examples = [
  ["classic", "actor", ["actor_head.jpg", "actor_cut1.jpg", "actor_cut2.jpg"]],
  ["classic", "model", ["model_full.jpg", "model_cut1.jpg", "model_cut2.jpg"]],
  ["cinema", "actor", ["cinema_head.jpg"]],
  ["magazine", "model", ["model_full.jpg", "model_cut1.jpg", "model_cut2.jpg"]],
  ["cozy", "actor", ["kid_head.jpg"]],
  ["dignity", "actor", ["senior_head.jpg"]],
] as const;
for (const [template_id, template_variant, files] of examples) {
  const p: Partial<Profile> = { template_id, template_variant, name: template_id === "cozy" ? "김하율" : template_id === "dignity" ? "박정호" : template_id === "cinema" ? "강도윤" : template_variant === "model" ? "차유담" : "서지안", birth_year: template_id === "cozy" ? 2018 : template_id === "dignity" ? 1958 : 1998,
    gender: template_id === "cinema" || template_id === "dignity" ? "남성" : "여성", genre: [template_variant === "model" ? "모델" : "배우"], height: template_id === "cozy" ? 128 : 168, weight: template_id === "cozy" ? 26 : 50,
    agency: "가상 프로필 · 실제 지원자 아님", specialty: ["생활 연기", "현대무용", "영어 회화"],
    bio: "주어진 상황과 상대의 감정에 집중합니다. 작은 표정과 자연스러운 움직임으로 인물을 표현합니다.",
    career: "2026  단편영화 〈여름의 끝〉 · 주연\n2025  웹드라마 〈오늘의 온도〉 · 조연\n2025  연극 〈오래된 편지〉 · 주연\n2024  독립영화 〈집으로 가는 길〉 · 단역",
    education: "연기 전공 · 가상 교육 이력", training: "2025 카메라 연기 워크숍\n2024 발성·호흡 트레이닝", awards: "2025 가상 단편영화제 연기상",
    phone: "010-0000-0000", guardian_name: template_id === "cozy" ? "보호자 예시" : "", guardian_phone: template_id === "cozy" ? "010-0000-0000" : "" };
  const photos = await Promise.all(files.map(f => readFile(`../docs/renewal/canvas/${f}`)));
  const bytes = await renderProfilePdf(p, photos, "2026-09-22T00:00:00Z");
  const id = template_id === "classic" ? `classic-${template_variant}` : template_id;
  await writeFile(`${output}/${id}.pdf`, bytes);
  console.log(`${id}: ${bytes.length} bytes`);
}

}
main().catch(error => { console.error(error); process.exitCode = 1; });

