import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';
import {
  BellRing,
  ChevronRight,
  CloudUpload,
  Clock3,
  Download,
  FileText,
  Flower2,
  Globe,
  LifeBuoy,
  MoonStar,
  Palette,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserRound,
  type LucideIcon,
} from 'lucide-react-native';

import { AppHeader } from '@/components/AppHeader';
import { BottomSheet } from '@/components/BottomSheet';
import { Button } from '@/components/Buttons';
import { Screen, Stagger } from '@/components/Screen';
import { Toast, type ToastMessage } from '@/components/Toast';
import { formatClock } from '@/domain/format';
import { colors, radii, shadows, surfaces, textStyles, typography, weight } from '@/theme';

function Row({ icon: Icon, title, detail, onPress, control, danger = false, last = false, busy = false }: {
  icon: LucideIcon;
  title: string;
  detail?: string;
  onPress?: () => void;
  control?: ReactNode;
  danger?: boolean;
  last?: boolean;
  busy?: boolean;
}) {
  const interactive = Boolean(onPress);
  return (
    <Pressable
      accessibilityRole={interactive ? 'button' : undefined}
      accessibilityLabel={interactive ? `${title}${detail ? `. ${detail}` : ''}` : undefined}
      disabled={!interactive}
      onPress={onPress}
      android_ripple={interactive ? { color: 'rgba(190,111,124,0.10)' } : undefined}
      style={({ pressed }) => [styles.row, last && styles.lastRow, interactive && pressed && styles.pressed]}
    >
      <View style={[styles.rowIcon, danger && styles.dangerIcon]}>
        <Icon size={19} strokeWidth={1.9} color={danger ? colors.ember : colors.roseText} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowTitle, danger && styles.dangerText]}>{title}</Text>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      </View>
      {busy ? <ActivityIndicator size="small" color={colors.roseText} /> : null}
      {!busy && (control ?? (interactive ? <ChevronRight size={18} strokeWidth={2} color={colors.boneFaint} /> : null))}
    </Pressable>
  );
}

/** A switch row: tapping anywhere on the row toggles it, not just the switch. */
function SwitchRow({ icon, title, detail, value, onValueChange, last = false }: {
  icon: LucideIcon;
  title: string;
  detail?: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  last?: boolean;
}) {
  const toggle = () => {
    if (Platform.OS !== 'web') void Haptics.selectionAsync().catch(() => undefined);
    onValueChange(!value);
  };
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={`${title}${detail ? `. ${detail}` : ''}`}
      onPress={toggle}
      android_ripple={{ color: 'rgba(190,111,124,0.10)' }}
      style={({ pressed }) => [styles.row, last && styles.lastRow, pressed && styles.pressed]}
    >
      <View style={styles.rowIcon}>
        {(() => { const Icon = icon; return <Icon size={19} strokeWidth={1.9} color={colors.roseText} />; })()}
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{title}</Text>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      </View>
      <Switch
        style={styles.switch}
        accessible={false}
        pointerEvents="none"
        value={value}
        // The off state used to be near-invisible cream on cream.
        trackColor={{ false: '#D9C3CB', true: colors.roseDeep }}
        thumbColor={colors.white}
        ios_backgroundColor="#D9C3CB"
      />
    </Pressable>
  );
}

type SettingsProps = {
  reminderHour: number;
  reminderMinute: number;
  notificationsEnabled: boolean;
  gentleNudge: boolean;
  authState: 'local' | 'anonymous' | 'authenticated';
  email?: string;
  backupNetwork: 'wifi-only' | 'wifi-and-cellular';
  processingConsent: boolean;
  unbackedCount: number;
  syncing: boolean;
  showDeveloperControls: boolean;
  demoMode?: 'empty' | 'partial' | 'complete';
  previewRecordingCount?: number;
  onBack: () => void;
  onAuth: () => void;
  onEditReminder: () => void;
  onToggleNotifications: (enabled: boolean) => void;
  onToggleNudge: (enabled: boolean) => void;
  onBackupNetwork: (network: 'wifi-only' | 'wifi-and-cellular') => void;
  onEnableProcessing: () => void;
  onDisableProcessing: () => void;
  onSync: () => Promise<void>;
  onRestore: () => void;
  onExport: () => Promise<void>;
  onPrivacy: () => void;
  onTerms: () => void;
  onSupport: () => void;
  onWebDelete: () => void;
  onPreview: (mode: 'empty' | 'partial' | 'complete') => void;
  onExitPreview: (discardPreviewRecordings?: boolean) => Promise<void>;
  onPopupCatalog: () => void;
  onPreviewSealing: () => void;
  onDevRecordings: () => void;
  onAdvanceNight: () => void;
  onDelete: (remote: boolean) => Promise<void>;
};

export function SettingsScreen(props: SettingsProps) {
  const [deleteSheet, setDeleteSheet] = useState(false);
  const [backupSheet, setBackupSheet] = useState(false);
  const [accountSheet, setAccountSheet] = useState(false);
  const [exitPreviewSheet, setExitPreviewSheet] = useState(false);
  const [busy, setBusy] = useState<'sync' | 'export' | 'delete' | 'preview' | null>(null);
  const [toast, setToast] = useState<ToastMessage>(null);

  const formattedHour = formatClock(props.reminderHour, props.reminderMinute);
  const connected = props.authState === 'authenticated';
  const hasCloudIdentity = props.authState !== 'local';
  const version = (Constants.expoConfig?.version ?? '1.0.0');
  const previewName = props.demoMode === 'empty'
    ? 'Empty month'
    : props.demoMode === 'partial'
      ? 'Twelve-night month'
      : props.demoMode === 'complete'
        ? 'Opened report state'
        : undefined;

  const run = async (key: 'sync' | 'export' | 'delete' | 'preview', operation: () => Promise<void>, success: string) => {
    try {
      setBusy(key);
      await operation();
      setToast({ text: success, tone: 'success' });
    } catch (error) {
      setToast({ text: error instanceof Error ? error.message : 'That action could not be completed.', tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Screen header={<AppHeader label="SETTINGS" onBack={props.onBack} />}>
        <Stagger index={0}>
          <Text accessibilityRole="header" style={styles.title}>Settings</Text>
        </Stagger>

        <Stagger index={1}>
          <Text style={styles.sectionLabel}>YOUR NIGHTS</Text>
          <View style={styles.group}>
            <Row
              icon={Clock3}
              title="Nightly reminder"
              detail={`At ${formattedHour}`}
              onPress={props.onEditReminder}
            />
            <SwitchRow
              icon={BellRing}
              title="Notifications"
              detail="One reminder a day"
              value={props.notificationsEnabled}
              onValueChange={props.onToggleNotifications}
            />
            <SwitchRow
              icon={MoonStar}
              title="Thirty-minute nudge"
              detail="Optional follow-up"
              value={props.gentleNudge}
              onValueChange={props.onToggleNudge}
              last
            />
          </View>
        </Stagger>

        <Stagger index={2}>
          <Text style={styles.sectionLabel}>APPEARANCE</Text>
          <View style={styles.group}>
            <Row icon={Palette} title="Soft Keepsake" detail="Paper, blush, rose gold" />
            <Row icon={Flower2} title="Keepsake Classics" detail="Current sticker collection" last />
          </View>
        </Stagger>

        <Stagger index={3}>
          <Text style={styles.sectionLabel}>ACCOUNT &amp; BACKUP</Text>
          <View style={styles.group}>
            <Row
              icon={UserRound}
              title={connected ? 'Account connected' : 'Create or connect an account'}
              detail={connected ? props.email || 'Cloud identity' : 'For purchases and backup'}
              onPress={connected ? () => setAccountSheet(true) : props.onAuth}
            />
            <Row
              icon={CloudUpload}
              title="Recording backup"
              detail={props.demoMode
                ? 'Developer preview · local only'
                : !connected
                ? 'On this device'
                : !props.processingConsent
                  ? 'Processing permission needed'
                  : `${props.backupNetwork === 'wifi-only' ? 'Wi-Fi only' : 'Wi-Fi and cellular'} · ${props.unbackedCount} waiting`}
              onPress={props.demoMode ? undefined : () => connected ? setBackupSheet(true) : props.onAuth()}
            />
            <Row
              icon={RefreshCw}
              title={props.demoMode ? 'Cloud sync unavailable in preview' : props.syncing ? 'Synchronizing…' : 'Synchronize now'}
              detail={props.demoMode
                ? 'Preview recordings stay here'
                : props.unbackedCount
                ? `${props.unbackedCount} recording${props.unbackedCount === 1 ? '' : 's'} not backed up`
                : 'Up to date'}
              busy={busy === 'sync'}
              onPress={props.demoMode ? undefined : () => void run('sync', props.onSync, 'Everything is synchronized.')}
            />
            <Row
              icon={ReceiptText}
              title="Restore purchases"
              detail="Verified with the store"
              onPress={props.onRestore}
              last
            />
          </View>
        </Stagger>

        <Stagger index={4}>
          <Text style={styles.sectionLabel}>PRIVACY</Text>
          <View style={styles.group}>
            <Row
              icon={Download}
              title="Export everything"
              detail="Audio, reports, and dates"
              busy={busy === 'export'}
              onPress={() => void run('export', props.onExport, 'Your export is ready to share.')}
            />
            <Row icon={ShieldCheck} title="Privacy policy" onPress={props.onPrivacy} />
            <Row icon={FileText} title="Terms of use" onPress={props.onTerms} />
            <Row icon={LifeBuoy} title="Support" onPress={props.onSupport} />
            <Row
              icon={Globe}
              title="Web deletion request"
              detail="Use if the app is unavailable"
              onPress={props.onWebDelete}
            />
            <Row
              icon={Trash2}
              title="Delete everything"
              detail={connected ? 'Cloud and device' : 'This device'}
              danger
              last
              onPress={() => setDeleteSheet(true)}
            />
          </View>
        </Stagger>

        {props.demoMode ? (
          <Stagger index={5}>
            <Text style={styles.sectionLabel}>LOCAL PREVIEW ACTIVE</Text>
            <View accessibilityRole="alert" style={styles.previewNotice}>
              <Text style={styles.previewNoticeTitle}>{previewName} preview is active</Text>
              <Text style={styles.previewNoticeBody}>
                Local test data only. Recording and backup are off. Export any take you need before returning.
              </Text>
            </View>
            <Button
              loading={busy === 'preview'}
              onPress={() => {
                if (props.previewRecordingCount) setExitPreviewSheet(true);
                else void run('preview', () => props.onExitPreview(false), 'Your real journey is restored.');
              }}
            >
              Return to my real journey
            </Button>
          </Stagger>
        ) : null}

        {props.showDeveloperControls ? (
          <Stagger index={props.demoMode ? 6 : 5}>
            <Text style={styles.sectionLabel}>DEVELOPER PREVIEWS</Text>
            <View style={styles.previewGroup}>
              <Button variant="outline" disabled={Boolean(props.demoMode)} onPress={() => props.onPreview('empty')}>Empty month</Button>
              <Button variant="outline" disabled={Boolean(props.demoMode)} onPress={() => props.onPreview('partial')}>Twelve-night month</Button>
              <Button variant="outline" disabled={Boolean(props.demoMode)} onPress={() => props.onPreview('complete')}>Opened report state</Button>
              <Button variant="outline" onPress={props.onPopupCatalog}>Supporting state catalog</Button>
              <Button variant="outline" onPress={props.onPreviewSealing}>Sealing ceremony</Button>
            </View>

            <Text style={styles.sectionLabel}>DEVELOPER TOOLS</Text>
            <View style={styles.previewGroup}>
              <Button variant="outline" onPress={props.onDevRecordings}>All recordings · play any take</Button>
              <Button variant="outline" onPress={props.onAdvanceNight}>Advance one night</Button>
              <Text style={styles.devNote}>
                Advancing moves the schedule back one day. Seal tonight first;
                an unrecorded past night becomes missed.
              </Text>
            </View>
          </Stagger>
        ) : null}

        <Text style={styles.version}>THIRTY NIGHTS · VERSION {version}</Text>

        <BottomSheet
          visible={exitPreviewSheet}
          title="Leave this developer preview?"
          body={`This preview has ${props.previewRecordingCount ?? 0} local ${props.previewRecordingCount === 1 ? 'recording' : 'recordings'} that cannot join your real nights. Export first, or remove the preview ${props.previewRecordingCount === 1 ? 'take' : 'takes'}.`}
          actions={[
            {
              label: 'Export preview first',
              variant: 'outline',
              onPress: () => void run('export', props.onExport, 'Your preview export is ready to share.'),
            },
            {
              label: props.previewRecordingCount === 1 ? 'Remove preview take and return' : 'Remove preview takes and return',
              variant: 'ember',
              onPress: () => void run('preview', async () => {
                await props.onExitPreview(true);
                setExitPreviewSheet(false);
              }, 'Your real journey is restored.'),
            },
          ]}
          footer={{ label: 'Keep preview', onPress: () => setExitPreviewSheet(false) }}
          onClose={() => busy === 'preview' ? undefined : setExitPreviewSheet(false)}
          blocking={busy === 'preview'}
        />

        <BottomSheet
          visible={accountSheet}
          title="Your account"
          body={`${props.email || 'A cloud identity is linked to this device.'}\n\nThis account owns your purchases and backups. To change accounts safely, export first and then delete.`}
          actions={[{ label: 'Understood', variant: 'outline', onPress: () => setAccountSheet(false) }]}
          onClose={() => setAccountSheet(false)}
        />

        <BottomSheet
          visible={backupSheet}
          title="Private backup & reflection processing"
          body="With permission, Supabase stores your recordings and dates. OpenAI transcribes them and creates reflections. Data is encrypted in transit and at rest, but not end-to-end. Withdraw to stop future processing; use Delete everything to remove stored data. Retention details are in the Privacy Policy."
          actions={[
            ...(!props.processingConsent
              ? [{ label: 'I agree — enable processing', onPress: () => { props.onEnableProcessing(); setBackupSheet(false); } }]
              : [{ label: 'Withdraw processing permission', variant: 'outline' as const, onPress: () => { props.onDisableProcessing(); setBackupSheet(false); } }]),
            { label: 'Wi-Fi only', variant: 'outline' as const, onPress: () => { props.onBackupNetwork('wifi-only'); setBackupSheet(false); } },
            { label: 'Wi-Fi and cellular', variant: 'outline' as const, onPress: () => { props.onBackupNetwork('wifi-and-cellular'); setBackupSheet(false); } },
          ]}
          footer={{ label: 'Not now', onPress: () => setBackupSheet(false) }}
          onClose={() => setBackupSheet(false)}
        />

        <BottomSheet
          visible={deleteSheet}
          title={busy === 'delete' ? 'Deleting…' : 'Delete your nights?'}
          body={busy === 'delete'
            ? 'Removing recordings and reports. Keep the app open.'
            : `Permanently removes recordings, dates, and reports from the selected locations. ${Platform.OS === 'android' ? 'Google Play' : 'App Store'} purchase records remain. Export first if needed. This cannot be undone.`}
          actions={busy === 'delete' ? [] : [
            ...(hasCloudIdentity
              ? [{
                label: connected ? 'Delete cloud account and this device' : 'Delete guest identity and this device',
                variant: 'ember' as const,
                onPress: () => void run('delete', async () => { await props.onDelete(true); }, 'Everything was deleted.'),
              }]
              : []),
            {
              label: hasCloudIdentity ? 'Delete this device only' : 'Delete this device',
              variant: 'ember' as const,
              onPress: () => void run('delete', async () => { await props.onDelete(false); }, 'Device data was deleted.'),
            },
            { label: 'Cancel', variant: 'outline' as const, onPress: () => setDeleteSheet(false) },
          ]}
          onClose={() => busy === 'delete' ? undefined : setDeleteSheet(false)}
          blocking={busy === 'delete'}
        >
          {busy === 'delete' ? <ActivityIndicator color={colors.ember} style={styles.deleteSpinner} /> : null}
        </BottomSheet>
      </Screen>

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  title: { ...textStyles.title, marginBottom: 8 },
  devNote: { ...textStyles.caption, marginTop: 2, lineHeight: 17 },
  sectionLabel: { ...textStyles.eyebrow, fontSize: 11, marginTop: 26, marginBottom: 10 },
  group: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: surfaces.card,
    ...shadows.soft,
    shadowOpacity: 0.08,
  },
  row: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  // Removes the divider that used to hang under the final row of every group.
  lastRow: { borderBottomWidth: 0 },
  pressed: { backgroundColor: 'rgba(190,111,124,0.06)' },
  rowIcon: {
    flexShrink: 0,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239,188,195,0.26)',
  },
  dangerIcon: { backgroundColor: 'rgba(168,79,97,0.12)' },
  rowCopy: { flex: 1, minWidth: 0 },
  switch: { flexShrink: 0 },
  rowTitle: {
    color: colors.bone,
    fontFamily: typography.serifMedium,
    fontSize: 16,
  },
  rowDetail: {
    ...textStyles.caption,
    marginTop: 2,
  },
  dangerText: { color: colors.ember },
  previewGroup: { gap: 8 },
  previewNotice: {
    marginBottom: 12,
    padding: 14,
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(184,134,53,0.34)',
    borderRadius: radii.md,
    backgroundColor: 'rgba(184,134,53,0.09)',
  },
  previewNoticeTitle: {
    color: colors.brassText,
    fontFamily: typography.sans,
    fontWeight: weight.semibold,
    fontSize: 14,
  },
  previewNoticeBody: { ...textStyles.bodySmall, fontSize: 13, lineHeight: 19 },
  version: {
    ...textStyles.caption,
    color: colors.boneFaint,
    fontFamily: typography.mono,
    fontSize: 11,
    letterSpacing: 1,
    textAlign: 'center',
    marginTop: 34,
  },
  deleteSpinner: { marginVertical: 12 },
});
