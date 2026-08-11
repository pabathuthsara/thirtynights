import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import {
  Check,
  ChevronRight,
  CloudUpload,
  Database,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  UserRound,
} from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { Button, TextButton } from '@/components/Buttons';
import { Screen, Stagger } from '@/components/Screen';
import type { ReflectionReadiness } from '@/domain/conversion';
import { trackAnalyticsEvent } from '@/services/analytics';
import { colors, gradients, radii, shadows, surfaces, textStyles, typography, weight } from '@/theme';
import type { AuthState } from '@/types';

const disclosureRows = [
  {
    icon: Database,
    title: 'What leaves this phone',
    body: 'Your raw voice recordings and the night and date attached to each answer.',
  },
  {
    icon: CloudUpload,
    title: 'Where it is stored',
    body: 'Supabase securely stores the recordings for your private account.',
  },
  {
    icon: Sparkles,
    title: 'Where it is processed',
    body: 'OpenAI transcribes your recordings and creates your private reflections from those transcripts.',
  },
  {
    icon: LockKeyhole,
    title: 'How it is protected',
    body: 'Encrypted in transit and at rest, but not end-to-end encrypted. Nothing uploads until you choose this.',
  },
] as const;

export function ReflectionSetupScreen({
  readiness,
  authState,
  processingConsent,
  backupNetwork,
  syncing,
  onBack,
  onAuth,
  onConsent,
  onSync,
  onUseCellular,
  onOpenReport,
  onPrivacy,
  onShown,
}: {
  readiness: ReflectionReadiness;
  authState: AuthState;
  processingConsent: boolean;
  backupNetwork: 'wifi-only' | 'wifi-and-cellular';
  syncing: boolean;
  onBack: () => void;
  onAuth: () => void;
  onConsent: () => void;
  onSync: () => void;
  onUseCellular: () => void;
  onOpenReport: () => void;
  onPrivacy: () => void;
  onShown?: () => void;
}) {
  const shown = useRef(false);
  const accepted = useRef(false);
  const connected = authState === 'authenticated';
  const accountDone = connected;
  const consentDone = processingConsent;
  const backupDone = readiness.unbackedCount === 0 && readiness.recordedCount > 0;
  const setupNight = readiness.recordedCount >= 7 ? 7 : readiness.recordedCount >= 6 ? 6 : readiness.recordedCount >= 3 ? 3 : 1;
  const firstReflection = readiness.checkpoint === 7;
  const reflectionName = firstReflection ? 'first reflection' : `night-${readiness.checkpoint} reflection`;

  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    trackAnalyticsEvent('report_setup_viewed', { afterNight: setupNight });
    onShown?.();
  }, [onShown, setupNight]);

  const primary = (() => {
    if (!connected) return { label: 'Create account and prepare my reflection', action: onAuth, icon: UserRound };
    if (!processingConsent) return { label: 'I agree — enable reflection processing', action: onConsent, icon: ShieldCheck };
    if (readiness.state === 'ready') return { label: 'Open my reflection', action: onOpenReport, icon: Sparkles };
    if (readiness.state === 'processing') return { label: 'Check progress', action: onSync, icon: CloudUpload };
    if (readiness.state === 'prepared') return { label: 'Done — return home', action: onBack, icon: Check };
    return { label: readiness.state === 'attention' ? 'Retry secure backup' : 'Back up now', action: onSync, icon: CloudUpload };
  })();

  return (
    <Screen header={<AppHeader label="REFLECTION SETUP" onBack={onBack} />} contentStyle={styles.screen}>
      <Stagger index={0}>
        <Text style={styles.aside}>Before your {reflectionName}</Text>
        <Text accessibilityRole="header" style={styles.title}>
          {firstReflection ? 'Prepare your seven-night reflection.' : `Prepare your night-${readiness.checkpoint} reflection.`}
        </Text>
        <Text style={styles.body}>
          {readiness.recordedCount === 1 ? 'Your recording is' : 'Your recordings are'} safe on this phone. To create this reflection, Thirty Nights needs a recoverable account, secure backup, and your explicit permission to process it.
        </Text>
      </Stagger>

      <Stagger index={1}>
        <View style={styles.disclosureCard}>
          <LinearGradient colors={gradients.cardSheen} style={styles.sheen} pointerEvents="none" />
          {disclosureRows.map(({ icon: Icon, title, body }) => (
            <View key={title} style={styles.disclosureRow}>
              <View style={styles.iconCircle}><Icon size={17} strokeWidth={1.9} color={colors.roseText} /></View>
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>{title}</Text>
                <Text style={styles.rowBody}>{body}</Text>
              </View>
            </View>
          ))}
          <Text style={styles.retention}>
            Withdrawing permission stops future uploads and AI processing. Already uploaded data remains in your private account until you use Delete everything. See the Privacy Policy for the reviewed retention terms.
          </Text>
          <TextButton onPress={onPrivacy}>Read the Privacy Policy</TextButton>
        </View>
      </Stagger>

      <Stagger index={2}>
        <Text style={styles.sectionLabel}>YOUR SETUP</Text>
        <View style={styles.checklist}>
          <SetupRow done={accountDone} title="Recoverable account" detail={accountDone ? 'Connected' : 'Keeps purchases and backup attached to you'} />
          <SetupRow done={consentDone} title="Reflection processing permission" detail={consentDone ? 'Permission given' : 'A separate, affirmative choice'} />
          <SetupRow
            done={backupDone}
            active={syncing || readiness.state === 'uploading'}
            title="Secure recording backup"
            detail={backupDone
              ? `${readiness.backedUpCount} ${readiness.backedUpCount === 1 ? 'night' : 'nights'} ready`
              : `${readiness.unbackedCount} of ${readiness.recordedCount} waiting${backupNetwork === 'wifi-only' ? ' · Wi-Fi only' : ''}`}
          />
        </View>
      </Stagger>

      <Stagger index={3} style={styles.actions}>
        <Button
          icon={primary.icon}
          loading={syncing}
          onPress={() => {
            if (!accepted.current) {
              accepted.current = true;
              trackAnalyticsEvent('report_setup_accepted', { afterNight: setupNight });
            }
            primary.action();
          }}
        >
          {primary.label}
        </Button>
        {connected && processingConsent && readiness.unbackedCount > 0 && backupNetwork === 'wifi-only' ? (
          <Button variant="outline" onPress={onUseCellular}>Allow cellular for this backup</Button>
        ) : null}
        <Text style={styles.safeClose}>
          {readiness.state === 'prepared'
            ? 'Setup is complete. Your reflection will be prepared from the recordings included in this checkpoint.'
            : 'You can close this at any time. Your recordings stay on this phone and tonight’s ritual remains available.'}
        </Text>
        {readiness.state !== 'prepared' ? (
          <TextButton onPress={() => {
            trackAnalyticsEvent('report_setup_deferred', { afterNight: setupNight });
            onBack();
          }}>
            Keep this night on my phone for now
          </TextButton>
        ) : null}
      </Stagger>
    </Screen>
  );
}

function SetupRow({ done, active = false, title, detail }: { done: boolean; active?: boolean; title: string; detail: string }) {
  return (
    <View style={styles.setupRow}>
      <View style={[styles.check, done && styles.checkDone, active && styles.checkActive]}>
        {done ? <Check size={13} strokeWidth={3} color={colors.white} /> : active ? <View style={styles.activeDot} /> : null}
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.setupTitle}>{title}</Text>
        <Text style={styles.setupDetail}>{detail}</Text>
      </View>
    </View>
  );
}

export function PurchaseSuccessScreen({ plan, onContinue }: { plan: 'paid30' | 'paid90'; onContinue: () => void }) {
  useEffect(() => {
    trackAnalyticsEvent('purchase_success_screen_viewed', { plan });
  }, [plan]);

  return (
    <Screen contentStyle={styles.successScreen}>
      <Stagger index={0} style={styles.successMark}>
        <View style={styles.successGlow} />
        <View style={styles.successSeal}><Check size={34} strokeWidth={2.6} color={colors.white} /></View>
      </Stagger>
      <Stagger index={1} style={styles.successCopy}>
        <Text style={styles.aside}>Your chapter continues</Text>
        <Text accessibilityRole="header" style={styles.successTitle}>Nights 8–30 are open.</Text>
        <Text style={styles.successBody}>
          Your first seven nights are already part of the same chapter. Night 8 is your next destination, ready on its scheduled date.
        </Text>
      </Stagger>
      <Stagger index={2} style={styles.actions}>
        <Button right={<ChevronRight size={18} strokeWidth={2.4} color={colors.white} />} onPress={onContinue}>Go to Night 8</Button>
      </Stagger>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: 24, paddingBottom: 32 },
  aside: { color: colors.paperDim, fontFamily: typography.serifItalic, fontSize: 17 },
  title: { ...textStyles.title, fontSize: 38, lineHeight: 45, marginTop: 10 },
  body: { ...textStyles.bodySmall, fontSize: 16, lineHeight: 25, marginTop: 12 },
  disclosureCard: {
    gap: 16,
    padding: 20,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: 'rgba(184,134,53,0.22)',
    backgroundColor: surfaces.card,
    overflow: 'hidden',
    ...shadows.soft,
  },
  sheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 80 },
  disclosureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239,188,195,0.28)',
  },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { color: colors.bone, fontFamily: typography.serifMedium, fontSize: 16, lineHeight: 21 },
  rowBody: { ...textStyles.bodySmall, fontSize: 13.5, lineHeight: 20, marginTop: 2 },
  retention: {
    ...textStyles.caption,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    fontSize: 12.5,
    lineHeight: 19,
  },
  sectionLabel: { ...textStyles.eyebrow, fontSize: 11, marginBottom: 10 },
  checklist: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: surfaces.cardSoft,
    padding: 18,
    gap: 16,
  },
  setupRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkDone: { backgroundColor: colors.mossText, borderColor: colors.mossText },
  checkActive: { borderColor: colors.brass },
  activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brass },
  setupTitle: { color: colors.bone, fontFamily: typography.sans, fontWeight: weight.semibold, fontSize: 14, lineHeight: 19 },
  setupDetail: { ...textStyles.caption, marginTop: 2 },
  actions: { alignItems: 'center', gap: 10 },
  safeClose: { ...textStyles.caption, textAlign: 'center', maxWidth: 330, marginTop: 4 },
  successScreen: { justifyContent: 'center', gap: 32, paddingBottom: 36 },
  successMark: { alignItems: 'center', justifyContent: 'center', height: 170 },
  successGlow: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: 'rgba(239,188,195,0.22)',
  },
  successSeal: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.roseDeep,
    borderWidth: 6,
    borderColor: colors.blush,
    ...shadows.floating,
  },
  successCopy: { alignItems: 'center' },
  successTitle: { ...textStyles.title, textAlign: 'center', marginTop: 10 },
  successBody: { ...textStyles.bodySmall, fontSize: 16, lineHeight: 25, textAlign: 'center', marginTop: 12, maxWidth: 360 },
});
