import type { Metadata } from "next";

import { isQuizPicanteEnabled } from "@/infrastructure/env/env";
import { QuizzesView } from "@/ui/quiz/quizzes-view";

export const metadata: Metadata = { title: "Quizzes | ZooMatch" };

export default function QuizzesPage() {
  const picanteEnabled = isQuizPicanteEnabled();
  return <QuizzesView picanteEnabled={picanteEnabled} />;
}
