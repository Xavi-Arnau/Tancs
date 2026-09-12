import type { SVGProps } from "react";

export default function ShieldIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M12 3.5 5 6.5v5c0 5 3 7.7 7 9 4-1.3 7-4 7-9v-5L12 3.5Z" />
      <path d="M9 12.2 11 14.3 15.2 10" strokeWidth={1.6} />
    </svg>
  );
}
