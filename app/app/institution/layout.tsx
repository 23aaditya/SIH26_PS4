import { AppShell } from "@/components/layout/AppShell";

export default function InstitutionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
