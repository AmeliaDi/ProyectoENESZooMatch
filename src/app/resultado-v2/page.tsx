import type { Metadata } from "next";
import { PublicResultViewV2 } from "@/components/public-experience-v2";

export const metadata: Metadata = { title: "Resultado v2 | ZooMatch" };

export default function ResultadoV2Page() {
  return <PublicResultViewV2 />;
}
