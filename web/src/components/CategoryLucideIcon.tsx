import type { LucideIcon, LucideProps } from 'lucide-react';
import {
  ArrowLeftRight,
  Baby,
  BriefcaseMedical,
  Briefcase,
  Car,
  Cigarette,
  CircleHelp,
  Coffee,
  CreditCard,
  Dumbbell,
  Film,
  Fuel,
  Gift,
  GraduationCap,
  Hotel,
  House,
  Laptop,
  PawPrint,
  Phone,
  PiggyBank,
  Plane,
  RotateCcw,
  Shapes,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  TrendingUp,
  Trophy,
  UtensilsCrossed,
  Wallet,
  Wifi,
  Zap,
} from 'lucide-react';

const STROKE = 2;

/** Mirrors Android CategoryIconOptions keys (util/CategoryIcons.kt) so shared docs render the same icon. */
const ICON_MAP: Record<string, LucideIcon> = {
  category: Shapes,
  shopping_cart: ShoppingCart,
  shopping_bag: ShoppingBag,
  restaurant: UtensilsCrossed,
  cafe: Coffee,
  car: Car,
  gas: Fuel,
  home: House,
  bolt: Zap,
  wifi: Wifi,
  subscriptions: Smartphone,
  smoking: Cigarette,
  health: BriefcaseMedical,
  fitness: Dumbbell,
  education: GraduationCap,
  work: Briefcase,
  flight: Plane,
  hotel: Hotel,
  wallet: Wallet,
  savings: PiggyBank,
  credit_card: CreditCard,
  trending_up: TrendingUp,
  undo: RotateCcw,
  swap: ArrowLeftRight,
  swap_horiz: ArrowLeftRight,
  gift: Gift,
  entertainment: Film,
  pets: PawPrint,
  child: Baby,
  phone: Phone,
  laptop: Laptop,
  emoji_events: Trophy,
  help_outline: CircleHelp,
};

/** Picker options — same keys and order as Android's CategoryIconOptions. */
export const CATEGORY_ICON_KEYS = [
  'category', 'shopping_cart', 'shopping_bag', 'restaurant', 'cafe', 'car', 'gas',
  'home', 'bolt', 'wifi', 'subscriptions', 'smoking', 'health', 'fitness',
  'education', 'work', 'flight', 'hotel', 'wallet', 'savings', 'credit_card',
  'trending_up', 'undo', 'swap', 'gift', 'entertainment', 'pets', 'child',
  'phone', 'laptop', 'emoji_events',
] as const;

/** Readable names for the icon picker's aria-labels (raw keys read poorly, e.g. "emoji events"). */
const ICON_LABELS: Record<string, string> = {
  category: 'category',
  shopping_cart: 'shopping cart',
  shopping_bag: 'shopping bag',
  restaurant: 'restaurant',
  cafe: 'café',
  car: 'car',
  gas: 'fuel',
  home: 'home',
  bolt: 'electricity',
  wifi: 'internet',
  subscriptions: 'subscriptions',
  smoking: 'smoking',
  health: 'health',
  fitness: 'fitness',
  education: 'education',
  work: 'work',
  flight: 'flight',
  hotel: 'hotel',
  wallet: 'wallet',
  savings: 'savings',
  credit_card: 'credit card',
  trending_up: 'investments',
  undo: 'refund',
  swap: 'transfer',
  gift: 'gift',
  entertainment: 'entertainment',
  pets: 'pets',
  child: 'child',
  phone: 'phone',
  laptop: 'laptop',
  emoji_events: 'awards',
};

export function categoryIconLabel(iconName: string): string {
  return ICON_LABELS[iconName] ?? iconName.replace(/_/g, ' ');
}

export function CategoryLucideIcon({ iconName, ...props }: LucideProps & { iconName: string }) {
  const Icon = ICON_MAP[iconName] ?? Shapes;
  return <Icon strokeWidth={STROKE} {...props} />;
}
