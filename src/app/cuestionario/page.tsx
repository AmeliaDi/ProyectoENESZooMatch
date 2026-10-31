import type { Metadata } from "next";
import { PublicQuiz } from "@/ui/quiz/public-quiz";

export const metadata: Metadata = { title: "Microtest | ZooMatch" };

export default function CuestionarioPage() {
  return <PublicQuiz />;
}
