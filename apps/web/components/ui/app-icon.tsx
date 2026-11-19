import { Icon } from '@iconify/react';
import motorcycle from '@iconify-icons/fa6-solid/motorcycle';
import arrowLeft from '@iconify-icons/lucide/arrow-left';
import arrowRight from '@iconify-icons/lucide/arrow-right';
import arrowUpRight from '@iconify-icons/lucide/arrow-up-right';
import bell from '@iconify-icons/lucide/bell';
import bike from '@iconify-icons/lucide/bike';
import chevronDown from '@iconify-icons/lucide/chevron-down';
import clock3 from '@iconify-icons/lucide/clock-3';
import heart from '@iconify-icons/lucide/heart';
import house from '@iconify-icons/lucide/house';
import headset from '@iconify-icons/lucide/headset';
import chefHat from '@iconify-icons/lucide/chef-hat';
import chartNoAxesCombined from '@iconify-icons/lucide/chart-no-axes-combined';
import layoutDashboard from '@iconify-icons/lucide/layout-dashboard';
import megaphone from '@iconify-icons/lucide/megaphone';
import mapPin from '@iconify-icons/lucide/map-pin';
import scrollText from '@iconify-icons/lucide/scroll-text';
import receiptText from '@iconify-icons/lucide/receipt-text';
import search from '@iconify-icons/lucide/search';
import settings from '@iconify-icons/lucide/settings';
import shoppingCart from '@iconify-icons/lucide/shopping-cart';
import store from '@iconify-icons/lucide/store';
import slidersHorizontal from '@iconify-icons/lucide/sliders-horizontal';
import sparkles from '@iconify-icons/lucide/sparkles';
import star from '@iconify-icons/lucide/star';
import truck from '@iconify-icons/lucide/truck';
import utensils from '@iconify-icons/lucide/utensils';
import userRound from '@iconify-icons/lucide/user-round';
import users from '@iconify-icons/lucide/users';
import wallet from '@iconify-icons/lucide/wallet';
import plus from '@iconify-icons/lucide/plus';
import trash2 from '@iconify-icons/lucide/trash-2';
import minus from '@iconify-icons/lucide/minus';
import tag from '@iconify-icons/lucide/tag';
import { cn } from './cn';

const icons = {
  'arrow-left': arrowLeft,
  'arrow-right': arrowRight,
  'arrow-up-right': arrowUpRight,
  bell,
  bike,
  'chevron-down': chevronDown,
  'clock-3': clock3,
  heart,
  headset,
  house,
  'chef-hat': chefHat,
  'chart-no-axes-combined': chartNoAxesCombined,
  'layout-dashboard': layoutDashboard,
  megaphone,
  motorcycle,
  'map-pin': mapPin,
  'receipt-text': receiptText,
  'scroll-text': scrollText,
  search,
  settings,
  'shopping-cart': shoppingCart,
  'sliders-horizontal': slidersHorizontal,
  sparkles,
  star,
  store,
  truck,
  utensils,
  'user-round': userRound,
  users,
  wallet,
  plus,
  'trash-2': trash2,
  minus,
  tag,
} as const;

export type AppIconName = keyof typeof icons;

export function AppIcon({ name, className }: { name: AppIconName; className?: string }) {
  return <Icon icon={icons[name]} className={cn('shrink-0', className)} aria-hidden="true" />;
}
