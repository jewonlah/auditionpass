// auditions 리스트 조회(탐색 페이지 SSR 첫 페이지 + 클라이언트 필터/검색/무한스크롤)에
// 공통으로 쓰는 select 컬럼 목록. `apply_email`은 절대 포함하지 않는다 — "*"로 select하면
// 클라이언트 fetch(AuditionsClient)의 네트워크 응답에 원클릭 지원 이메일 주소가 그대로
// 실려 브라우저 개발자도구·JS 실행 크롤러 어디서든 보인다 (Codex 리뷰, 36 §4 위반).
// 상세 페이지(`audition/[id]/page.tsx`)와 같은 원칙.
export const AUDITION_LIST_COLUMNS =
  "id,title,company,genre,category,deadline,description,requirements,source_url,source_name,apply_type,is_active,oneclick_blocked,reports_count,review_status,crawled_at,created_at";
