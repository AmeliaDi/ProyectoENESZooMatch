import type { Result } from "@/domain/shared";

import type { NotificationDto } from "./dto";
import type { AppError } from "./errors";
import type { NotificationRepository } from "./ports";

export function listNotifications(
  includeRead: boolean,
  repo: Pick<NotificationRepository, "listMine">,
): Promise<Result<NotificationDto[], AppError>> {
  return repo.listMine(!includeRead);
}

export function markNotificationsRead(
  ids: readonly string[],
  repo: Pick<NotificationRepository, "markRead">,
): Promise<Result<number, AppError>> {
  return repo.markRead(ids);
}
