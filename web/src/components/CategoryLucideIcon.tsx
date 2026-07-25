import type { LucideIcon, LucideProps } from 'lucide-react';
import type { TranslationKey } from '@/i18n';
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
const ICON_LABEL_KEYS: Record<string, TranslationKey> = {
  category: 'iconCategory',
  shopping_cart: 'iconShoppingCart',
  shopping_bag: 'iconShoppingBag',
  restaurant: 'iconRestaurant',
  cafe: 'iconCafe',
  car: 'iconCar',
  gas: 'iconGas',
  home: 'iconHome',
  bolt: 'iconBolt',
  wifi: 'iconWifi',
  subscriptions: 'iconSubscriptions',
  smoking: 'iconSmoking',
  health: 'iconHealth',
  fitness: 'iconFitness',
  education: 'iconEducation',
  work: 'iconWork',
  flight: 'iconFlight',
  hotel: 'iconHotel',
  wallet: 'iconWallet',
  savings: 'iconSavings',
  credit_card: 'iconCreditCard',
  trending_up: 'iconTrendingUp',
  undo: 'iconUndo',
  swap: 'iconSwap',
  swap_horiz: 'iconSwap',
  gift: 'iconGift',
  entertainment: 'iconEntertainment',
  pets: 'iconPets',
  child: 'iconChild',
  phone: 'iconPhone',
  laptop: 'iconLaptop',
  emoji_events: 'iconAwards',
  help_outline: 'iconHelp',
};

export function categoryIconLabel(
  iconName: string,
  translate: (key: TranslationKey) => string,
): string {
  const key = ICON_LABEL_KEYS[iconName];
  return key ? translate(key) : iconName.replace(/_/g, ' ');
}

export function CategoryLucideIcon({ iconName, ...props }: LucideProps & { iconName: string }) {
  const Icon = ICON_MAP[iconName] ?? Shapes;
  return <Icon strokeWidth={STROKE} {...props} />;
}
