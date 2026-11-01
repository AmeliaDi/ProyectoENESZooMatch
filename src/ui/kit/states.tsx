import type { ReactNode } from "react";

import { Icon } from "./icon";

export interface StateViewProps {
  title: string;
  body?: string;
  action?: ReactNode;
  /** Optional illustration (e.g. a PixelAnimal); defaults to a lone star. */
  art?: ReactNode;
}

/** Loading = three stars switching on in turn; part of the sky, not a spinner. */
export function LoadingState({ title = "Encendiendo estrellas…", body }: Partial<StateViewProps>) {
  return (
    <div className="zm-state" role="status" aria-live="polite">
      <div className="zm-loading-stars" aria-hidden="true">
        <Icon name="loading" filled />
        <Icon name="loading" filled />
        <Icon name="loading" filled />
      </div>
      <p className="zm-state__title">{title}</p>
      {body ? <p className="zm-state__body">{body}</p> : null}
    </div>
  );
}

export function EmptyState({ title, body, action, art }: StateViewProps) {
  return (
    <div className="zm-state">
      {art ?? <Icon name="loading" scale={3} />}
      <p className="zm-state__title">{title}</p>
      {body ? <p className="zm-state__body">{body}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({ title, body, action, art }: StateViewProps) {
  return (
    <div className="zm-state zm-state--error" role="alert">
      {art ?? <Icon name="alert" scale={3} />}
      <p className="zm-state__title">{title}</p>
      {body ? <p className="zm-state__body">{body}</p> : null}
      {action}
    </div>
  );
}
