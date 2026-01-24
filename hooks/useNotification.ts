import { Alert } from "react-native";

// Simple notification hook for React Native
// In production, consider using react-native-toast-message or similar

export function showNotification(message: string, title?: string) {
  Alert.alert(title || "Notice", message);
}

export function useNotification() {
  return {
    show: showNotification,
  };
}
