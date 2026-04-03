# 운영 에이전트 (Ops Agent) — 서비스 모니터링 & 최적화

## 역할
오디션패스 서비스의 안정적 운영을 위한 모니터링, 데이터 품질 관리, 성능 최적화, CI/CD 관리를 담당한다.

## 담당 영역

### 1. 크롤러 모니터링

#### 수집 현황 점검
```sql
-- 사이트별 최근 7일 수집 건수 추적
SELECT
  source_name,
  DATE(crawled_at) AS crawl_date,
  COUNT(*) AS collected
FROM auditions
WHERE crawled_at >= NOW() - INTERVAL '7 days'
GROUP BY source_name, DATE(crawled_at)
ORDER BY crawl_date DESC, source_name;
```

#### 실패 감지 기준
- 특정 사이트의 일일 수집 건수가 **0건**이면 크롤러 실패로 판단
- 직전 7일 평균 대비 **50% 이상 감소**하면 이상 징후로 판단
- `crawled_at` 기준 **24시간 이상** 신규 데이터가 없으면 경고

#### 점검 쿼리
```sql
-- 24시간 내 수집 없는 소스 감지
SELECT DISTINCT source_name
FROM auditions
WHERE source_name NOT IN (
  SELECT DISTINCT source_name
  FROM auditions
  WHERE crawled_at >= NOW() - INTERVAL '24 hours'
);

-- 소스별 최근 수집 시각
SELECT
  source_name,
  MAX(crawled_at) AS last_crawled,
  COUNT(*) FILTER (WHERE crawled_at >= NOW() - INTERVAL '24 hours') AS today_count
FROM auditions
GROUP BY source_name
ORDER BY last_crawled DESC;
```

#### 대응 방법
1. GitHub Actions 실행 로그 확인: `gh run list --workflow=crawler.yml --limit=5`
2. 실패한 워크플로우 재실행: `gh run rerun <run-id>`
3. 크롤러 코드 수정이 필요한 경우 → `CLAUDE.crawler.md` 에이전트에 위임

---

### 2. 데이터 품질 관리

#### 2-1. apply_email 정확도 검증
```sql
-- 이메일 형식이 올바르지 않은 레코드 검출
SELECT id, title, apply_email, source_name
FROM auditions
WHERE apply_email IS NOT NULL
  AND apply_email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$';

-- 이메일 없는 활성 공고 (지원 불가 상태)
SELECT id, title, source_name, created_at
FROM auditions
WHERE is_active = true
  AND apply_email IS NULL
ORDER BY created_at DESC;
```

**조치**: 잘못된 형식의 이메일은 `apply_email = NULL`로 업데이트하여 사용자에게 노출되지 않도록 처리.

#### 2-2. 중복 공고 감지 및 제거
```sql
-- source_url 기준 중복 감지
SELECT source_url, COUNT(*) AS cnt
FROM auditions
WHERE source_url IS NOT NULL
GROUP BY source_url
HAVING COUNT(*) > 1;

-- 제목+회사 기준 유사 중복 감지
SELECT title, company, COUNT(*) AS cnt
FROM auditions
WHERE is_active = true
GROUP BY title, company
HAVING COUNT(*) > 1
ORDER BY cnt DESC;

-- 중복 제거 (가장 최근 것만 남기고 비활성화)
UPDATE auditions SET is_active = false
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY source_url ORDER BY crawled_at DESC
    ) AS rn
    FROM auditions
    WHERE source_url IS NOT NULL
  ) sub
  WHERE rn > 1
);
```

#### 2-3. 마감된 공고 자동 비활성화
```sql
-- 마감일이 지난 공고 비활성화
UPDATE auditions
SET is_active = false
WHERE deadline < CURRENT_DATE
  AND is_active = true;

-- 비활성화 대상 미리보기
SELECT id, title, deadline, source_name
FROM auditions
WHERE deadline < CURRENT_DATE
  AND is_active = true
ORDER BY deadline ASC;
```

**권장**: 이 쿼리를 Supabase의 `pg_cron` 또는 GitHub Actions에 추가하여 매일 자동 실행.

```sql
-- pg_cron 설정 예시
SELECT cron.schedule(
  'deactivate-expired-auditions',
  '0 0 * * *',  -- 매일 자정
  $$UPDATE auditions SET is_active = false WHERE deadline < CURRENT_DATE AND is_active = true$$
);
```

---

### 3. 성능 최적화

#### 3-1. 필수 인덱스
```sql
-- 오디션 리스트 조회 최적화 (메인 쿼리)
CREATE INDEX IF NOT EXISTS idx_auditions_active_deadline
  ON auditions (is_active, deadline DESC NULLS LAST)
  WHERE is_active = true;

-- 장르별 필터링
CREATE INDEX IF NOT EXISTS idx_auditions_genre_active
  ON auditions (genre, is_active)
  WHERE is_active = true;

-- 소스별 크롤링 추적
CREATE INDEX IF NOT EXISTS idx_auditions_source_crawled
  ON auditions (source_name, crawled_at DESC);

-- 중복 방지용 (upsert 성능)
CREATE UNIQUE INDEX IF NOT EXISTS idx_auditions_source_url
  ON auditions (source_url)
  WHERE source_url IS NOT NULL;

-- 지원 이력 조회
CREATE INDEX IF NOT EXISTS idx_applications_user_created
  ON applications (user_id, created_at DESC);

-- 일일 지원 횟수 조회
CREATE INDEX IF NOT EXISTS idx_daily_apply_user_date
  ON daily_apply_count (user_id, apply_date);
```

#### 3-2. 느린 쿼리 감지
```sql
-- Supabase에서 느린 쿼리 확인 (pg_stat_statements 활용)
SELECT
  query,
  calls,
  mean_exec_time::numeric(10,2) AS avg_ms,
  total_exec_time::numeric(10,2) AS total_ms
FROM pg_stat_statements
WHERE mean_exec_time > 100  -- 평균 100ms 이상
ORDER BY mean_exec_time DESC
LIMIT 20;

-- 테이블별 순차 스캔 비율 (인덱스 누락 의심)
SELECT
  relname AS table_name,
  seq_scan,
  idx_scan,
  CASE WHEN seq_scan + idx_scan > 0
    THEN ROUND(100.0 * seq_scan / (seq_scan + idx_scan), 1)
    ELSE 0
  END AS seq_scan_pct
FROM pg_stat_user_tables
WHERE seq_scan + idx_scan > 100
ORDER BY seq_scan_pct DESC;
```

#### 3-3. 테이블 통계
```sql
-- 테이블별 행 수 및 디스크 사용량
SELECT
  relname AS table_name,
  n_live_tup AS row_count,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;
```

---

### 4. GitHub Actions 워크플로우 관리

#### 4-1. 크롤러 스케줄 현황
| 워크플로우 | 스케줄 | 파일 |
|---|---|---|
| Daily Audition Crawler | `0 18 * * *` (KST 03:00) | `.github/workflows/crawler.yml` |

#### 4-2. 실행 상태 점검
```bash
# 최근 워크플로우 실행 이력
gh run list --workflow=crawler.yml --limit=10

# 특정 실행 로그 확인
gh run view <run-id> --log

# 실패한 실행만 필터링
gh run list --workflow=crawler.yml --status=failure --limit=5
```

#### 4-3. 실패 시 대응 절차
1. **즉시 재시도**: `gh run rerun <run-id>`
2. **로그 분석**: `gh run view <run-id> --log-failed`
3. **원인별 대응**:
   - **타임아웃**: `timeout-minutes` 값 증가 검토 (현재 30분)
   - **Playwright 오류**: 대상 사이트 HTML 구조 변경 확인 → 크롤러 에이전트에 수정 위임
   - **Supabase 연결 실패**: Secrets 만료 여부 확인, Supabase 대시보드 상태 점검
   - **의존성 오류**: `requirements.txt` 버전 충돌 확인

#### 4-4. 워크플로우 개선 제안
```yaml
# 실패 시 자동 재시도 추가 (crawler.yml에 적용)
jobs:
  crawl:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    strategy:
      max-parallel: 1
    # 실패 시 1회 재시도
    # GitHub Actions에서는 job 레벨 retry가 없으므로
    # step 레벨에서 처리
    steps:
      # ... 기존 steps ...

      - name: 크롤러 실행 (재시도 포함)
        working-directory: crawler
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          python main.py || (echo "1차 실패, 60초 후 재시도..." && sleep 60 && python main.py)
```

---

## 정기 점검 체크리스트

운영 에이전트에게 아래 작업을 지시하여 정기 점검을 수행한다.

### 매일
- [ ] 크롤러 실행 성공 여부 확인
- [ ] 마감된 공고 비활성화 처리

### 주간
- [ ] 사이트별 수집 건수 추이 확인
- [ ] 잘못된 이메일 형식 데이터 정리
- [ ] 중복 공고 감지 및 정리

### 월간
- [ ] 느린 쿼리 점검 및 인덱스 최적화
- [ ] 테이블 크기 및 행 수 확인
- [ ] GitHub Actions 사용량 확인

---

## 작업 지시 예시

```
CLAUDE.ops.md를 참조해서:
1. 크롤러 실행 상태를 점검해줘
2. 데이터 품질 점검을 실행해줘 (이메일 형식, 중복, 마감 공고)
3. 느린 쿼리가 있는지 확인하고 인덱스 추가가 필요하면 알려줘
4. 마감된 공고를 비활성화하는 pg_cron 설정을 만들어줘
5. 크롤러 워크플로우에 재시도 로직을 추가해줘
```

## 관련 에이전트
- `CLAUDE.crawler.md` — 크롤러 코드 수정 시 위임
- `CLAUDE.database.md` — 스키마 변경, 마이그레이션 필요 시 위임
- `CLAUDE.backend.md` — API 성능 이슈 발견 시 위임
