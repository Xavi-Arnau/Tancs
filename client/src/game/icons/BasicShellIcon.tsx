import type { SVGProps } from "react";

export default function BasicShellIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M12 2c2 0 3.5 2 3.5 5v8h-7V7c0-3 1.5-5 3.5-5Z" />
      <path d="M8.5 15 6 20l3-2 3 3 3-3 3 2-2.5-5" />
      <line x1="8.5" y1="10.5" x2="15.5" y2="10.5" />
    </svg>
  );
}
