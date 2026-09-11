# 운영 반영 사전 실측 — 2026-09-12

## 운영 DB: 읽기 전용 확인 완료

`supabase migration list --linked` 및 `database/checks/profile_delivery_preflight.sql` 실행 결과다. 운영 데이터·스키마 변경은 수행하지 않았다.

- 원격 CLI 이력 7건. `20260903040000`(023), `20260904010000`(profiles UPDATE WITH CHECK) 적용 확인.
- 025·026·027은 이력뿐 아니라 실제 테이블·컬럼·버킷에서도 미적용 확인.
- profiles 2건, applications 2건 모두 `sent`. 현재 `sending` 잔여 기록 없음.
- applications는 RLS 활성화, 본인 SELECT·INSERT 정책만 존재. UPDATE 정책 없음. 현재 로컬 HEAD의 사용자 세션 기반 지원 결과 upsert와 맞지 않으므로 서버 권한 발송 코드 반영이 필요하다. 이것만으로 현재 운영 배포 커밋이나 실제 메일 장애를 단정하지 않는다.
- profiles의 본인 UPDATE는 USING·WITH CHECK 모두 `auth.uid() = id`.
- Storage에는 공개 `profiles` 버킷만 존재. 업로드·삭제는 본인 경로 제한, SELECT는 버킷 전체 허용. 비공개 `profile-documents`는 아직 없음.

## 이번 세션 검증

- 단위 테스트 122개 통과(028 변경 전).
- Chrome 모바일 크기 브라우저 6개 통과(모의 Supabase/API).
- lint 오류 0, 기존 MY 이미지 경고 1(028 변경 전).
- Docker Desktop 시작 후 임시 PostgreSQL에서 026·027 회귀 통과: 기존 프로필 버전 생성, 수정/no-op/위조 방지, RLS, 스냅샷 실패 원자성, 계정 CASCADE, 광범위한 기존 Storage 정책 아래 PDF 차단. 임시 컨테이너 정리 완료.
- 프로덕션 빌드는 실행 도중 다른 작업의 `account/delete` 변경이 들어와, 당시 아직 생성되지 않은 `lib/account/file-lifecycle` import로 실패했다. 이후 해당 파일 생성은 확인했지만 최신 변경 전체의 최종 빌드 성공을 뜻하지 않는다.

## 변경 기준 확정 필요

검증 도중 이 세션에서 작성하지 않은 028 마이그레이션, 파일 수명 관리 코드·테스트, 46번 문서 및 readiness SQL이 추가됐다. 다른 세션의 편집 완료 여부를 사용자에게 문의했다. 새 코드가 028 RPC에 의존하므로 적용 범위를 025~027로 고정하면 안 된다.

다른 작업이 끝나면 최종 diff를 확정하고 028까지 검토한 뒤 단위·브라우저·빌드 및 028 DB 검증을 실행한다. 변경 중인 코드는 커밋·배포하지 않는다.

## 다음 단계

1. 편집 완료 기준을 확정하고 최신 변경을 검증한다.
2. Vercel CLI 인증 오류를 해결하고 실제 배포 커밋·환경을 조회한다. 이번 `whoami`와 `teams list`는 ByteString 변환 오류로 실패했으며 계정·배포 상태를 확인하지 못했다. 인증값은 출력하지 않았다.
3. 운영과 분리된 검증 환경에서 실제 로그인·Storage·PDF 재조회·탈퇴를 확인한다. 테스트 수신 주소를 사용자에게 요청했으며 실메일은 보내지 않았다.
4. 검토된 변경을 브랜치/커밋으로 정리하고, DB 백업·적용과 코드 전환 순서를 확정한다. 025 권한 회수 후 구 코드만 롤백하는 절차는 사용하지 않는다.

이번 세션에서 직접 추가한 파일은 이 기록과 읽기 전용 `profile_delivery_preflight.sql`이다. 운영 DB 적용, 실메일 발송, 커밋, 푸시 및 배포는 수행하지 않았다.
