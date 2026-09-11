import type { SVGProps } from "react";

export default function LoveIsPainIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10Z" />
      <path
        d="M12 15c-1.2-1.5-1.5-2.7-.8-3.8.3.9.9 1 1.3.4-.2-1 .1-1.8.9-2.2-.1 1 .3 1.6.9 1.9.5.8.3 2-.4 2.8-.5.6-1.2.9-1.9.9Z"
        strokeWidth={1.3}
      />
    </svg>
  );
}
