# SNS 자동 게시 셋업 가이드

## 전체 구조

```
GitHub Actions (매일 자동)
  ├─ 03:00 KST → 크롤러 실행 (오디션 수집)
  └─ 09:00 KST → 콘텐츠 생성 + SNS 자동 게시
                    ├─ 이미지 생성 (Pillow)
                    ├─ Supabase Storage 업로드
                    ├─ Instagram Graph API 게시
                    └─ Threads API 게시
```

---

## 1단계: Instagram Business 계정 전환

1. Instagram 앱 → 설정 → 계정 → **프로페셔널 계정으로 전환**
2. **비즈니스** 또는 **크리에이터** 선택
3. Facebook 페이지 연결 (없으면 새로 생성)
   - 페이지 이름: "오디션패스" 등

## 2단계: Meta Developer 앱 생성

1. https://developers.facebook.com 접속
2. **My Apps** → **Create App**
3. 앱 유형: **Business**
4. 앱에 다음 제품 추가:
   - **Instagram Graph API**
   - **Threads API** (별도 추가)

## 3단계: Instagram 토큰 발급

### 3-1. 단기 토큰 생성
1. Meta Developer → 앱 → **Graph API Explorer**
2. 권한 선택:
   - `instagram_basic`
   - `instagram_content_publish`
   - `pages_read_engagement`
3. **Generate Access Token** 클릭
4. Instagram 계정 연결 승인

### 3-2. 장기 토큰으로 교환 (60일)
```bash
curl -X GET "https://graph.facebook.com/v21.0/oauth/access_token?\
grant_type=fb_exchange_token&\
client_id={앱ID}&\
client_secret={앱시크릿}&\
fb_exchange_token={단기토큰}"
```

### 3-3. Instagram Business Account ID 확인
```bash
curl "https://graph.facebook.com/v21.0/me/accounts?\
fields=instagram_business_account&\
access_token={장기토큰}"
```
→ `instagram_business_account.id` 값이 `INSTAGRAM_ACCOUNT_ID`

## 4단계: Threads 토큰 발급

1. Meta Developer → 앱 → **Use cases** → **Threads API** 추가
2. 권한:
   - `threads_basic`
   - `threads_content_publish`
3. Graph API Explorer에서 토큰 생성
4. 장기 토큰 교환:
```bash
curl -X GET "https://graph.threads.net/access_token?\
grant_type=th_exchange_token&\
client_id={앱ID}&\
client_secret={앱시크릿}&\
access_token={단기토큰}"
```

5. Threads User ID 확인:
```bash
curl "https://graph.threads.net/v1.0/me?\
access_token={장기토큰}"
```
→ `id` 값이 `THREADS_USER_ID`

## 5단계: Supabase Storage 버킷 설정

자동으로 `sns-images` 버킷이 생성되지만, 수동으로 하려면:

1. Supabase Dashboard → Storage → **New Bucket**
2. 이름: `sns-images`
3. **Public bucket** 체크 (중요!)
4. File size limit: 5MB

## 6단계: GitHub Secrets 등록

Repository → Settings → Secrets and variables → Actions → **New repository secret**

| Secret 이름 | 값 |
|---|---|
| `INSTAGRAM_ACCESS_TOKEN` | 3단계에서 발급한 장기 토큰 |
| `INSTAGRAM_ACCOUNT_ID` | 3단계에서 확인한 Business Account ID |
| `THREADS_ACCESS_TOKEN` | 4단계에서 발급한 장기 토큰 |
| `THREADS_USER_ID` | 4단계에서 확인한 User ID |

기존 시크릿 (이미 등록됨):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`

## 7단계: 토큰 자동 갱신 (선택)

장기 토큰은 60일 후 만료됩니다. 자동 갱신을 위해:

```bash
# Instagram 토큰 갱신
curl -X GET "https://graph.facebook.com/v21.0/oauth/access_token?\
grant_type=fb_exchange_token&\
client_id={앱ID}&\
client_secret={앱시크릿}&\
fb_exchange_token={현재토큰}"

# Threads 토큰 갱신
curl -X GET "https://graph.threads.net/refresh_access_token?\
grant_type=th_refresh_token&\
access_token={현재토큰}"
```

→ GitHub Actions에 월 1회 갱신 워크플로우 추가 가능

---

## 로컬 테스트

```bash
cd crawler

# 환경변수 설정
cp .env.example .env
# .env 파일에 실제 값 입력

# 콘텐츠 생성만 (게시 안 함)
cd instagram && python generate.py --type top5

# 생성 + Instagram만 게시
python generate.py --type top5 --publish --platform instagram

# 생성 + 전체 플랫폼 게시
python generate.py --type all --publish

# 게시만 (이미 생성된 콘텐츠)
cd .. && python -m sns.publish --date 2026-04-06
```

## 트러블슈팅

| 문제 | 해결 |
|---|---|
| "토큰 미설정 — 게시 건너뜀" | 해당 플랫폼의 환경변수 확인 |
| "이미지 업로드 실패" | Supabase Storage 버킷이 public인지 확인 |
| "컨테이너 에러" | 이미지 URL이 공개 접근 가능한지 확인 |
| "권한 부족" | Meta Developer에서 API 권한 재확인 |
| "토큰 만료" | 장기 토큰 재발급 (7단계 참고) |
