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
  onBack: () => void;
  onAuth: () => void;
  onEditReminder: () => void;
  onToggleNotifications: (enabled: boolean) => void;
  onToggleNudge: (enabled: boolean) => void;
  onBackupNetwork: (network: 'wifi-only' | 'wifi-and-cellular') => void;
  onEnableProcessing: () => void;
  onSync: () => Promise<void>;
  onRestore: () => void;
  onExport: () => Promise<void>;
  onPrivacy: () => void;
  onTerms: () => void;
  onSupport: () => void;
  onWebDelete: () => void;
  onPreview: (mode: 'empty' | 'partial' | 'complete') => void;
  onPopupCatalog: () => void;
  onPreviewSealing: () => void;
  onDelete: (remote: boolean) => Promise<void>;
};

export function SettingsScreen(props: SettingsProps) {
  const [deleteSheet, setDeleteSheet] = useState(false);
  const [backupSheet, setBackupSheet] = useState(false);
  const [accountSheet, setAccountSheet] = useState(false);
  const [busy, setBusy] = useState<'sync' | 'export' | 'delete' | null>(null);
  const [toast, setToast] = useState<ToastMessage>(null);

  const formattedHour = formatClock(props.reminderHour, props.reminderMinute);
  const connected = props.authState === 'authenticated';
  const hasCloudIdentity = props.authState !== 'local';
  const version = (Constants.expoConfig?.version ?? '1.0.0');

  const run = async (key: 'sync' | 'export' | 'delete', operation: () => Promise<void>, success: string) => {
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
              detail={`Your question arrives at ${formattedHour}`}
              onPress={props.onEditReminder}
            />
            <SwitchRow
              icon={BellRing}
              title="Notifications"
              detail="One local question reminder a day"
              value={props.notificationsEnabled}
              onValueChange={props.onToggleNotifications}
            />
            <SwitchRow
              icon={MoonStar}
              title="Thirty-minute nudge"
              detail="A single gentle follow-up. Off by default."
              value={props.gentleNudge}
              onValueChange={props.onToggleNudge}
              last
            />
          </View>
        </Stagger>

        <Stagger index={2}>
          <Text style={styles.sectionLabel}>APPEARANCE</Text>
          <View style={styles.group}>
            <Row icon={Palette} title="Soft Keepsake" detail="Warm paper, blush, rose gold · Included" />
            <Row icon={Flower2} title="Keepsake Classics" detail="The current sticker collection" last />
          </View>
        </Stagger>

        <Stagger index={3}>
          <Text style={styles.sectionLabel}>ACCOUNT &amp; BACKUP</Text>
          <View style={styles.group}>
            <Row
              icon={UserRound}
              title={connected ? 'Account connected' : 'Create or connect an account'}
              detail={connected ? props.email || 'Permanent cloud identity' : 'Required for purchase and raw-audio backup'}
              onPress={connected ? () => setAccountSheet(true) : props.onAuth}
            />
            <Row
              icon={CloudUpload}
              title="Recording backup"
              detail={!connected
                ? 'Local to this device'
                : !props.processingConsent
                  ? 'Cloud processing consent required'
                  : `${props.backupNetwork === 'wifi-only' ? 'Wi-Fi only' : 'Wi-Fi and cellular'} · ${props.unbackedCount} waiting`}
              onPress={() => connected ? setBackupSheet(true) : props.onAuth()}
            />
            <Row
              icon={RefreshCw}
              title={props.syncing ? 'Synchronizing…' : 'Synchronize now'}
              detail={props.unbackedCount
                ? `${props.unbackedCount} recording${props.unbackedCount === 1 ? '' : 's'} not backed up`
                : 'Metadata and reports are up to date locally'}
              busy={busy === 'sync'}
              onPress={() => void run('sync', props.onSync, 'Everything is synchronized.')}
            />
            <Row
              icon={ReceiptText}
              title="Restore purchases"
              detail="Access opens after server verification"
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
              detail="Metadata, reports, and device-resident raw audio"
              busy={busy === 'export'}
              onPress={() => void run('export', props.onExport, 'Your export is ready to share.')}
            />
            <Row icon={ShieldCheck} title="Privacy policy" onPress={props.onPrivacy} />
            <Row icon={FileText} title="Terms of use" onPress={props.onTerms} />
            <Row icon={LifeBuoy} title="Support" onPress={props.onSupport} />
            <Row
              icon={Globe}
              title="Web deletion request"
              detail="For access when this app cannot be opened"
              onPress={props.onWebDelete}
            />
            <Row
              icon={Trash2}
              title="Delete everything"
              detail={connected ? 'Cloud account and this device, or this device only' : 'Delete all data on this device'}
              danger
              last
              onPress={() => setDeleteSheet(true)}
            />
          </View>
        </Stagger>

        {props.showDeveloperControls ? (
          <Stagger index={5}>
            <Text style={styles.sectionLabel}>DEVELOPER PREVIEWS</Text>
            <View style={styles.previewGroup}>
              <Button variant="outline" onPress={() => props.onPreview('empty')}>Empty month</Button>
              <Button variant="outline" onPress={() => props.onPreview('partial')}>Twelve-night month</Button>
              <Button variant="outline" onPress={() => props.onPreview('complete')}>Opened report state</Button>
              <Button variant="outline" onPress={props.onPopupCatalog}>Supporting state catalog</Button>
              <Button variant="outline" onPress={props.onPreviewSealing}>Sealing ceremony</Button>
            </View>
          </Stagger>
        ) : null}

        <Text style={styles.version}>THIRTY NIGHTS · VERSION {version}</Text>

        <BottomSheet
          visible={accountSheet}
          title="Your account"
          body={`${props.email || 'A permanent cloud identity is linked to this device.'}\n\nThis identity owns your purchases and any backed-up recordings. Signing out is deliberately not offered — your recordings live on this device, and detaching them from their owner is the one thing that cannot be undone safely. To move on, export first and then delete.`}
          actions={[{ label: 'Understood', variant: 'outline', onPress: () => setAccountSheet(false) }]}
          onClose={() => setAccountSheet(false)}
        />

        <BottomSheet
          visible={backupSheet}
          title="Private cloud backup"
          body="When enabled, recordings are sent securely to the configured storage provider and may be processed by configured AI vendors to create your reports. This is encrypted in transit and at rest, but it is not end-to-end encrypted."
          actions={[
            ...(!props.processingConsent
              ? [{ label: 'I agree — enable processing', onPress: () => { props.onEnableProcessing(); setBackupSheet(false); } }]
              : []),
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
            ? 'Removing your recordings and reports. Please keep the app open.'
            : `This permanently removes recordings, dates, and reports from the selected locations. Purchase records held by ${Platform.OS === 'android' ? 'Google Play' : 'the App Store'} are not erased. Export first if you need a copy. This cannot be undone.`}
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
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239,188,195,0.26)',
  },
  dangerIcon: { backgroundColor: 'rgba(168,79,97,0.12)' },
  rowCopy: { flex: 1 },
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
