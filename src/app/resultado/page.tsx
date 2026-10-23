import type { Metadata } from "next";

import { PublicResultView } from "@/components/public-experience";

export const metadata: Metadata = {
  title: "Resultado | ZooMatch",
};

export default function ResultPage() {
  return <PublicResultView />;
}
