-- 016: 신고 삽입 경로를 서버로 일원화 (Codex 교차 리뷰 P1)
--
-- 015의 insert 정책은 로그인 사용자가 anon 키로 reports에 직접 행을 넣을 수 있게 했다.
-- 그러면 /api/report의 검증을 통째로 우회한다:
--   · severity·status·sla_due_at을 스스로 지정 (사유↔등급 매핑 무시)
--   · 계정당 24시간 5건 제한 우회 → 공고 수만큼 신고를 쏟아 운영자 큐·소스 강등 집계를 오염
--   · status='dismissed'로 넣어 중복 방지 슬롯만 소진하고 운영자에게 노출되지 않게 만들기
--
-- 조회 정책은 유지한다(본인 신고 내역 화면 /my/reports가 이 정책으로 읽는다).
-- 삽입은 서버 라우트가 service role로 수행하며, 거기서 사유→등급·SLA를 유도하고 한도를 건다.

drop policy if exists "본인 신고 생성" on reports;
