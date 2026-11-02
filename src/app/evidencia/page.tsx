import type { Metadata } from "next";

import { EvidenceView } from "@/ui/evidence/evidence-view";

export const metadata: Metadata = { title: "Qué sabemos y qué no | ZooMatch" };

export default function EvidenciaPage() {
  return <EvidenceView />;
}
