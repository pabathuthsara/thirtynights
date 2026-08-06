import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

import { appIdentifiers } from '@/config/environment';
import { questionFor, type QuestionSetId } from '@/data/questions';
import { colors } from '@/theme';
import type { Night } from '@/types';

const IDENTIFIERS_KEY = 'thirtynights.notifications.nightly.v2';
const HORIZON = 14;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function createChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('nightly', {
    name: 'Nightly question',
    description: 'The one reminder for tonight’s voice-journal question.',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 180],
    lightColor: colors.brass,
    sound: null,
  });
}

export async function requestNotificationPermission() {
  if (Platform.OS === 'web') return false;
  await createChannel();
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  if (!existing.canAskAgain) return false;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

async function ownedIdentifiers() {
  return JSON.parse((await AsyncStorage.getItem(IDENTIFIERS_KEY)) ?? '[]') as string[];
}

export async function cancelNightlyQuestions() {
  if (Platform.OS === 'web') return;
  for (const identifier of await ownedIdentifiers()) {
    await Notifications.cancelScheduledNotificationAsync(identifier);
  }
  await AsyncStorage.removeItem(IDENTIFIERS_KEY);
}

export async function scheduleNightlyQuestions(params: {
  hour: number;
  minute: number;
  startNight: number;
  set: QuestionSetId;
  count?: number;
  nights?: Night[];
  privatePreview?: boolean;
}) {
  if (Platform.OS === 'web') return [];
  await createChannel();
  await cancelNightlyQuestions();
  const ids: string[] = [];
  const now = new Date();
  const eligible = params.nights
    ?.filter((night) => night.status === 'today' || night.status === 'future')
    .filter((night) => night.index >= params.startNight)
    .slice(0, Math.min(params.count ?? HORIZON, HORIZON));

  const schedule = eligible?.length
    ? eligible.map((night) => ({ night, date: new Date(`${night.expectedLocalDate}T12:00:00`) }))
    : Array.from({ length: Math.min(params.count ?? HORIZON, HORIZON) }, (_, offset) => ({
        night: { index: params.startNight + offset } as Night,
        date: new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, 12),
      }));

  for (const { night, date } of schedule) {
    date.setHours(params.hour, params.minute, 0, 0);
    if (date <= now) continue;
    const title = `Night ${night.index}`;
    const body = params.privatePreview ? 'Your nightly question is waiting.' : questionFor(params.set, night.index).slice(0, 90);
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: false,
        data: { url: `${appIdentifiers.scheme}://night/${night.id || night.index}`, nightIndex: night.index },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: 'nightly' },
    });
    ids.push(id);
  }
  await AsyncStorage.setItem(IDENTIFIERS_KEY, JSON.stringify(ids));
  return ids;
}

export function subscribeToNotificationResponses(onNight: (nightIndex: number) => void) {
  if (Platform.OS === 'web') return () => undefined;
  const open = (response: Notifications.NotificationResponse | null) => {
    const index = response?.notification.request.content.data?.nightIndex;
    if (typeof index === 'number') onNight(index);
  };
  void Notifications.getLastNotificationResponseAsync().then(open).catch(() => undefined);
  const subscription = Notifications.addNotificationResponseReceivedListener(open);
  return () => subscription.remove();
}
