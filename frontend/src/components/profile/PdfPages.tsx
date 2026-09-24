"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask } from "pdfjs-dist";

export function PdfPages({ url, onReady }: { url: string; onReady?: () => void }) {
  const container = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("PDF 페이지를 불러오는 중…");
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const host = container.current!;
    let cancelled = false;
    let task: PDFDocumentLoadingTask | undefined;
    async function render() {
      try {
        const pdfjs = await import("pdfjs-dist");
        if (cancelled) return;
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        task = pdfjs.getDocument({ url });
        const pdf = await task.promise;
        for (let number = 1; number <= pdf.numPages; number++) {
          if (cancelled) return;
          const page = await pdf.getPage(number);
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          canvas.className = "h-auto w-full rounded-lg bg-white";
          canvas.setAttribute("aria-hidden", "true");
          await page.render({ canvas, viewport }).promise;
          const content = await page.getTextContent();
          if (cancelled) return;
          const figure = document.createElement("figure");
          const caption = document.createElement("figcaption");
          caption.className = "mt-2 text-center text-sm text-gray-600";
          caption.textContent = `${number} / ${pdf.numPages} 페이지`;
          const text = document.createElement("p");
          text.className = "sr-only";
          text.textContent = content.items.map((item) => "str" in item ? item.str : "").join(" ");
          figure.append(canvas, caption, text);
          host.append(figure);
          page.cleanup();
        }
        if (!cancelled) { setStatus(`PDF ${pdf.numPages}페이지를 표시했어요.`); onReady?.(); }
      } catch {
        if (!cancelled) {
          setFailed(true);
          setStatus("페이지를 표시하지 못했어요. 다시 시도하거나 PDF 크게 보기를 이용해 주세요.");
        }
      }
    }
    void render();
    return () => {
      cancelled = true;
      void task?.destroy();
      host.replaceChildren();
    };
  }, [url, attempt, onReady]);

  return <div className="space-y-3">
    <p role="status" className="text-sm leading-relaxed text-gray-600">{status}</p>
    {failed && <button type="button" className="min-h-11 rounded-lg border border-primary px-4 font-semibold text-primary" onClick={() => {
      setFailed(false); setStatus("PDF 페이지를 불러오는 중…"); setAttempt((value) => value + 1);
    }}>페이지 다시 불러오기</button>}
    <div ref={container} className="space-y-5" aria-label="제출 PDF 페이지" />
  </div>;
}
