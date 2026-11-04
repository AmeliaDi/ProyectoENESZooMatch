import { Button } from "@/ui/kit/button";

import { ADMIN_COPY } from "./admin-copy";

export interface PagerProps {
  page: number;
  pageSize: number;
  total: number;
  onPage(page: number): void;
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export function Pager({ page, pageSize, total, onPage }: PagerProps) {
  const pages = pageCount(total, pageSize);
  return (
    <nav className="zm-admin__pager" aria-label="Paginación">
      <Button variant="ghost" icon="back" disabled={page <= 0} onClick={() => onPage(page - 1)}>
        {ADMIN_COPY.prev}
      </Button>
      <span className="zm-num" aria-live="polite">
        {page + 1} / {pages} · {total}
      </span>
      <Button variant="ghost" iconAfter="next" disabled={page + 1 >= pages} onClick={() => onPage(page + 1)}>
        {ADMIN_COPY.next}
      </Button>
    </nav>
  );
}
