import { Plane, Shell } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import BalloonIcon from "./icons/BalloonIcon";
import BasicShellIcon from "./icons/BasicShellIcon";
import BouncingBettyIcon from "./icons/BouncingBettyIcon";
import ClusterBombIcon from "./icons/ClusterBombIcon";
import FreezeIcon from "./icons/FreezeIcon";
import HeavyShellIcon from "./icons/HeavyShellIcon";
import LoveIsPainIcon from "./icons/LoveIsPainIcon";
import MagmaStrikeIcon from "./icons/MagmaStrikeIcon";
import RepairIcon from "./icons/RepairIcon";
import ShieldIcon from "./icons/ShieldIcon";
import VatOfAcidIcon from "./icons/VatOfAcidIcon";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

const WEAPON_ICONS: Record<string, IconComponent> = {
  shell: BasicShellIcon,
  bomb: HeavyShellIcon,
  cluster: ClusterBombIcon,
  heart: LoveIsPainIcon,
  magma: MagmaStrikeIcon,
  bounce: BouncingBettyIcon,
  repair: RepairIcon,
  shield: ShieldIcon,
  freeze: FreezeIcon,
  acid: VatOfAcidIcon,
  airstrike: Plane,
  balloon: BalloonIcon,
};

export function getWeaponIcon(icon: string): IconComponent {
  return WEAPON_ICONS[icon] ?? Shell;
}
