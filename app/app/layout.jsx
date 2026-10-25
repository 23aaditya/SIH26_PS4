import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/providers/AuthProvider";
const inter = Inter({
    variable: "--font-inter",
    subsets: ["latin"],
});
export const metadata = {
    title: "AICTE Approval Workflow System",
    description: "Integrated AICTE Approval Workflow Automation, Compliance Monitoring and Alert Management System",
};
export default function RootLayout({ children, }) {
    return (<html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>);
}
