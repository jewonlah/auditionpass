# 028 운영 적용 확인

2026-09-12 KST. 사용자의 적용 여부 확인 요청에 따라 DB와 Vercel을 병렬 조회했다. 운영 변경은 수행하지 않았다.

## 확인된 사실

- `supabase migration list --linked`에서 025~028의 로컬·원격 이력이 일치한다. 028 버전은 `20260912000000`이다.
- 읽기 전용 `pg_get_functiondef` 조회에서 `begin_account_file_operation`, `finish_account_file_operation`, `begin_account_file_deletion` 세 함수가 실제로 존재하며 로컬 정의와 일치한다.
- 행 잠금, 삭제 상태 유지, auth 계정 존재 검사, 사용자와 토큰을 함께 검사하는 작업 종료, SECURITY DEFINER 및 빈 search_path를 확인했다.
- `028_readiness.sql`의 마지막 결과는 `tombstone_has_no_foreign_key=true`다.

따라서 이전 문서의 **025~028 운영 미적용 상태는 이 확인 시점에는 해당하지 않는다**. 이력뿐 아니라 실제 028 함수 정의도 확인했다.

## 확인하지 못한 항목

- Supabase CLI가 여러 SELECT 중 마지막 결과만 반환하여 테이블·RPC 권한 상세 결과는 확보하지 못했다. 추가 조회는 승인 대기 중 중단되어 실행하지 않았다.
- Vercel 프로젝트 연결명은 `auditionpass`로 확인했으나 사용할 인증 토큰을 확보하지 못했고, whoami는 네트워크 EACCES로 실패했다. 제한 밖 재조회는 중단되어 최신 운영 배포의 시간·커밋·상태를 확인하지 못했다.
- 따라서 **DB 028 적용은 확인**, **새 파일 작업 코드의 운영 배포는 미확인**이다. 로컬 미커밋 여부만으로 코드가 미배포됐다고 단정하지 않는다.

변경성 RPC 호출, DDL/DML, 실메일, 커밋·푸시·배포는 실행하지 않았다.
