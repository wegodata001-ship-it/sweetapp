"use client";

import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
};

/**
 * Responsive card grid: 2 columns on mobile, 3–4 on desktop.
 */
export function MobileTaskGrid({ children, className = "" }: Props) {
  return (
    <ul
      className={`grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-4 ${className}`}
    >
      {children}
    </ul>
  );
}
