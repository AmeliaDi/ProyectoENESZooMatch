import type { Metadata } from "next";

import { PublicQuiz } from "@/components/public-experience";

export const metadata: Metadata = {
  title: "Microtest | ZooMatch",
};

export default function QuizPage() {
  return <PublicQuiz />;
}
