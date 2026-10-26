import { NextResponse } from "next/server";

import { MICROTEST_ITEMS, scoreQuiz } from "@/lib/matching";
import { recomputeAllMatches } from "@/lib/matching/recompute.server";
import { generateWelcomeMessage } from "@/lib/notification-copy";
import { generateProfileIdentity } from "@/lib/profile-generator";
import { createPreflightHandler, withApiSecurity } from "@/lib/security/api.server";
import { createAdminClient } from "@/lib/supabase/admin.server";
import { createClient } from "@/lib/supabase/server";
import { parseJsonBody } from "@/lib/validation/common";
import { quizSubmissionSchema } from "@/lib/validation/quiz";
import type { QuizSubmission } from "@/types/microtest";

export const runtime = "nodejs";
export const maxDuration = 60;

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
  const userId = userData.user.id;

  let scored;
  try {
    scored = scoreQuiz(parsed.data as QuizSubmission, MICROTEST_ITEMS);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const identity = generateProfileIdentity(scored.normalizedScores, userId);

  // Detect a first-time submission before the profile is upserted. Entry creates
  // the row with a null `quiz_completed_at`, so row presence is not enough.
  const { data: existingProfile } = await admin
    .from("profiles_v2")
    .select("quiz_completed_at")
    .eq("user_id", userId)
    .maybeSingle();
  const isFirstSubmission = !existingProfile?.quiz_completed_at;

  // Flatten likert + filter answers into the single JSON array the RPC expects.
  const answersPayload = [
    ...parsed.data.likert.map((answer) => ({ itemId: answer.itemId, value: answer.value })),
    ...parsed.data.filters.map((answer) => ({ itemId: answer.itemId, selected: answer.selected })),
  ];

  const { error: submissionError } = await admin.rpc("submit_quiz_result_v2", {
    p_user_id: userId,
    p_answers: answersPayload,
    p_dimension_scores: scored.normalizedScores,
    p_romance_vector: scored.romanceVector,
    p_amistad_vector: scored.friendshipVector,
    p_mbti_code: scored.mbtiCode,
    p_hard_filters: scored.hardFilters,
    p_animal_id: identity.animalId,
    p_color_id: identity.colorId,
    p_narrative: identity.narrative,
    p_alias: identity.alias,
  });

  if (submissionError) {
    return NextResponse.json({ error: "Unable to save result" }, { status: 503 });
  }

  let pairs: Awaited<ReturnType<typeof recomputeAllMatches>> = [];
  let recomputePending = false;
  try {
    pairs = await recomputeAllMatches(admin);
  } catch {
    // The quiz result is already persisted. Match recomputation is a global,
    // best-effort step: a concurrent submission can invalidate the expected
    // profile count. The user still gets their result and the next recompute
    // (another submission or the admin button) will publish the matches.
    recomputePending = true;
  }

  if (!recomputePending) {
    // Notifications are cosmetic and must never turn a persisted result into a
    // 5xx response.
    try {
      const { error: notifyError } = await admin.rpc("notify_matches_v2", {
        p_user_id: userId,
      });
      if (!notifyError) {
        const pairedUsers = new Set<string>();
        for (const pair of pairs) {
          if (pair.userA === userId.toLowerCase()) pairedUsers.add(pair.userB);
          else if (pair.userB === userId.toLowerCase()) pairedUsers.add(pair.userA);
        }
        await Promise.all(
          [...pairedUsers]
            .filter((pairedUserId) => pairedUserId !== userId.toLowerCase())
            .map(async (pairedUserId) => {
              try {
                await admin.rpc("notify_matches_v2", { p_user_id: pairedUserId });
              } catch {
                // Counterpart notifications are best-effort.
              }
            }),
        );
      }
    } catch {
      // Notification failures are non-critical.
    }
  }

  // Best-effort welcome notification for first-time submissions. Inserted after
  // notify_matches_v2 (which clears prior unread notifications) so it persists.
  if (isFirstSubmission) {
    try {
      const welcome = generateWelcomeMessage(identity.animalDiminutivo, identity.colorNombre);
      await admin.from("notifications").insert({
        user_id: userId,
        type: "welcome",
        title: welcome.title,
        body: welcome.body,
        metadata: { animal: identity.animalId, color: identity.colorId },
      });
    } catch {
      // Welcome copy is nice-to-have, never a submission blocker.
    }
  }

  return NextResponse.json(
    {
      ok: true,
      recomputePending,
      profile: {
        alias: identity.alias,
        animal: identity.animalId,
        color: identity.colorId,
        narrative: identity.narrative,
      },
    },
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
