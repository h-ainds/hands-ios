const IS_DEV = process.env.APP_VARIANT === "development";

export default {
  expo: {
    name: IS_DEV ? "Hands (Dev)" : "Hands",
    slug: "hands-ios",
    version: "1.1",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "handsios",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    splash: {
      image: "./assets/images/splash-screen-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff",
    },
    ios: {
      bundleIdentifier: IS_DEV ? "com.handsai.hands.dev" : "com.handsai.hands",
      buildNumber: "1",
      supportsTablet: true,
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      package: IS_DEV ? "com.handsai.hands.dev" : "com.handsai.hands",
    },
    web: {
      bundler: "metro",
      output: "static",
      favicon: "./assets/images/favicon.png",
    },
    plugins: ["expo-router", "expo-web-browser"],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      router: {},
      eas: {
        projectId: "9be26852-c10d-4c49-9ea8-70ee0c06621f",
      },
    },
    owner: "hands-ai",
  },
};