import type { SVGProps } from "react";

export default function ClusterBombIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M12 12 5 6M12 12l7-6M12 12 5 18m7-6 7 6" strokeWidth={1.2} opacity={0.6} />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" />
      <circle cx="5" cy="6" r="1.6" fill="currentColor" />
      <circle cx="19" cy="6" r="1.6" fill="currentColor" />
      <circle cx="5" cy="18" r="1.6" fill="currentColor" />
      <circle cx="19" cy="18" r="1.6" fill="currentColor" />
    </svg>
  );
}
