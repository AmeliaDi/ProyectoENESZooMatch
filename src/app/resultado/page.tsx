import type { Metadata } from "next";

import { NotificationProvider } from "@/components/notification-provider";
import { PublicResultView } from "@/components/public-experience";

export const metadata: Metadata = { title: "Resultado | ZooMatch" };

export default function ResultadoPage() {
  return (
    <NotificationProvider>
      <PublicResultView />
    </NotificationProvider>
  );
}
