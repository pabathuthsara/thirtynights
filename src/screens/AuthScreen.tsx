import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Apple, AtSign, CheckCircle2, LockKeyhole, Mail, ShieldCheck } from 'lucide-react-native';

import { AppHeader } from '@/components/AppHeader';
import { Button, TextButton } from '@/components/Buttons';
import { Screen, Stagger } from '@/components/Screen';
import {
  beginAnonymousEmailUpgrade,
  completeAnonymousEmailUpgrade,
  getAnonymousEmailUpgradeState,
  isSupabaseConfigured,
  linkNativeAppleIdentity,
  linkOAuthIdentity,
  ProviderUnavailableError,
  resendAnonymousEmailUpgrade,
  signInNativeAppleIdentity,
  signInWithEmail,
  signInWithOAuthProvider,
  subscribeToEmailUpgrade,
} from '@/lib/supabase';
import { colors, radii, shadows, surfaces, textStyles, typography, weight } from '@/theme';
import { trackAnalyticsEvent, type AccountMethod } from '@/services/analytics';

export function AuthScreen({ hasLocalRecordings, onBack, onAuthenticated, onUnavailable }: {
  hasLocalRecordings: boolean;
  onBack: () => void;
  onAuthenticated: (email?: string, ownerId?: string) => void | Promise<void>;
  onUnavailable: (provider: 'Apple Sign-In' | 'Google Sign-In' | 'Email authentication') => void;
}) {
  const [mode, setMode] = useState<'signup' | 'signin'>('signup');
  const [signupStep, setSignupStep] = useState<'email' | 'verify-email' | 'set-password'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [focused, setFocused] = useState<'email' | 'password' | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const field = useRef<TextInput>(null);

  useEffect(() => {
    let active = true;
    const applyUpgradeState = (state: Awaited<ReturnType<typeof getAnonymousEmailUpgradeState>>) => {
      if (!active || !state) return;
      setMode('signup');
      setEmail(state.email);
      setPassword('');
      setSignupStep(state.step);
      setError('');
      setNotice(state.step === 'set-password'
        ? 'Email verified. Create your password to finish securing this same account.'
        : 'We sent a verification link. Open it on this device, then return here.');
    };

    const unsubscribe = subscribeToEmailUpgrade((state, upgradeError) => {
      if (!active) return;
      if (upgradeError) {
        setError(upgradeError.message);
        return;
      }
      applyUpgradeState(state);
    });
    if (mode === 'signup') {
      void getAnonymousEmailUpgradeState()
        .then(applyUpgradeState)
        .catch((caught: unknown) => {
          if (active) setError(caught instanceof Error ? caught.message : 'Account setup could not be restored.');
        });
    }
    return () => {
      active = false;
      unsubscribe();
    };
  }, [mode]);

  const trackAccountFailure = (method: AccountMethod) => trackAnalyticsEvent('account_failed', { method });

  const validEmail = () => {
    if (/^\S+@\S+\.\S+$/.test(email.trim())) return true;
    setError("That doesn't look like an email address.");
    return false;
  };

  const validPassword = () => {
    if (password.length >= 8) return true;
    setError('Use at least 8 characters for your password.');
    return false;
  };

  const submit = async () => {
    setError('');
    setNotice('');
    if (mode === 'signin' && (!validEmail() || !validPassword())) return;
    if (mode === 'signup' && signupStep === 'email' && !validEmail()) return;
    if (mode === 'signup' && signupStep === 'set-password' && !validPassword()) return;
    if (mode === 'signin' && hasLocalRecordings) {
      setError('This phone has unmerged recordings. Sign-in is stopped to avoid changing their owner. Link a new identity instead, or contact support for a reviewed merge.');
      return;
    }
    if (!isSupabaseConfigured) {
      onUnavailable('Email authentication');
      return;
    }
    try {
      setLoading(true);
      if (mode === 'signup') {
        if (signupStep === 'email') {
          trackAnalyticsEvent('account_started', { method: 'email' });
          const state = await beginAnonymousEmailUpgrade(email);
          setEmail(state.email);
          setPassword('');
          setSignupStep(state.step);
          setNotice(state.step === 'set-password'
            ? 'Email verified. Create your password to finish securing this same account.'
            : 'Verification sent. Open the link in your email on this device.');
          return;
        }
        if (signupStep === 'verify-email') {
          const state = await getAnonymousEmailUpgradeState();
          if (!state) throw new Error('Start the email-linking step again.');
          setEmail(state.email);
          setSignupStep(state.step);
          setNotice(state.step === 'set-password'
            ? 'Email verified. Create your password to finish securing this same account.'
            : 'That email is still waiting for verification. Open the newest link and return here.');
          return;
        }
        // The password exists only in component memory for this final request.
        const user = await completeAnonymousEmailUpgrade(password);
        setPassword('');
        await onAuthenticated(user.email, user.id);
      } else {
        const user = await signInWithEmail(email.trim(), password);
        if (user) await onAuthenticated(user.email, user.id);
      }
      trackAnalyticsEvent('account_completed', { method: 'email' });
    } catch (caught) {
      trackAccountFailure('email');
      const message = caught instanceof Error ? caught.message : "Couldn't finish signing in.";
      setError(message.toLowerCase().includes('invalid login') ? "That password doesn't match. Try again or reset it." : message);
    } finally {
      setLoading(false);
    }
  };

  const resendVerification = async () => {
    if (loading) return;
    setError('');
    setNotice('');
    try {
      setLoading(true);
      const state = await resendAnonymousEmailUpgrade();
      setSignupStep(state.step);
      setNotice(state.step === 'set-password'
        ? 'Your email is already verified. Create your password below.'
        : 'A fresh verification link is on its way. Use the newest email.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'A new verification email could not be sent.');
    } finally {
      setLoading(false);
    }
  };

  const useDifferentEmail = () => {
    if (loading) return;
    setError('');
    setNotice('');
    setPassword('');
    // Keep the prior non-secret marker until Supabase accepts the replacement.
    // This avoids losing a just-confirmed identity during an app/network race.
    setEmail('');
    setSignupStep('email');
    requestAnimationFrame(() => field.current?.focus());
  };

  const continueWithApple = async () => {
    if (loading) return;
    setError('');
    if (!isSupabaseConfigured) {
      onUnavailable('Apple Sign-In');
      return;
    }
    try {
      setLoading(true);
      trackAnalyticsEvent('account_started', { method: 'apple' });
      if (mode === 'signin' && hasLocalRecordings) throw new Error('Provider recovery is stopped while this device owns unmerged recordings.');
      const user = Platform.OS === 'ios'
        ? mode === 'signin' ? await signInNativeAppleIdentity() : await linkNativeAppleIdentity()
        : mode === 'signin' ? await signInWithOAuthProvider('apple') : await linkOAuthIdentity('apple');
      if (user) {
        await onAuthenticated(user.email, user.id);
        trackAnalyticsEvent('account_completed', { method: 'apple' });
      }
    } catch (caught) {
      trackAccountFailure('apple');
      // A provider that was never switched on in the backend is an owner-setup
      // problem, not something the person holding the phone can fix by trying
      // again. Route it to the same explanation the rest of the app uses.
      if (caught instanceof ProviderUnavailableError) {
        onUnavailable('Apple Sign-In');
        return;
      }
      setError(caught instanceof Error ? caught.message : "Couldn't connect Apple.");
    } finally {
      setLoading(false);
    }
  };

  const continueWithGoogle = async () => {
    if (loading) return;
    setError('');
    setNotice('');
    if (!isSupabaseConfigured) {
      onUnavailable('Google Sign-In');
      return;
    }
    try {
      setLoading(true);
      trackAnalyticsEvent('account_started', { method: 'google' });
      // Linking keeps the anonymous user id that already owns local metadata.
      // Signing into a different identity is never allowed while this device
      // has recordings that have not gone through a reviewed merge.
      if (mode === 'signin' && hasLocalRecordings) {
        throw new Error('Provider recovery is stopped while this device owns unmerged recordings.');
      }
      const user = mode === 'signin'
        ? await signInWithOAuthProvider('google')
        : await linkOAuthIdentity('google');
      if (user) {
        await onAuthenticated(user.email, user.id);
        trackAnalyticsEvent('account_completed', { method: 'google' });
      }
    } catch (caught) {
      trackAccountFailure('google');
      if (caught instanceof ProviderUnavailableError) {
        onUnavailable('Google Sign-In');
        return;
      }
      setError(caught instanceof Error ? caught.message : "Couldn't connect Google.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen avoidKeyboard keyboardShouldPersistTaps="handled" header={<AppHeader onBack={onBack} />}>
      <Stagger index={0} style={styles.heading}>
        <Text accessibilityRole="header" style={styles.title}>Keep your nights safe.</Text>
        <Text style={styles.body}>
          Linking an account keeps the same identity, and attaches purchased chapters and backups to it.
        </Text>
      </Stagger>

      <Stagger index={1} style={styles.stack}>
        {mode === 'signin' || signupStep === 'email' ? (
          <>
            {Platform.OS !== 'ios' ? (
              <Button icon={AtSign} variant="paper" disabled={loading} onPress={() => void continueWithGoogle()}>
                Continue with Google
              </Button>
            ) : null}

            {Platform.OS === 'ios' ? (
              <View style={loading ? styles.providerBusy : undefined} pointerEvents={loading ? 'none' : 'auto'}>
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                  cornerRadius={radii.lg}
                  style={styles.appleButton}
                  onPress={() => void continueWithApple()}
                />
              </View>
            ) : (
              <Button icon={Apple} variant="outline" disabled={loading} onPress={() => void continueWithApple()}>
                Continue with Apple
              </Button>
            )}

            <View style={styles.orRow}>
              <View style={styles.line} />
              <Text style={styles.or}>or</Text>
              <View style={styles.line} />
            </View>
          </>
        ) : null}

        {mode === 'signin' || signupStep === 'email' ? (
          <View style={[styles.fieldWrap, focused === 'email' && styles.fieldFocused, Boolean(error) && styles.fieldError]}>
            <Mail size={18} strokeWidth={1.9} color={focused === 'email' ? colors.roseText : colors.boneFaint} />
            <TextInput
              ref={field}
              accessibilityLabel="Email address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              keyboardType="email-address"
              inputMode="email"
              returnKeyType="go"
              onSubmitEditing={() => void submit()}
              placeholder="you@example.com"
              placeholderTextColor={colors.boneFaint}
              value={email}
              onChangeText={(value) => { setEmail(value); if (error) setError(''); }}
              onFocus={() => setFocused('email')}
              onBlur={() => setFocused(null)}
              style={styles.field}
            />
          </View>
        ) : (
          <View
            accessible
            accessibilityLabel={`${signupStep === 'set-password' ? 'Verified email' : 'Verification sent to'} ${email}`}
            style={styles.verifiedEmail}
          >
            {signupStep === 'set-password'
              ? <CheckCircle2 size={19} strokeWidth={2} color={colors.mossText} />
              : <Mail size={19} strokeWidth={2} color={colors.brassText} />}
            <View style={styles.verifiedEmailCopy}>
              <Text style={styles.verifiedEmailLabel}>{signupStep === 'set-password' ? 'Verified email' : 'Verification sent to'}</Text>
              <Text style={styles.verifiedEmailAddress}>{email}</Text>
            </View>
          </View>
        )}

        {mode === 'signin' || signupStep === 'set-password' ? (
          <View style={[styles.fieldWrap, focused === 'password' && styles.fieldFocused, Boolean(error) && styles.fieldError]}>
            <LockKeyhole size={18} strokeWidth={1.9} color={focused === 'password' ? colors.roseText : colors.boneFaint} />
            <TextInput
              accessibilityLabel={mode === 'signup' ? 'Create password' : 'Password'}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              textContentType={mode === 'signup' ? 'newPassword' : 'password'}
              secureTextEntry
              returnKeyType="go"
              onSubmitEditing={() => void submit()}
              placeholder={mode === 'signup' ? 'Create a password' : 'Password'}
              placeholderTextColor={colors.boneFaint}
              value={password}
              onChangeText={(value) => { setPassword(value); if (error) setError(''); }}
              onFocus={() => setFocused('password')}
              onBlur={() => setFocused(null)}
              style={styles.field}
            />
          </View>
        ) : null}

        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}

        <Button loading={loading} onPress={() => void submit()}>
          {mode === 'signin'
            ? 'Sign in'
            : signupStep === 'email'
              ? 'Send verification email'
              : signupStep === 'verify-email'
                ? "I've verified my email"
                : 'Set password & continue'}
        </Button>

        {mode === 'signup' && signupStep === 'verify-email' ? (
          <View
            pointerEvents={loading ? 'none' : 'auto'}
            style={[styles.verificationActions, loading && styles.verificationActionsBusy]}
          >
            <TextButton onPress={() => void resendVerification()}>Resend email</TextButton>
            <TextButton onPress={useDifferentEmail}>Use a different email</TextButton>
          </View>
        ) : null}

        {!hasLocalRecordings ? (
          <View style={styles.switchMode}>
            <Text style={styles.switchCopy}>{mode === 'signin' ? 'Need an account?' : 'Already have an account?'}</Text>
            <TextButton onPress={() => { setError(''); setNotice(''); setPassword(''); setMode((value) => value === 'signin' ? 'signup' : 'signin'); }}>
              {mode === 'signin' ? 'Link this device' : 'Sign in'}
            </TextButton>
          </View>
        ) : (
          <Text style={styles.recovery}>
            Existing-account sign-in is disabled while this device owns recordings that have not been deliberately merged.
          </Text>
        )}
      </Stagger>

      <Stagger index={2} style={styles.privacyCard}>
        <ShieldCheck size={17} strokeWidth={2} color={colors.mossText} />
        <Text style={styles.privacy}>
          Raw audio stays on this device until your identity is recoverable. Cloud processing is used only after you consent, and only to write your reflections.
        </Text>
      </Stagger>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { marginTop: 8, marginBottom: 30 },
  title: { ...textStyles.title, fontSize: 37, lineHeight: 44 },
  body: { ...textStyles.bodySmall, fontSize: 16, lineHeight: 25, marginTop: 12 },
  stack: {
    gap: 12,
    padding: 18,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
    backgroundColor: surfaces.card,
    ...shadows.floating,
    shadowOpacity: 0.1,
  },
  providerBusy: { opacity: 0.5 },
  appleButton: { width: '100%', height: 56 },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 6 },
  line: { flex: 1, height: 1, backgroundColor: colors.line },
  or: { ...textStyles.caption, color: colors.boneFaint, fontFamily: typography.serifItalic, fontSize: 14 },
  fieldWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 56,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    borderRadius: radii.md,
    backgroundColor: colors.white,
  },
  fieldFocused: { borderColor: colors.roseDeep },
  fieldError: { borderColor: colors.ember },
  field: {
    flex: 1,
    minHeight: 56,
    color: colors.bone,
    fontFamily: typography.sans,
    fontWeight: weight.medium,
    fontSize: 16,
  },
  verifiedEmail: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(90,116,98,0.24)',
    borderRadius: radii.md,
    backgroundColor: surfaces.success,
  },
  verifiedEmailCopy: { flex: 1, minWidth: 0 },
  verifiedEmailLabel: { ...textStyles.caption, color: colors.mossText, fontSize: 12, lineHeight: 17 },
  verifiedEmailAddress: {
    color: colors.bone,
    fontFamily: typography.sans,
    fontWeight: weight.semibold,
    fontSize: 15,
    lineHeight: 21,
  },
  error: { ...textStyles.bodySmall, color: colors.ember, fontSize: 14 },
  notice: { ...textStyles.bodySmall, color: colors.mossText, fontSize: 14 },
  verificationActions: {
    minHeight: 44,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-around',
    columnGap: 18,
    rowGap: 8,
  },
  verificationActionsBusy: { opacity: 0.5 },
  switchMode: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 },
  switchCopy: { ...textStyles.bodySmall, flexShrink: 1, fontSize: 14, textAlign: 'center' },
  recovery: { ...textStyles.caption, color: colors.brassText, textAlign: 'center', marginTop: 4 },
  privacyCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    marginTop: 28,
    padding: 16,
    borderRadius: radii.md,
    backgroundColor: surfaces.success,
    borderWidth: 1,
    borderColor: 'rgba(90,116,98,0.2)',
  },
  privacy: {
    flex: 1,
    ...textStyles.caption,
    fontSize: 13,
    lineHeight: 19,
    color: colors.boneDim,
  },
});
