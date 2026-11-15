import type { Metadata } from "next";
import "./globals.css";

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
      <body className="antialiased">{children}</body>
    </html>
  );
}
