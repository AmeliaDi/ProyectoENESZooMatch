import type { Metadata } from "next";

import { NotificationProvider } from "@/ui/shared/notification-provider";
import { PublicResultView } from "@/ui/result/result-view";

export const metadata: Metadata = { title: "Resultado | ZooMatch" };

export default function ResultadoPage() {
  return (
    <NotificationProvider>
      <PublicResultView />
    </NotificationProvider>
  );
}
