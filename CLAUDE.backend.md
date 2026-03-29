# 백엔드 API 에이전트 — Next.js API Routes

## 역할
Next.js API Routes를 활용한 서버사이드 로직 구현.
지원 횟수 제한, 이메일 발송 트리거, 결제 연동, 광고 보너스 처리.

## API 엔드포인트 목록

### 인증
| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/auth/signup` | 회원가입 (Supabase Auth 래핑) |
| POST | `/api/auth/login` | 로그인 |
| POST | `/api/auth/logout` | 로그아웃 |

### 프로필
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/profile` | 내 프로필 조회 |
| POST | `/api/profile` | 프로필 생성 |
| PUT | `/api/profile` | 프로필 수정 |
| POST | `/api/profile/photos` | 사진 업로드 (Supabase Storage) |

### 오디션
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/auditions` | 오디션 리스트 (필터링 지원) |
| GET | `/api/auditions/[id]` | 오디션 상세 |

### 지원
| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/apply` | 원클릭 지원 (핵심 API) |
| GET | `/api/apply/limit` | 오늘 지원 가능 여부 확인 |
| POST | `/api/apply/ad-bonus` | 광고 시청 완료 → 보너스 지급 |
| GET | `/api/history` | 지원 이력 조회 |

### 결제
| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/payment/confirm` | 토스페이먼츠 결제 확인 |
| POST | `/api/payment/webhook` | 토스 웹훅 처리 |

---

## 핵심 API 상세 구현

### POST `/api/apply` — 원클릭 지원
```typescript
// 처리 순서:
// 1. 로그인 여부 확인
// 2. 프로필 등록 여부 확인
// 3. 지원 가능 횟수 확인 (can_apply_today 함수 호출)
// 4. 이미 지원한 오디션인지 확인
// 5. 이메일 발송 (email 에이전트 호출)
// 6. applications 테이블 기록
// 7. daily_apply_count 업데이트

export async function POST(req: Request) {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: '로그인이 필요합니다' }, { status: 401 });
  }

  const { auditionId } = await req.json();

  // 지원 가능 여부 확인
  const { data: canApply } = await supabase
    .rpc('can_apply_today', { p_user_id: user.id });

  if (!canApply) {
    return Response.json({
      error: '오늘 지원 횟수를 모두 사용했습니다',
      code: 'LIMIT_EXCEEDED'
    }, { status: 429 });
  }

  // 오디션 정보 조회
  const { data: audition } = await supabase
    .from('auditions')
    .select('*')
    .eq('id', auditionId)
    .single();

  // 프로필 조회
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  // 이메일 발송
  await sendApplicationEmail({ audition, profile, userEmail: user.email });

  // 이력 저장
  await supabase.from('applications').insert({
    user_id: user.id,
    audition_id: auditionId,
    email_sent: true,
    sent_at: new Date().toISOString()
  });

  // 횟수 업데이트
  await supabase.rpc('increment_apply_count', { p_user_id: user.id });

  return Response.json({ success: true });
}
```

### POST `/api/apply/ad-bonus` — 광고 시청 보너스
```typescript
// 광고 시청 완료 후 프론트에서 호출
// 검증: 광고 시청 토큰 확인 (Google AdSense 콜백)
// daily_apply_count.ad_bonus += 1

export async function POST(req: Request) {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: '로그인이 필요합니다' }, { status: 401 });
  }

  // ad_bonus 1 증가
  const today = new Date().toISOString().split('T')[0];

  await supabase
    .from('daily_apply_count')
    .upsert({
      user_id: user.id,
      apply_date: today,
      count: 0,
      ad_bonus: 1
    }, {
      onConflict: 'user_id,apply_date',
      ignoreDuplicates: false
    });

  return Response.json({ success: true, message: '추가 지원권 1회가 지급되었습니다' });
}
```

### POST `/api/payment/confirm` — 토스페이먼츠 결제 확인
```typescript
// 토스 결제 승인 후 호출
// 1. 토스 API로 결제 검증
// 2. subscriptions 테이블 업데이트
// 3. 구독 만료일 계산 (현재 + 30일)

export async function POST(req: Request) {
  const { paymentKey, orderId, amount } = await req.json();

  // 토스 결제 확인 요청
  const tossResponse = await fetch(
    'https://api.tosspayments.com/v1/payments/confirm',
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(process.env.TOSS_SECRET_KEY + ':').toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ paymentKey, orderId, amount }),
    }
  );

  if (!tossResponse.ok) {
    return Response.json({ error: '결제 확인 실패' }, { status: 400 });
  }

  // 구독 정보 저장
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const plan = amount === 9900 ? 'basic' : 'pro';
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  await supabase.from('subscriptions').insert({
    user_id: user.id,
    plan,
    status: 'active',
    expires_at: expiresAt.toISOString(),
    toss_order_id: orderId,
  });

  return Response.json({ success: true, plan });
}
```

## 미들웨어 (middleware.ts)
```typescript
// 로그인 필요 페이지 보호
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PROTECTED_ROUTES = ['/profile', '/history', '/apply'];

export function middleware(request: NextRequest) {
  const token = request.cookies.get('sb-access-token');

  if (PROTECTED_ROUTES.some(r => request.nextUrl.pathname.startsWith(r))) {
    if (!token) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  return NextResponse.next();
}
```

## 작업 지시 예시
```
backend/CLAUDE.md를 참조해서:
1. POST /api/apply 엔드포인트를 완성해줘
2. 지원 횟수 제한 로직을 포함해서 구현해줘
3. 에러 케이스별 응답 코드도 명확하게 처리해줘
```
