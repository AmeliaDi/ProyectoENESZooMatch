"use client";

/**
 * Skeleton loaders for perceived performance. Pixel-art styled pulsing blocks
 * that match the layout of the content they replace. CSS-only animation,
 * respects prefers-reduced-motion.
 */

import type { CSSProperties } from "react";

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  className?: string;
  style?: CSSProperties;
}

export function Skeleton({ width, height, className = "", style }: SkeletonProps) {
  return (
    <div
      className={`zm-skeleton ${className}`}
      style={{ width, height, ...style }}
      aria-hidden="true"
    />
  );
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="zm-skeleton-card" aria-hidden="true">
      <Skeleton width="100%" height="60%" />
      <div className="zm-skeleton-card__lines">
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton
            key={i}
            width={i === lines - 1 ? "60%" : "100%"}
            height="0.75rem"
          />
        ))}
      </div>
    </div>
  );
}

export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div className="zm-skeleton-list" aria-hidden="true" role="status">
      <span className="sr-only">Cargando...</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="zm-skeleton-list__row">
          <Skeleton width="2.5rem" height="2.5rem" style={{ borderRadius: 0 }} />
          <div className="zm-skeleton-list__text">
            <Skeleton width="70%" height="0.875rem" />
            <Skeleton width="40%" height="0.75rem" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonProfile() {
  return (
    <div className="zm-skeleton-profile" aria-hidden="true">
      <Skeleton width="6rem" height="6rem" />
      <Skeleton width="60%" height="1.25rem" />
      <Skeleton width="40%" height="1rem" />
    </div>
  );
}
