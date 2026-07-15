import type { LucideProps } from 'lucide-react';
import {
  ArrowUp,
  ArrowDown,
  BarChart3,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Cloud,
  CreditCard,
  Download,
  Gauge,
  Globe,
  History,
  Layers,
  List,
  Moon,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Settings,
  Wallet,
  Trash2,
  Camera,
  Eraser,
  X,
} from 'lucide-react';

/** Consistent stroke for all UI chrome icons */
const STROKE = 2;

type IconProps = LucideProps;

export function IconRecord(props: IconProps) {
  return <List strokeWidth={STROKE} {...props} />;
}

export function IconInsights(props: IconProps) {
  return <BarChart3 strokeWidth={STROKE} {...props} />;
}

export function IconSettings(props: IconProps) {
  return <Settings strokeWidth={STROKE} {...props} />;
}

export function IconAdd(props: IconProps) {
  return <Plus strokeWidth={STROKE} {...props} />;
}

export function IconCloud(props: IconProps) {
  return <Cloud strokeWidth={STROKE} {...props} />;
}

export function IconWallet(props: IconProps) {
  return <Wallet strokeWidth={STROKE} {...props} />;
}

export function IconSearch(props: IconProps) {
  return <Search strokeWidth={STROKE} {...props} />;
}

export function IconChevronDown(props: IconProps) {
  return <ChevronDown strokeWidth={STROKE} {...props} />;
}

export function IconChevronRight(props: IconProps) {
  return <ChevronRight strokeWidth={STROKE} {...props} />;
}

export function IconMoon(props: IconProps) {
  return <Moon strokeWidth={STROKE} {...props} />;
}

export function IconGlobe(props: IconProps) {
  return <Globe strokeWidth={STROKE} {...props} />;
}

export function IconCurrency(props: IconProps) {
  return <CreditCard strokeWidth={STROKE} {...props} />;
}

export function IconGauge(props: IconProps) {
  return <Gauge strokeWidth={STROKE} {...props} />;
}

export function IconLayers(props: IconProps) {
  return <Layers strokeWidth={STROKE} {...props} />;
}

export function IconDownload(props: IconProps) {
  return <Download strokeWidth={STROKE} {...props} />;
}

export function IconCalendar(props: IconProps) {
  return <Calendar strokeWidth={STROKE} {...props} />;
}

export function IconHistory(props: IconProps) {
  return <History strokeWidth={STROKE} {...props} />;
}

export function IconCheck(props: IconProps) {
  return <Check strokeWidth={STROKE} {...props} />;
}

export function IconPaperclip(props: IconProps) {
  return <Paperclip strokeWidth={STROKE} {...props} />;
}

export function IconArrowUp(props: IconProps) {
  return <ArrowUp strokeWidth={STROKE} {...props} />;
}

export function IconArrowDown(props: IconProps) {
  return <ArrowDown strokeWidth={STROKE} {...props} />;
}

export function IconDelete(props: IconProps) {
  return <Trash2 strokeWidth={STROKE} {...props} />;
}

export function IconEdit(props: IconProps) {
  return <Pencil strokeWidth={STROKE} {...props} />;
}

export function IconCamera(props: IconProps) {
  return <Camera strokeWidth={STROKE} {...props} />;
}

export function IconBroom(props: IconProps) {
  return <Eraser strokeWidth={STROKE} {...props} />;
}

export function IconClose(props: IconProps) {
  return <X strokeWidth={STROKE} {...props} />;
}
