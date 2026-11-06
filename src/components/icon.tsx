import { memo } from 'react';
import { Image, type ColorValue } from 'react-native';

export const ICONS = {
  scan: require('../../assets/icons/scan.png'),
  list: require('../../assets/icons/list.png'),
  settings: require('../../assets/icons/settings.png'),
  flash: require('../../assets/icons/flash.png'),
  keypad: require('../../assets/icons/keypad.png'),
  check: require('../../assets/icons/check.png'),
  search: require('../../assets/icons/search.png'),
  plus: require('../../assets/icons/plus.png'),
  download: require('../../assets/icons/download.png'),
  upload: require('../../assets/icons/upload.png'),
  refresh: require('../../assets/icons/refresh.png'),
  edit: require('../../assets/icons/edit.png'),
  phone: require('../../assets/icons/phone.png'),
  cart: require('../../assets/icons/cart.png'),
  minus: require('../../assets/icons/minus.png'),
  trash: require('../../assets/icons/trash.png'),
} as const;

export type IconName = keyof typeof ICONS;

export const Icon = memo(function Icon({ name, size = 22, color }: { name: IconName; size?: number; color: ColorValue }) {
  return <Image source={ICONS[name]} style={{ width: size, height: size, tintColor: color }} accessible={false} />;
});
