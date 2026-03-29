import type { Audition } from "@/types";

function getDateFromToday(daysFromNow: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().split("T")[0];
}

export const DUMMY_AUDITIONS: Audition[] = [
  {
    id: "1",
    title: "[tvN] 새 수목드라마 '빛나는 순간' 주·조연 오디션",
    company: "CJ ENM",
    genre: "배우",
    deadline: getDateFromToday(2),
    apply_email: "casting@cjenm.com",
    description:
      "tvN 새 수목드라마 '빛나는 순간'의 주연 및 조연 배역 오디션을 진행합니다.\n\n작품은 2026년 하반기 방영 예정이며, 20~30대 남녀 배우를 모집합니다.\n촬영 기간은 약 4개월이며, 서울 및 경기 지역에서 촬영이 진행됩니다.",
    requirements:
      "• 20~30대 남녀\n• 연기 경력 1년 이상\n• 촬영 기간 전일정 참여 가능자\n• 에이전시 소속/비소속 모두 지원 가능",
    source_url: null,
    source_name: "씨엔씨캐스팅",
    is_active: true,
    crawled_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  },
  {
    id: "2",
    title: "2026 S/S 서울패션위크 모델 캐스팅",
    company: "서울패션위크 조직위원회",
    genre: "모델",
    deadline: getDateFromToday(5),
    apply_email: "model@sfw.kr",
    description:
      "2026 S/S 서울패션위크 런웨이 모델을 모집합니다.\n\n서울 동대문디자인플라자(DDP)에서 진행되며, 국내외 유명 디자이너 브랜드 쇼에 참여하게 됩니다.",
    requirements:
      "• 여성: 170cm 이상 / 남성: 180cm 이상\n• 워킹 경험 우대\n• 컴포지트 카드 지참\n• 오디션 당일 하이힐 지참 (여성)",
    source_url: null,
    source_name: "모델라인",
    is_active: true,
    crawled_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  },
  {
    id: "3",
    title: "단편영화 '기억의 조각' 주연 오디션",
    company: "인디필름 프로덕션",
    genre: "배우",
    deadline: getDateFromToday(1),
    apply_email: "indie@film.com",
    description:
      "단편영화 '기억의 조각' 주연 여배우를 캐스팅합니다.\n\n기억을 잃어가는 젊은 여성의 이야기를 그린 감성 드라마입니다.\n부산국제영화제 출품 예정작입니다.",
    requirements:
      "• 25~35세 여성\n• 감성적인 연기 가능자\n• 촬영일: 4월 중 2주간\n• 출연료 협의",
    source_url: null,
    source_name: "캐스팅엔",
    is_active: true,
    crawled_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  },
  {
    id: "4",
    title: "뷰티 브랜드 'LAKA' 화보 모델 모집",
    company: "LAKA",
    genre: "모델",
    deadline: getDateFromToday(10),
    apply_email: "pr@laka.co.kr",
    description:
      "젠더 뉴트럴 뷰티 브랜드 LAKA의 2026 S/S 캠페인 화보 모델을 모집합니다.\n\n개성있는 외모와 자유로운 분위기를 가진 모델을 찾고 있습니다.",
    requirements:
      "• 성별 무관\n• 개성있는 외모\n• 뷰티 화보 경험 우대\n• 촬영일: 4월 15~16일 (2일)",
    source_url: null,
    source_name: "모델라인",
    is_active: true,
    crawled_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  },
  {
    id: "5",
    title: "[웹드라마] '캠퍼스 로맨스' 조연 모집",
    company: "플레이리스트",
    genre: "배우",
    deadline: getDateFromToday(7),
    apply_email: "casting@playlist.com",
    description:
      "플레이리스트 신작 웹드라마 '캠퍼스 로맨스'의 조연 배우를 모집합니다.\n\n대학교를 배경으로 한 로맨틱 코미디 작품입니다.\nYouTube 및 OTT 동시 공개 예정.",
    requirements:
      "• 20대 남녀\n• 대학생 역할에 어울리는 외모\n• 코미디 연기 가능자 우대\n• 촬영 기간: 5~6월",
    source_url: null,
    source_name: "캐스팅엔",
    is_active: true,
    crawled_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  },
  {
    id: "6",
    title: "스포츠 브랜드 광고 모델 캐스팅",
    company: "나이키 코리아",
    genre: "모델",
    deadline: getDateFromToday(3),
    apply_email: "casting@nike.kr",
    description:
      "나이키 코리아 2026 여름 캠페인 광고 모델을 캐스팅합니다.\n\n에너지 넘치는 스포츠 라이프스타일을 표현할 수 있는 모델을 찾습니다.",
    requirements:
      "• 20~30대 남녀\n• 운동/스포츠 경험자 우대\n• 건강한 이미지\n• 촬영일: 4월 중 3일",
    source_url: null,
    source_name: "모델라인",
    is_active: true,
    crawled_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  },
  {
    id: "7",
    title: "[뮤지컬] '시카고' 앙상블 오디션",
    company: "신시컴퍼니",
    genre: "배우",
    deadline: getDateFromToday(14),
    apply_email: "musical@shinsi.com",
    description:
      "뮤지컬 '시카고' 내한공연 앙상블 캐스팅을 진행합니다.\n\n2026년 7~9월 블루스퀘어 신한카드홀에서 공연 예정입니다.",
    requirements:
      "• 노래, 춤 가능한 남녀 배우\n• 뮤지컬 출연 경험 우대\n• 오디션: 자유곡 1절 + 안무 시연\n• 리허설 6월부터",
    source_url: null,
    source_name: "씨엔씨캐스팅",
    is_active: true,
    crawled_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  },
  {
    id: "8",
    title: "OTT 오리지널 시리즈 신인 배우 공개 오디션",
    company: "넷플릭스 코리아",
    genre: "배우",
    deadline: getDateFromToday(0),
    apply_email: "casting@netflix.kr",
    description:
      "넷플릭스 오리지널 시리즈 신인 발굴 공개 오디션입니다.\n\n연기 경력에 관계없이 누구나 지원 가능합니다.\n최종 선발자는 넷플릭스 신작 시리즈에 출연하게 됩니다.",
    requirements:
      "• 18~28세 남녀\n• 연기 경력 무관\n• 열정과 성실함을 갖춘 분\n• 자기소개 영상(1분) 제출",
    source_url: null,
    source_name: "씨엔씨캐스팅",
    is_active: true,
    crawled_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  },
];
