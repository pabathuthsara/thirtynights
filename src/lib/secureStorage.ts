import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const PREFIX = 'thirtynights.secure.';

export const secureStorage = {
  async getItem(key: string) {
    return Platform.OS === 'web'
      ? AsyncStorage.getItem(`${PREFIX}${key}`)
      : SecureStore.getItemAsync(`${PREFIX}${key}`);
  },
  async setItem(key: string, value: string) {
    if (Platform.OS === 'web') await AsyncStorage.setItem(`${PREFIX}${key}`, value);
    else await SecureStore.setItemAsync(`${PREFIX}${key}`, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  },
  async removeItem(key: string) {
    if (Platform.OS === 'web') await AsyncStorage.removeItem(`${PREFIX}${key}`);
    else await SecureStore.deleteItemAsync(`${PREFIX}${key}`);
  },
};
