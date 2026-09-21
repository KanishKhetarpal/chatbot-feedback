/**
 * The icon vocabulary bots may use — `[shield]` at the start of a bullet, or
 * `"icon":"shield"` on a card row or form. Mirrors ICON_NAMES in the backend's
 * ui-block.util.ts. Unknown names render nothing.
 */

import {
  Award,
  BedDouble,
  BookOpen,
  Briefcase,
  Building2,
  Bus,
  CalendarDays,
  Check,
  Clock,
  FileText,
  FlaskConical,
  GraduationCap,
  Heart,
  House,
  IndianRupee,
  Info,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  ShieldCheck,
  Star,
  Target,
  Trophy,
  Users,
  UtensilsCrossed,
  Video,
  Wifi,
  type LucideIcon,
} from "lucide-react";

export const WIDGET_ICONS: Record<string, LucideIcon> = {
  home: House,
  bed: BedDouble,
  food: UtensilsCrossed,
  shield: ShieldCheck,
  wifi: Wifi,
  bus: Bus,
  book: BookOpen,
  flask: FlaskConical,
  briefcase: Briefcase,
  trophy: Trophy,
  users: Users,
  graduation: GraduationCap,
  rupee: IndianRupee,
  calendar: CalendarDays,
  clock: Clock,
  phone: Phone,
  video: Video,
  map: MapPin,
  check: Check,
  star: Star,
  file: FileText,
  heart: Heart,
  info: Info,
  building: Building2,
  award: Award,
  target: Target,
  mail: Mail,
  whatsapp: MessageCircle,
};

export function iconFor(name: string | undefined | null): LucideIcon | null {
  return name ? (WIDGET_ICONS[name.toLowerCase()] ?? null) : null;
}
