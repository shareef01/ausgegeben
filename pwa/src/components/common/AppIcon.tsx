import * as LucideIcons from 'lucide-react';
import { LucideProps } from 'lucide-react';

interface AppIconProps extends LucideProps {
  name: string;
}

const iconMap: Record<string, any> = {
  'utensils': LucideIcons.Utensils,
  'car': LucideIcons.Car,
  'banknote': LucideIcons.Banknote,
  'shopping-cart': LucideIcons.ShoppingCart,
  'home': LucideIcons.Home,
  'coffee': LucideIcons.Coffee,
  'gift': LucideIcons.Gift,
  'heart': LucideIcons.Heart,
  'user': LucideIcons.User,
  'settings': LucideIcons.Settings,
  'plus': LucideIcons.Plus,
  'search': LucideIcons.Search,
  'x': LucideIcons.X,
  'arrow-left': LucideIcons.ArrowLeft,
  'camera': LucideIcons.Camera,
  'calendar': LucideIcons.Calendar,
  'delete': LucideIcons.Trash2,
  'receipt': LucideIcons.Receipt,
  'category': LucideIcons.LayoutGrid,
  'chevron-right': LucideIcons.ChevronRight,
  'backspace': LucideIcons.Delete,
  'briefcase': LucideIcons.Briefcase,
  'pizza': LucideIcons.Pizza,
  'bus': LucideIcons.Bus,
  'smartphone': LucideIcons.Smartphone,
  'tv': LucideIcons.Tv,
  'dumbbell': LucideIcons.Dumbbell,
  'stethoscop': LucideIcons.Stethoscope,
  'plane': LucideIcons.Plane,
  'shield': LucideIcons.Shield,
  'trending-up': LucideIcons.TrendingUp,
  'help-circle': LucideIcons.HelpCircle,
};

export const AppIcon = ({ name, ...props }: AppIconProps) => {
  const IconComponent = iconMap[name] || LucideIcons.HelpCircle;
  return <IconComponent {...props} />;
};
