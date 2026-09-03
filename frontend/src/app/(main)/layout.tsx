import { Header } from "@/components/layout/Header";
import { BottomNav } from "@/components/layout/BottomNav";
import { ToastProvider } from "@/components/ui/Toast";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <div className="mx-auto w-full max-w-md min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 px-4 py-4 pb-20">{children}</main>
        <BottomNav />
      </div>
    </ToastProvider>
  );
}
