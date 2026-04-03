import type { ReactNode } from "react";

interface DescriptionRendererProps {
  text: string;
}

/** 인라인 마크다운(**bold**, 이메일)을 ReactNode 배열로 변환 */
function parseInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // **bold** 와 이메일을 한 번에 매칭
  const regex = /\*\*(.+?)\*\*|([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    if (match[1] !== undefined) {
      // **bold**
      nodes.push(
        <strong key={match.index} className="font-bold text-gray-900">
          {match[1]}
        </strong>
      );
    } else if (match[2] !== undefined) {
      // email
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

    // 불릿 라인 (•, -, *, ·, ▸, ▹, ►)
    const bulletMatch = trimmed.match(/^[•\-\*·▸▹►]\s*(.*)$/);
    if (bulletMatch) {
      bulletBuffer.push(bulletMatch[1]);
      continue;
    }

    // 일반 텍스트
    flushBullets();
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
