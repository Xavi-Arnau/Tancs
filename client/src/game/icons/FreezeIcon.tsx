import type { SVGProps } from "react";

export default function FreezeIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M12 3v18M4.5 7.5l15 9M19.5 7.5l-15 9" />
      <path d="M12 3l-2 2M12 3l2 2M12 21l-2-2M12 21l2-2" strokeWidth={1.4} />
      <path d="M4.5 7.5l2.7.5M4.5 7.5l1-2.6M19.5 7.5l-2.7.5M19.5 7.5l-1-2.6" strokeWidth={1.4} />
      <path d="M19.5 16.5l-2.7-.5M19.5 16.5l-1 2.6M4.5 16.5l2.7-.5M4.5 16.5l1 2.6" strokeWidth={1.4} />
    </svg>
  );
}
