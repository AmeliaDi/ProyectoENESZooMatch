import type { Metadata } from "next";
import { PublicQuizV2 } from "@/components/public-experience-v2";

export const metadata: Metadata = { title: "Microtest v2 | ZooMatch" };

export default function CuestionarioV2Page() {
  return <PublicQuizV2 />;
}
