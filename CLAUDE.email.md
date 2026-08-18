# 메일 발송 에이전트 — Resend

## 역할
Resend를 사용한 트랜잭션 이메일 발송. 오디션 지원 자동 메일 전송.

## 설치
```bash
npm install resend
```

## 디렉토리 구조
```
frontend/src/
├── lib/
│   └── email/
│       ├── resend.ts           # Resend 클라이언트
│       └── templates/
│           ├── application.tsx # 지원 이메일 템플릿
│           └── welcome.tsx     # 회원가입 환영 메일
```

## Resend 클라이언트 설정
```typescript
// lib/email/resend.ts
import { Resend } from 'resend';

export const resend = new Resend(process.env.RESEND_API_KEY);

export const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'noreply@auditionpass.co.kr';
```

## 지원 이메일 템플릿
```tsx
// lib/email/templates/application.tsx
import * as React from 'react';

interface ApplicationEmailProps {
  auditionTitle: string;
  applicantName: string;
  applicantAge: number;
  applicantGender: string;
  applicantHeight?: number;
  applicantWeight?: number;
  applicantBio?: string;
  instagramUrl?: string;
  youtubeUrl?: string;
  otherUrl?: string;
  photoUrls: string[];
}

export function ApplicationEmail({
  auditionTitle,
  applicantName,
  applicantAge,
  applicantGender,
  applicantHeight,
  applicantWeight,
  applicantBio,
  instagramUrl,
  youtubeUrl,
  otherUrl,
  photoUrls,
}: ApplicationEmailProps) {
  return (
    <html>
      <body style={{ fontFamily: 'Arial, sans-serif', maxWidth: '600px', margin: '0 auto', padding: '20px' }}>
        <h2 style={{ color: '#6366F1' }}>[오디션 지원] {applicantName}</h2>
        <p>안녕하세요, <strong>{auditionTitle}</strong> 오디션에 지원합니다.</p>

        <hr />

        <h3>지원자 정보</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tr><td style={{ padding: '8px', fontWeight: 'bold' }}>이름</td><td>{applicantName}</td></tr>
          <tr><td style={{ padding: '8px', fontWeight: 'bold' }}>나이</td><td>{applicantAge}세</td></tr>
          <tr><td style={{ padding: '8px', fontWeight: 'bold' }}>성별</td><td>{applicantGender}</td></tr>
          {applicantHeight && <tr><td style={{ padding: '8px', fontWeight: 'bold' }}>키</td><td>{applicantHeight}cm</td></tr>}
          {applicantWeight && <tr><td style={{ padding: '8px', fontWeight: 'bold' }}>몸무게</td><td>{applicantWeight}kg</td></tr>}
        </table>

        {applicantBio && (
          <>
            <h3>한 줄 소개</h3>
            <p>{applicantBio}</p>
          </>
        )}

        <h3>포트폴리오</h3>
        <ul>
          {instagramUrl && <li><a href={instagramUrl}>인스타그램: {instagramUrl}</a></li>}
          {youtubeUrl && <li><a href={youtubeUrl}>유튜브: {youtubeUrl}</a></li>}
          {otherUrl && <li><a href={otherUrl}>기타: {otherUrl}</a></li>}
        </ul>

        {photoUrls.length > 0 && (
          <>
            <h3>프로필 사진</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {photoUrls.map((url, i) => (
                <a key={i} href={url}>
                  <img src={url} alt={`프로필 ${i + 1}`} style={{ width: '150px', height: '200px', objectFit: 'cover' }} />
                </a>
              ))}
            </div>
          </>
        )}

        <hr />
        <p style={{ color: '#9CA3AF', fontSize: '12px' }}>
          본 메일은 오디션패스(AuditionPass)를 통해 자동 발송되었습니다.<br />
          문의: support@auditionpass.co.kr
        </p>
      </body>
    </html>
  );
}
```

## 발송 함수
```typescript
// lib/email/sendApplicationEmail.ts
import { resend, FROM_EMAIL } from './resend';
import { ApplicationEmail } from './templates/application';

interface SendApplicationEmailParams {
  audition: {
    title: string;
    apply_email: string;
    company?: string;
  };
  profile: {
    name: string;
    age: number;
    gender: string;
    height?: number;
    weight?: number;
    bio?: string;
    instagram_url?: string;
    youtube_url?: string;
    other_url?: string;
    photo_urls: string[];
  };
}

export async function sendApplicationEmail({ audition, profile }: SendApplicationEmailParams) {
  const { data, error } = await resend.emails.send({
    from: `오디션패스 <${FROM_EMAIL}>`,
    to: audition.apply_email,
    subject: `[오디션 지원] ${profile.name} / ${profile.gender} / ${profile.age}세`,
    react: ApplicationEmail({
      auditionTitle: audition.title,
      applicantName: profile.name,
      applicantAge: profile.age,
      applicantGender: profile.gender,
      applicantHeight: profile.height,
      applicantWeight: profile.weight,
      applicantBio: profile.bio,
      instagramUrl: profile.instagram_url,
      youtubeUrl: profile.youtube_url,
      otherUrl: profile.other_url,
      photoUrls: profile.photo_urls,
    }),
  });

  if (error) {
    throw new Error(`이메일 발송 실패: ${error.message}`);
  }

  return data;
}
```

## 발송 도메인 인증 (스팸 방지)
Resend 대시보드에서 반드시 설정:
1. 발송 도메인 추가: `auditionpass.co.kr`
2. DNS 레코드 설정 (SPF, DKIM, DMARC)
3. 인증 완료 후 발송 시작

## 작업 지시 예시
```
email/CLAUDE.md를 참조해서:
1. 지원 이메일 템플릿을 구현해줘
2. sendApplicationEmail 함수를 /api/apply 라우트에 연결해줘
```
