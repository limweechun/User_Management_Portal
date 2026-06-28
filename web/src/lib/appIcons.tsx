import {
  Box, Package, Boxes, Warehouse, Truck, ShoppingCart, ShoppingBag, Store,
  Factory, Wrench, Hammer, HardHat, Gauge, Activity, Cpu, Plug, Zap,
  BatteryCharging, Flame, Droplets, Wind, Sun, Leaf, Recycle, FlaskConical,
  Microscope, Beaker, Users, User, Briefcase, Handshake, Building, Building2,
  FileText, ClipboardList, Receipt, Calculator, Wallet, Banknote, CreditCard,
  BarChart3, PieChart, TrendingUp, Calendar, Clock, Shield, Lock, Key, Settings,
  Database, Server, Cloud, Globe, Mail, Phone, MapPin, Hexagon,
  type LucideIcon,
} from 'lucide-react'

// Curated catalog of app icons offered by the Apps Registry icon picker.
// The stored value stays the kebab-case lucide NAME (back-compatible with the existing
// string column on the App model — no API change). We keep a fixed, statically-imported set
// rather than dynamically importing all ~1k lucide icons, so the bundle stays small.
//
// IMPORTANT: every icon a seeded app already uses MUST stay in this list, or that app's
// launcher tile would silently fall back to the generic Box. The seeds in use today are:
// package · users · building-2 · shopping-cart · boxes · wrench · handshake ·
// flask-conical · factory · zap · building (see iam-service/prisma/bootstrap.ts).
export interface AppIconDef {
  name: string
  label: string
  Icon: LucideIcon
}

export const APP_ICONS: AppIconDef[] = [
  { name: 'box', label: 'Box', Icon: Box },
  { name: 'package', label: 'Package', Icon: Package },
  { name: 'boxes', label: 'Boxes', Icon: Boxes },
  { name: 'warehouse', label: 'Warehouse', Icon: Warehouse },
  { name: 'truck', label: 'Truck', Icon: Truck },
  { name: 'shopping-cart', label: 'Shopping cart', Icon: ShoppingCart },
  { name: 'shopping-bag', label: 'Shopping bag', Icon: ShoppingBag },
  { name: 'store', label: 'Store', Icon: Store },
  { name: 'factory', label: 'Factory', Icon: Factory },
  { name: 'wrench', label: 'Wrench', Icon: Wrench },
  { name: 'hammer', label: 'Hammer', Icon: Hammer },
  { name: 'hard-hat', label: 'Hard hat', Icon: HardHat },
  { name: 'gauge', label: 'Gauge', Icon: Gauge },
  { name: 'activity', label: 'Activity', Icon: Activity },
  { name: 'cpu', label: 'Processor', Icon: Cpu },
  { name: 'plug', label: 'Plug', Icon: Plug },
  { name: 'zap', label: 'Power', Icon: Zap },
  { name: 'battery-charging', label: 'Battery', Icon: BatteryCharging },
  { name: 'flame', label: 'Flame', Icon: Flame },
  { name: 'droplets', label: 'Droplets', Icon: Droplets },
  { name: 'wind', label: 'Wind', Icon: Wind },
  { name: 'sun', label: 'Sun', Icon: Sun },
  { name: 'leaf', label: 'Leaf', Icon: Leaf },
  { name: 'recycle', label: 'Recycle', Icon: Recycle },
  { name: 'flask-conical', label: 'Flask', Icon: FlaskConical },
  { name: 'microscope', label: 'Microscope', Icon: Microscope },
  { name: 'beaker', label: 'Beaker', Icon: Beaker },
  { name: 'users', label: 'Users', Icon: Users },
  { name: 'user', label: 'User', Icon: User },
  { name: 'briefcase', label: 'Briefcase', Icon: Briefcase },
  { name: 'handshake', label: 'Handshake', Icon: Handshake },
  { name: 'building', label: 'Building', Icon: Building },
  { name: 'building-2', label: 'Building (alt)', Icon: Building2 },
  { name: 'file-text', label: 'Document', Icon: FileText },
  { name: 'clipboard-list', label: 'Clipboard', Icon: ClipboardList },
  { name: 'receipt', label: 'Receipt', Icon: Receipt },
  { name: 'calculator', label: 'Calculator', Icon: Calculator },
  { name: 'wallet', label: 'Wallet', Icon: Wallet },
  { name: 'banknote', label: 'Banknote', Icon: Banknote },
  { name: 'credit-card', label: 'Credit card', Icon: CreditCard },
  { name: 'bar-chart-3', label: 'Bar chart', Icon: BarChart3 },
  { name: 'pie-chart', label: 'Pie chart', Icon: PieChart },
  { name: 'trending-up', label: 'Trending up', Icon: TrendingUp },
  { name: 'calendar', label: 'Calendar', Icon: Calendar },
  { name: 'clock', label: 'Clock', Icon: Clock },
  { name: 'shield', label: 'Shield', Icon: Shield },
  { name: 'lock', label: 'Lock', Icon: Lock },
  { name: 'key', label: 'Key', Icon: Key },
  { name: 'settings', label: 'Settings', Icon: Settings },
  { name: 'database', label: 'Database', Icon: Database },
  { name: 'server', label: 'Server', Icon: Server },
  { name: 'cloud', label: 'Cloud', Icon: Cloud },
  { name: 'globe', label: 'Globe', Icon: Globe },
  { name: 'mail', label: 'Mail', Icon: Mail },
  { name: 'phone', label: 'Phone', Icon: Phone },
  { name: 'map-pin', label: 'Location', Icon: MapPin },
  { name: 'hexagon', label: 'Hexagon', Icon: Hexagon },
]

const BY_NAME: Record<string, LucideIcon> = Object.fromEntries(APP_ICONS.map((i) => [i.name, i.Icon]))

// Resolve a stored icon name → a lucide component, defaulting to Box for unknown/legacy values.
export function iconByName(name?: string | null): LucideIcon {
  return (name ? BY_NAME[name.trim()] : undefined) || Box
}

// Small convenience renderer used by the launcher tile and the picker preview.
export function AppIcon({ name, className }: { name?: string | null; className?: string }) {
  const Icon = iconByName(name)
  return <Icon className={className} />
}
