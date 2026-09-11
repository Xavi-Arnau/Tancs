import type { SVGProps } from "react";

export default function MagmaStrikeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M3 13c2.5 4.5 6 6.5 9 6.5s6.5-2 9-6.5" />
      <path d="M7.5 12c1 1 1 2.2 0 3.3M12 11c1 1 1 2.2 0 3.3M16.5 12c1 1 1 2.2 0 3.3" strokeWidth={1.4} />
      <circle cx="9.5" cy="16.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="16.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}
