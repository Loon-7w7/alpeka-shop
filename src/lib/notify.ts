import { AccessibilityInfo, Platform, ToastAndroid } from 'react-native';

export function notify(message: string) {
  if (Platform.OS === 'android') ToastAndroid.show(message, ToastAndroid.SHORT);
  else AccessibilityInfo.announceForAccessibility(message);
}
