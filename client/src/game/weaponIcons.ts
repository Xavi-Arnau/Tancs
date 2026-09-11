import { Shell } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import BasicShellIcon from "./icons/BasicShellIcon";
import BouncingBettyIcon from "./icons/BouncingBettyIcon";
import ClusterBombIcon from "./icons/ClusterBombIcon";
import HeavyShellIcon from "./icons/HeavyShellIcon";
import LoveIsPainIcon from "./icons/LoveIsPainIcon";
import MagmaStrikeIcon from "./icons/MagmaStrikeIcon";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

const WEAPON_ICONS: Record<string, IconComponent> = {
  shell: BasicShellIcon,
  bomb: HeavyShellIcon,
  cluster: ClusterBombIcon,
  heart: LoveIsPainIcon,
  magma: MagmaStrikeIcon,
  bounce: BouncingBettyIcon,
};

export function getWeaponIcon(icon: string): IconComponent {
  return WEAPON_ICONS[icon] ?? Shell;
}
