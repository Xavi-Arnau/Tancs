import type { SVGProps } from "react";

export default function BouncingBettyIcon(props: SVGProps<SVGSVGElement>) {
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
      <circle cx="18" cy="6" r="3" fill="currentColor" stroke="none" />
      <path d="M2 20c2-6 4-6 6-2s4 4 6-2 4-6 6-2" strokeWidth={1.6} opacity={0.7} />
    </svg>
  );
}
