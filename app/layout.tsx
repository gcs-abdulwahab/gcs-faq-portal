import type { Metadata } from "next";
import "./globals.css";
import { DialogProvider } from "@/components/Dialog";

export const metadata: Metadata = {
  title: "GCS Student FAQs Portal",
  description: "Collaborative FAQ repository for Registrar, Controller of Examinations, Scholarships, and more.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <DialogProvider>{children}</DialogProvider>
      </body>
    </html>
  );
}
