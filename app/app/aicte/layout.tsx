import { AppShell } from "@/components/layout/AppShell";

export default function AicteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
