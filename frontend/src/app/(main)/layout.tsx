import { Header } from "@/components/layout/Header";
import { BottomNav } from "@/components/layout/BottomNav";
import { ToastProvider } from "@/components/ui/Toast";
import { BookmarksProvider } from "@/components/audition/Bookmarks";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <BookmarksProvider>
      <div className="app-theme h-dvh overflow-hidden">
      <div className="mx-auto flex h-full w-full max-w-md flex-col">
        <a href="#app-content" className="sr-only focus:not-sr-only focus:p-4">본문으로 이동</a>
        <Header />
        <main id="app-content" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-6 [scroll-padding-block:1.5rem]">{children}</main>
        <BottomNav />
      </div>
      </div>
      </BookmarksProvider>
    </ToastProvider>
  );
}
