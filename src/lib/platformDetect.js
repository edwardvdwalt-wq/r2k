/**
 * platformDetect — determines if the app is running inside a native mobile webview
 * Detects Capacitor (primary) or Cordova (fallback)
 */

export function isMobilePlatform() {
  return !!(window.Capacitor?.isNativePlatform?.() || window.cordova);
}

export function getPlatform() {
  if (window.Capacitor?.isNativePlatform?.()) return window.Capacitor.getPlatform(); // 'ios' | 'android'
  if (window.cordova) return window.cordova.platformId || 'cordova';
  return 'web';
}