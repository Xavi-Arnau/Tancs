import type { SVGProps } from "react";

export default function VatOfAcidIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M8 3h8M9 3v5.5L4.5 17a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L15 8.5V3" />
      <path d="M6.5 15h11" strokeWidth={1.4} />
      <circle cx="9.5" cy="18" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="13" cy="18.5" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="17.5" r="0.7" fill="currentColor" stroke="none" />
    </svg>
  );
}
