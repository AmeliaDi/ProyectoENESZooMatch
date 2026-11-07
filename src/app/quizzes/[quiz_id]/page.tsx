import type { Metadata } from "next";

import { QuizFlowView } from "@/ui/quiz/quiz-flow-view";

export const metadata: Metadata = { title: "Quiz | ZooMatch" };

interface Props {
  params: Promise<{ quiz_id: string }>;
  searchParams: Promise<{ consent?: string }>;
}

export default async function QuizFlowPage({ params, searchParams }: Props) {
  const { quiz_id } = await params;
  const { consent } = await searchParams;
  return <QuizFlowView quizId={quiz_id} requireConsent={consent === "1"} />;
}
