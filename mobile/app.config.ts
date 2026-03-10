import { ExpoConfig, ConfigContext } from 'expo/config'
import { existsSync } from 'fs'
import { resolve } from 'path'

const r = (p: string) => resolve(__dirname, p)
const iosGSF = r(process.env.GOOGLE_SERVICES_PLIST ?? './google-services/GoogleService-Info.plist')
const androidGSF = r(process.env.GOOGLE_SERVICES_JSON ?? './google-services/google-services.json')

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'NEXUS BMS',
  slug: 'nexus-bms',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#4f46e5',
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.nexusbms.app',
    ...(existsSync(iosGSF) ? { googleServicesFile: iosGSF } : {}),
    infoPlist: {
      NSFaceIDUsageDescription: 'NEXUS BMS uses Face ID to secure your session.',
      NSCameraUsageDescription: 'NEXUS BMS uses your camera for scanning and uploading attachments.',
      NSPhotoLibraryUsageDescription: 'NEXUS BMS needs access to your photo library to attach images to tickets.',
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#4f46e5',
    },
    package: 'com.nexusbms.app',
    ...(existsSync(androidGSF) ? { googleServicesFile: androidGSF } : {}),
    permissions: [
      'CAMERA',
      'READ_EXTERNAL_STORAGE',
      'WRITE_EXTERNAL_STORAGE',
      'USE_BIOMETRIC',
      'USE_FINGERPRINT',
    ],
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-secure-store',
    [
      'expo-notifications',
      {
        icon: './assets/notification-icon.png',
        color: '#4f46e5',
        sounds: [],
      },
    ],
    [
      'expo-local-authentication',
      {
        faceIDPermission: 'Allow NEXUS BMS to use Face ID for biometric authentication.',
      },
    ],
  ],
  extra: {
    apiBaseUrl: process.env.API_BASE_URL ?? 'https://bms.techyatra.com.np/api/v1',
    rootDomain: process.env.ROOT_DOMAIN ?? 'bms.techyatra.com.np',
    environment: process.env.APP_ENV ?? 'development',
    eas: {
      projectId: process.env.EAS_PROJECT_ID ?? '',
    },
  },
  scheme: 'nexusbms',
  experiments: {
    typedRoutes: true,
  },
})
