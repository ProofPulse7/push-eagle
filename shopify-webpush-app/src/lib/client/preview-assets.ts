export const BROWSER_LOGOS = {
  safari: '/images/safari-logo-browser-39668.png',
  chrome: '/images/Google_Chrome_icon_(February_2022).svg.png',
  edge: '/images/Microsoft_Edge_logo_(2019).png',
} as const;

export const OS_PREVIEW_LOGOS = {
  ios: '/images/ios-os-logo-top-operating-system-signs-free-png.png',
  android: '/images/android.png',
  windows: '/images/windows.png',
  macos: '/images/macOS-Logo.png',
} as const;

export type PreviewDevice = keyof typeof OS_PREVIEW_LOGOS;
