import type { SVGProps } from "react";

export default function BalloonIcon(props: SVGProps<SVGSVGElement>) {
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
      <ellipse cx="12" cy="9" rx="5" ry="6" />
      <path d="M8.5 13.5L9 17M15.5 13.5L15 17" />
      <rect x="9" y="17" width="6" height="3" rx="0.5" />
    </svg>
  );
}
