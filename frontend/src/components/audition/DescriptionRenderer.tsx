import type { ReactNode } from "react";

interface DescriptionRendererProps {
  text: string;
}

/** 섹션 키워드 — 이 단어로 시작하는 줄은 자동 볼드 처리 */
const SECTION_KEYWORDS = [
  "모집분야", "모집 분야", "지원자격", "지원 자격", "지원방법", "지원 방법",
  "일정", "촬영일정", "촬영 일정", "오디션일정", "오디션 일정",
  "페이", "출연료", "보수", "급여", "개런티",
  "마감", "마감일", "접수기간", "접수 기간", "모집기간", "모집 기간",
  "작품명", "작품 소개", "프로젝트", "제목",
  "촬영장소", "촬영 장소", "촬영지", "장소",
  "담당자", "연락처", "문의",
];

/** 줄이 섹션 키워드로 시작하는지 확인 */
function startsWithKeyword(text: string): boolean {
  return SECTION_KEYWORDS.some((kw) => text.startsWith(kw));
}

/** 인라인 마크다운(*~***bold*~***, 이메일)을 ReactNode 배열로 변환 */
function parseInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // *1~3개로 감싼 텍스트 + 이메일을 한 번에 매칭
  const regex = /\*{1,3}([^*]+)\*{1,3}|([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    if (match[1] !== undefined) {
      nodes.push(
        <strong key={match.index} className="font-bold text-gray-900">
          {match[1]}
        </strong>
      );
    } else if (match[2] !== undefined) {
      nodes.push(
        <a
          key={match.index}
          href={`mailto:${match[2]}`}
          className="text-primary underline underline-offset-2 hover:text-primary-hover"
        >
          {match[2]}
        </a>
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

export function DescriptionRenderer({ text }: DescriptionRendererProps) {
  const lines = text.split("\n");
  const elements: ReactNode[] = [];
  let bulletBuffer: string[] = [];
  let key = 0;

  function flushBullets() {
    if (bulletBuffer.length === 0) return;
    elements.push(
      <ul key={key++} className="space-y-1 pl-1">
        {bulletBuffer.map((item, i) => (
          <li key={i} className="flex gap-2">
            <span className="shrink-0 text-primary/60">·</span>
            <span>{parseInline(item)}</span>
          </li>
        ))}
      </ul>
    );
    bulletBuffer = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();

    // 빈 줄 → 단락 구분
    if (!trimmed) {
      flushBullets();
      elements.push(<div key={key++} className="h-3" />);
      continue;
    }

    // # 헤딩
    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      flushBullets();
      const level = headingMatch[1].length;
      const content = parseInline(headingMatch[2]);
      if (level === 1) {
        elements.push(
          <h3 key={key++} className="text-[15px] font-bold text-gray-900 mt-1">
            {content}
          </h3>
        );
      } else {
        elements.push(
          <h4 key={key++} className="text-[14px] font-bold text-gray-800 mt-1">
            {content}
          </h4>
        );
      }
      continue;
    }

    // 불릿 라인 (•, -, *, ·, ▸, ▹, ►) — 선행 기호 제거
    const bulletMatch = trimmed.match(/^[•\-·▸▹►]\s*(.*)$/);
    if (bulletMatch) {
      bulletBuffer.push(bulletMatch[1]);
      continue;
    }
    // * 로 시작하지만 볼드 마크다운이 아닌 경우 (예: "* 항목") → 불릿 처리
    const starBulletMatch = trimmed.match(/^\*{1,3}\s+(.+)$/);
    if (starBulletMatch) {
      bulletBuffer.push(starBulletMatch[1]);
      continue;
    }

    // 일반 텍스트
    flushBullets();

    // 콜론(:)으로 끝나는 줄 → 섹션 제목으로 볼드 처리
    if (trimmed.endsWith(":") || trimmed.endsWith(": ")) {
      const label = trimmed.replace(/:\s*$/, "");
      elements.push(
        <p key={key++}>
          <strong className="font-bold text-gray-900">{label}</strong>
        </p>
      );
      continue;
    }

    // 섹션 키워드로 시작하는 줄 → 키워드 부분만 볼드
    if (startsWithKeyword(trimmed)) {
      const kwMatch = SECTION_KEYWORDS.find((kw) => trimmed.startsWith(kw));
      if (kwMatch) {
        const rest = trimmed.slice(kwMatch.length);
        // "키워드: 값" 또는 "키워드 - 값" 패턴
        const sepMatch = rest.match(/^(\s*[::\-–—]\s*)(.*)/);
        if (sepMatch) {
          elements.push(
            <p key={key++}>
              <strong className="font-bold text-gray-900">{kwMatch}</strong>
              {sepMatch[1]}
              {parseInline(sepMatch[2])}
            </p>
          );
        } else {
          elements.push(
            <p key={key++}>
              <strong className="font-bold text-gray-900">{kwMatch}</strong>
              {parseInline(rest)}
            </p>
          );
        }
        continue;
      }
    }

    elements.push(
      <p key={key++}>{parseInline(trimmed)}</p>
    );
  }

  flushBullets();

  return (
    <div className="text-[14px] text-gray-600 leading-[1.8] space-y-0.5">
      {elements}
    </div>
  );
}
