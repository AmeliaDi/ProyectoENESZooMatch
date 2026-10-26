import type { Metadata } from "next";

import { NotificationProvider } from "@/components/notification-provider";
import { PublicResultViewV2 } from "@/components/public-experience-v2";

export const metadata: Metadata = { title: "Resultado v2 | ZooMatch" };

export default function ResultadoV2Page() {
  return (
    <NotificationProvider>
      <PublicResultViewV2 />
    </NotificationProvider>
  );
}
