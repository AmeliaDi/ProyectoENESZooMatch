import type { Metadata } from "next";

import { PublicResultView } from "@/ui/result/result-view";
import { NotificationProvider } from "@/ui/shared/notification-provider";

export const metadata: Metadata = { title: "Resultado | ZooMatch" };

export default function ResultadoPage() {
  return (
    <NotificationProvider>
      <PublicResultView />
    </NotificationProvider>
  );
}
