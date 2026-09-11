import type { SVGProps } from "react";

export default function HeavyShellIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M12 3c3.5 0 6 2.7 6 6.5V16H6V9.5C6 5.7 8.5 3 12 3Z" />
      <path d="M6 16 4 21l3.5-2 4.5 3 4.5-3 3.5 2-2-5" />
      <line x1="6" y1="11" x2="18" y2="11" />
    </svg>
  );
}
