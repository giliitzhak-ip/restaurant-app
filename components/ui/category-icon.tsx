import {
  AirVent,
  Bug,
  CircleHelp,
  Hammer,
  KeyRound,
  PaintRoller,
  PanelsTopLeft,
  Ruler,
  Settings,
  Shield,
  Sparkles,
  Square,
  Trees,
  Truck,
  Waves,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Categories are database rows, and each carries an `icon` slug. Mapping those
 * slugs here keeps the bundle small (no dynamic icon loading) while still
 * letting an admin pick from the set when creating a category.
 */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  wrench: Wrench,
  zap: Zap,
  bug: Bug,
  trees: Trees,
  'air-vent': AirVent,
  hammer: Hammer,
  sparkles: Sparkles,
  'key-round': KeyRound,
  truck: Truck,
  'paint-roller': PaintRoller,
  ruler: Ruler,
  'panels-top-left': PanelsTopLeft,
  square: Square,
  shield: Shield,
  waves: Waves,
  settings: Settings,
  'circle-help': CircleHelp,
};

export const ICON_NAMES = Object.keys(CATEGORY_ICONS);

export function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Icon = CATEGORY_ICONS[name] ?? Wrench;
  return <Icon className={cn('size-5', className)} aria-hidden />;
}
