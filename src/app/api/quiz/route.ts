import { NextResponse } from "next/server";

import { scoreMicrotest, type QuizAnswer } from "@/lib/matching";
import { getMatchingThreshold } from "@/lib/matching-config";
import { createPreflightHandler, withApiSecurity } from "@/lib/security/api.server";
import { createAdminClient } from "@/lib/supabase/admin.server";
import { createClient } from "@/lib/supabase/server";
import { parseJsonBody, quizSubmissionSchema } from "@/lib/validation";

export const runtime = "nodejs";

async function handlePost(request: Request) {
  const parsed = quizSubmissionSchema.safeParse(await parseJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const sessionClient = await createClient();
  const admin = createAdminClient();
  if (!sessionClient || !admin) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { data: userData, error: userError } = await sessionClient.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let scored;
  try {
    scored = scoreMicrotest(parsed.data.answers as QuizAnswer[]);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { error: submissionError } = await admin.rpc("submit_quiz_result", {
    p_user_id: userData.user.id,
    p_answers: parsed.data.answers,
    p_scores: scored.normalizedScores,
    p_matching_vector: scored.matchingVector,
    p_mbti_code: scored.mbtiCode,
  });

  if (submissionError) {
    return NextResponse.json({ error: "Unable to save result" }, { status: 503 });
  }

  const { error: matchError } = await admin.rpc("refresh_matches", {
    p_user_id: userData.user.id,
    p_threshold: getMatchingThreshold(),
  });

  if (matchError) {
    return NextResponse.json({ error: "Unable to save result" }, { status: 503 });
  }

  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}

const methods = ["POST"] as const;

export const POST = withApiSecurity(handlePost, {
  name: "quiz-submission",
  limit: 8,
  windowSeconds: 60,
  methods,
});
export const OPTIONS = createPreflightHandler(methods);
