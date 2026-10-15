export interface CapacitorConfig {
  appId: string;
  appName: string;
  webDir: string;
  server?: {
    androidScheme?: string;
    cleartext?: boolean;
    allowNavigation?: string[];
  };
  plugins?: {
    PushNotifications?: {
      presentationOptions?: ('badge' | 'sound' | 'alert')[];
    };
    SplashScreen?: {
      launchShowDuration?: number;
      launchAutoHide?: boolean;
      backgroundColor?: string;
      androidSplashResourceName?: string;
      androidScaleType?: string;
      showSpinner?: boolean;
    };
    StatusBar?: {
      style?: 'DARK' | 'LIGHT';
      backgroundColor?: string;
    };
    Keyboard?: {
      resize?: string;
      style?: string;
      resizeOnFullScreen?: boolean;
    };
  };
}

const config: CapacitorConfig = {
  appId: 'com.xbet.sportsbook',
  appName: 'xBET Sports & Casino',
  webDir: 'apps/web/public',
  server: {
    androidScheme: 'https',
    cleartext: false,
    allowNavigation: [
      '*.xbet.com',
      '*.pragmaticplay.net',
      '*.evolution.com',
    ],
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#0a0d14',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0a0d14',
    },
    Keyboard: {
      resize: 'body',
      style: 'DARK',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
