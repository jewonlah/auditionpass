import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-6 text-center text-foreground">
      <div className="mx-auto w-full max-w-sm">
        <Compass
          className="mx-auto size-10 text-gray-400"
          strokeWidth={1.5}
          aria-hidden
        />
        <p className="mt-5 text-[13px] font-semibold tracking-[0.08em] text-gray-400">
          404
        </p>
        <h1 className="mt-2 text-[20px] font-bold text-foreground">
          페이지를 찾을 수 없어요
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-gray-600">
          주소가 바뀌었거나 삭제된 페이지예요. 홈에서 다시 찾아보세요.
        </p>
        <Link href="/" className="mt-8 block">
          <Button variant="primary" size="lg" className="w-full">
            홈으로 가기
          </Button>
        </Link>
      </div>
    </main>
  );
}
