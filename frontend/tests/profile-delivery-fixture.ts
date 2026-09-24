import { profileFormSchema } from "../src/lib/profile/form";

export const sampleProfile = profileFormSchema.parse({
  template_id: "casting", name: "서지안 (샘플)", birth_year: 1998,
  gender: "여성", height: 168, weight: 50, genre: ["배우"], activity_field: ["배우"],
  bio: "차분한 목소리와 섬세한 생활 연기로 인물의 감정을 전합니다. 담백한 청춘극부터 긴장감 있는 드라마까지.",
  agency: "프리랜서 · 가상 프로필", phone: "",
  specialty: ["현대무용 4년", "피아노", "영어 회화"],
  career: "2026  단편영화 <여름의 끝> | 지수 역 · 주연\n2025  웹드라마 <오늘의 온도> | 서연 역 · 조연\n2025  연극 <오래된 편지> | 유진 역 · 주연\n2024  독립영화 <집으로 가는 길> | 은서 역 · 단역\n\n※ 인물·작품·경력은 서비스 시연용 가상 정보이며 사진은 AI로 제작했습니다.",
  training: "2025–2026  카메라 연기·장면 분석 워크숍\n2024–2025  발성·호흡·신체 표현 트레이닝\n※ 교육 이력 또한 가상 샘플입니다.",
  introduction_url: "", performance_url: "", audio_url: "",
  instagram_url: "", youtube_url: "", other_url: "",
});
export const recipient = "jewon@turnover.ai.kr";
export const runToken = "AP-20260922-PROFILE";
