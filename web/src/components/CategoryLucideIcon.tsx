import type { LucideIcon, LucideProps } from 'lucide-react';
import {
  ArrowLeftRight,
  Briefcase,
  Car,
  CreditCard,
  RotateCcw,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  UtensilsCrossed,
  Zap,
} from 'lucide-react';

const STROKE = 2;

const ICON_MAP: Record<string, LucideIcon> = {
  shopping_cart: ShoppingCart,
  shopping_bag: ShoppingBag,
  restaurant: UtensilsCrossed,
  car: Car,
  bolt: Zap,
  subscriptions: Smartphone,
  credit_card: CreditCard,
  work: Briefcase,
  undo: RotateCcw,
  swap_horiz: ArrowLeftRight,
};

export function CategoryLucideIcon({ iconName, ...props }: LucideProps & { iconName: string }) {
  const Icon = ICON_MAP[iconName] ?? ShoppingBag;
  return <Icon strokeWidth={STROKE} {...props} />;
}
