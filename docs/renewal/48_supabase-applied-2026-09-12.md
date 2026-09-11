# Supabase 025~028 운영 적용 완료

2026-09-12 KST. 사용자의 운영 Supabase 적용 지시에 따라 연결된 프로젝트에 `supabase db push --linked --yes`로 적용했다.

## 적용 및 검증

- 025 발송 요청 저장·서버 쓰기 권한, 026 프로필 버전, 027 비공개 PDF 버킷, 028 파일 작업·탈퇴 동시성 처리 적용 완료.
- 적용 전 dry-run에서 신규 4건만 확인. database와 supabase의 SQL 사본 SHA-256 일치 확인.
- 원격 migration 이력 총 11건, 로컬과 일치.
- `025_028_verification.sql` 읽기 전용 확인: 023~027 readiness 12개 모두 true.
- 현재 프로필의 스냅샷 누락·내용 불일치·지원 스냅샷 소유자 불일치 각각 0건.
- 기존 지원 중 스냅샷 없는 기록 2건은 과거 지원으로 보존. 과거 제출 정보를 임의 생성하지 않았다.
- 1시간 이상 sending 0건, 보존 중 발송 payload 0건.
- `profile-documents`: 비공개, PDF만 허용, 3MB 제한. 일반 사용자 직접 접근을 제한하는 정책 확인.
- 028 테이블 2개 RLS 활성·클라이언트 접근 차단, RPC 3개 서버 실행 허용·클라이언트 실행 차단·고정 search_path 확인.
- 새 코드 단위 테스트 132개 통과. 프로덕션 빌드·타입 검사·66개 페이지 생성 통과.
- 임시 PostgreSQL 028 검증 통과: 진행 중 작업, 삭제 상태 보존, 소유권, 권한, 두 연결의 동시성. 테스트 컨테이너 정리 완료.

Supabase Management API는 다중 SELECT 중 마지막 결과만 반환하므로, 기존 3개 검사 파일을 단일 JSON 결과로 합친 `database/checks/025_028_verification.sql`로 전체 결과를 확인했다.

## 적용 전 백업

저장소 밖 로컬 경로:
`C:\Users\jewon\AppData\Local\Temp\auditionpass-db-before-025-028-20260912-001115`

- `schema.sql`: public·storage 스키마.
- `public-data.sql`: public 데이터, COPY 형식.

백업 내용을 로그나 Git에 넣지 않았다. auth 데이터와 실제 Storage 파일을 포함한 전체 프로젝트 백업은 아니다. 데이터 덤프에서 community_comments·admin_actions의 순환 FK 복원 경고가 있었다. 복원 시 트리거/제약 처리와 기존 auth 참조를 검토해야 하며, 복원 리허설은 수행하지 않았다.

## 남은 운영 작업

이번 작업은 DB 적용이다. 앱 배포·실제 메일 발송은 수행하지 않았다. 앞서 확인된 Vercel 인증 문제는 아직 해결되지 않았다.

025 적용으로 구 코드의 사용자 세션 기반 applications INSERT/UPDATE는 차단된다. 따라서 새 서버 권한 지원 코드를 배포하기 전에는 구 버전의 지원 요청이 실패할 수 있다. 새 코드 배포가 다음 우선 작업이며, 기존 권한을 다시 개방하는 롤백은 수행하지 않았다.

실제 로그인·Storage PDF 생성/재조회·메일 첨부 수신·탈퇴 흐름은 별도 검증이 남아 있다. 기존 공개 profiles 버킷의 직접 업로드·삭제 정책은 이번 마이그레이션으로 변경되지 않았다.
