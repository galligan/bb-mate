import type { IconSvgElement } from "@hugeicons/react";
import { HugeiconsIcon } from "@hugeicons/react";

interface BbIconProps {
  icon: IconSvgElement;
  size?: number;
}

export function BbIcon({ icon, size = 16 }: BbIconProps) {
  return (
    <HugeiconsIcon
      aria-hidden="true"
      color="currentColor"
      icon={icon}
      size={size}
      strokeWidth={1.5}
    />
  );
}
