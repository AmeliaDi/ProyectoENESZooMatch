import { z } from "zod";

import { QUIZ_ITEM_IDS, type QuizItemId } from "@/types/microtest";

export function normalizeMatricula(value: string): string {
  return value.normalize("NFKC").trim().toUpperCase().replace(/[\s_-]+/g, "");
}

export const matriculaSchema = z
  .string()
  .min(1)
  .max(64)
  .transform(normalizeMatricula)
  .pipe(z.string().regex(/^[A-Z0-9]{4,32}$/));

export const availabilityRequestSchema = z.object({
  matricula: matriculaSchema,
});

const likertSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
const expectedItemIds = new Set<string>(QUIZ_ITEM_IDS);

export const quizSubmissionSchema = z
  .object({
    answers: z
      .array(
        z.object({
          itemId: z.string().min(1).max(16),
          value: likertSchema,
        }),
      )
      .length(QUIZ_ITEM_IDS.length),
  })
  .superRefine(({ answers }, context) => {
    const submittedIds = new Set(answers.map(({ itemId }) => itemId));
    if (
      submittedIds.size !== expectedItemIds.size ||
      [...submittedIds].some((itemId) => !expectedItemIds.has(itemId))
    ) {
      context.addIssue({ code: "custom", message: "Invalid quiz answers" });
    }
  });

export type QuizSubmission = {
  answers: Array<{
    itemId: QuizItemId;
    value: 1 | 2 | 3 | 4;
  }>;
};

export async function parseJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
