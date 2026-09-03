> 문서 번호 40 · 작성 2026-09-03 · 실측 기반 런칭 체크리스트. 갱신 시 날짜와 상태만 바꾼다.

# 런칭 준비 실측 체크리스트 (2026-09-03)

> 실측: 코드 `frontend/src/` + 라이브 https://www.auditionpass.co.kr GET curl + DNS 조회. 정본 D1~D8·PRD F1~F12 대조. `.env` 값 미열람.

## 차단 후보 9건 → 분류

### A. 소유자 입력 없이 바로 고치는 버그 (착수: `fix/launch-prep-a`)
| # | 항목 | 근거 |
|---|---|---|
| 4 | 지원 메일 발송 실패 시 `applications.status='failed'` 미기록 — 실패 이력 유실, 지원 화면의 "발송 실패" 분기가 죽은 코드 | `api/apply/route.ts:138-168` |
| 8 | PWA 아이콘 `/icons/icon-192x192.png`·`512` 라이브 404 — manifest가 없는 파일 참조 | `public/icons/` 부재 |
| — | `alert()`/`confirm()` 4곳 잔존(F12) | `PhotoUpload.tsx:40,43` `my/posts/page.tsx:68` `community/[id]/page.tsx:156` `admin/candidates/CandidatesClient.tsx:127` |
| — | `maximumScale: 1`(핀치 줌 차단, WCAG 1.4.4) | `app/layout.tsx:54` |
| — | 홈 canonical 없음, Organization JSON-LD 없음 | 라이브 curl |
| — | sitemap 실패 무음 catch(F9) | `app/sitemap.ts:94-96` |
| — | apex→www 리다이렉트 307(영구 아님) | `curl -I https://auditionpass.co.kr` |
| — | 개발환경 오발송 가드 없음 | `sendApplicationEmail.ts` |
| — | `lib/dummy-data.ts` 154줄 죽은 코드, `.env.local.example`의 토스·AdSense 항목 | F11 |

### B. 소유자 입력 필요
| # | 항목 | 필요한 것 |
|---|---|---|
| 1 | 구글 OAuth 버튼·플로우 미구현(D8 R1 필수) | Google Cloud OAuth 클라이언트 ID/시크릿 → Supabase Auth Provider 설정. 콜백 라우트는 이미 `code` 수용 |
| 7 | 에러 모니터링 없음(Sentry 0건) | Sentry 프로젝트 DSN |

### C. 범위 결정 필요 (런칭 전 필수인지 소유자 판단)
| # | 항목 | 규모 |
|---|---|---|
| 2 | 온보딩 3스텝 `/onboarding` 라우트 부재(D5) | 화면 3개 + 가입 후 분기. 중 |
| 3 | 회원 탈퇴가 이메일 수동 요청뿐 — 개인정보처리방침 §6과 불일치 | 탈퇴 API(auth.admin.deleteUser + 데이터 삭제) + MY 버튼. 소 |
| 5 | `/auditions`·`/community`·`/community/[id]` 클라이언트 렌더(D7 위반, 색인 불가) | 3페이지 SSR 전환. 중~대 |
| 6 | 커뮤니티 상세 generateMetadata·Article 스키마·OG 없음(F9 MUST) | layout.tsx 추가. 소(5와 함께) |
| 9 | PWA 서비스워커 미연결(`/sw.js` 404, next-pwa 미설정) | next.config 래핑. 소, 단 캐시 정책 검토 필요 |

## 영역별 완료 확인 (차단 아님)
- 가입·로그인: 이메일/비번 가입, returnTo, 프로필 게이트 바텀시트, 로그아웃, `/login` 200 — 완료
- 메일: Resend 발송·사진 서명 URL·Reply-To 완료. DNS SPF/DKIM/DMARC 존재(DMARC `p=none` — 강화 권장)
- SEO: robots.txt, sitemap 4,604건(커뮤니티·카테고리 랜딩 0), 공고 상세 SSR+JobPosting, noindex, 서치콘솔·네이버 메타 — 완료
- 법적: 이용약관·개인정보처리방침(사업자 정보 없이 가능한 수준), 출처 표기, 신고 10종, 문의 채널 — 완료. 미성년 공개 고지문 없음(권장)
- 운영: GA4 페이지뷰만(퍼널 이벤트 0건 — 권장), manifest 200, 404/500 기본 페이지
- 폐지 잔존: `/pricing` 308, AdSense 코드 0건, 지원 제한은 꺼진 스위치(`APPLY_DAILY_LIMIT`)로 잔존, 토스 SDK 의존성만 잔존, 카테고리 필터 5개(14 중 2개 노출)

## 권장(차단 아님)
프로필 폼 활동분야/장르 이중 질문(A5), 세션 만료 안내, DMARC 강화, GA4 퍼널 이벤트, 미성년 고지, 카테고리 SEO 랜딩 14개(P2), `APPLY_DAILY_LIMIT` 스위치 제거 여부
