"use client";

import { ErrorView } from "@/ui/shared/lost-view";

export default function Error({ retry }: { error: unknown; retry: () => void }) {
  return <ErrorView onRetry={retry} />;
}
