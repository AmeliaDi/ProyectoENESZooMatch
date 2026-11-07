"use client";

/**
 * Quiz icon for the global nav. Shows a pixel question mark icon
 * linking to the quizzes hub page.
 */
import Link from "next/link";

import { Icon } from "@/ui/kit/icon";

export function QuizIcon() {
  return (
    <Link
      href="/quizzes"
      className="zm-box zm-btn zm-btn--ghost zm-btn--icon"
      aria-label="Quizzes rompehielos"
    >
      <Icon name="quiz" />
    </Link>
  );
}
