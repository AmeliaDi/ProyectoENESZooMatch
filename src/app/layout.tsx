import type { Metadata } from "next";
import type { ReactNode } from "react";

import { NotificationProvider } from "@/components/notification-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "ZooMatch",
  description: "Un microtest anónimo para descubrir afinidades entre estudiantes.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es-MX">
      <body>
        <NotificationProvider>{children}</NotificationProvider>
      </body>
    </html>
  );
}