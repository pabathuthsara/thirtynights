import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CheckCircle2, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from 'lucide-react-native';

import { AppHeader } from '@/components/AppHeader';
import { Button, TextButton } from '@/components/Buttons';
import { Screen, Stagger } from '@/components/Screen';
import {
  cancelPasswordRecovery,
  completePasswordRecovery,
  getPasswordRecoveryState,
  isSupabaseConfigured,
  linkEmailPassword,
  sendPasswordReset,
  signInWithEmail,
  subscribeToPasswordRecovery,
} from '@/lib/supabase';
import { colors, radii, shadows, surfaces, textStyles, typography, weight } from '@/theme';
import { trackAnalyticsEvent } from '@/services/analytics';

export function AuthScreen({ hasLocalRecordings, onBack, onAuthenticated, onUnavailable }: {
  hasLocalRecordings: boolean;
  onBack: () => void;
  onAuthenticated: (email?: string, ownerId?: string) => void | Promise<void>;
  onUnavailable: (provider: 'Email authentication') => void;
}) {
  const [mode, setMode] = useState<'signup' | 'signin' | 'recovery'>('signup');
  const [recoveryStep, setRecoveryStep] = useState<'email' | 'email-sent' | 'set-password'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [focused, setFocused] = useState<'email' | 'password' | null>(null);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const field = useRef<TextInput>(null);
  const passwordField = useRef<TextInput>(null);

  useEffect(() => {
    let active = true;
    const applyRecoveryState = (state: Awaited<ReturnType<typeof getPasswordRecoveryState>>) => {
      if (!active || !state) return;
      setMode('recovery');
      setEmail(state.email);
      setPassword('');
      setRecoveryStep(state.step);
      setError('');
      setNotice(state.step === 'set-password'
        ? 'Reset link verified. Choose a new password.'
        : 'If the account exists, a reset link is on its way. Open it here.');
    };

    const unsubscribeRecovery = subscribeToPasswordRecovery((state, recoveryError) => {
      if (!active) return;
      if (recoveryError) {
        setError(recoveryError.message);
        return;
      }
      applyRecoveryState(state);
    });
    void (async () => {
      try {
        const recovery = await getPasswordRecoveryState();
        if (recovery) applyRecoveryState(recovery);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : 'Account setup could not be restored.');
      }
    })();
    return () => {
      active = false;
      unsubscribeRecovery();
    };
  }, [mode]);

  const trackAccountFailure = () => trackAnalyticsEvent('account_failed', { method: 'email' });

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
    if (mode === 'signup' && (!validEmail() || !validPassword())) return;
    if (mode === 'recovery' && recoveryStep === 'email' && !validEmail()) return;
    if (mode === 'recovery' && recoveryStep === 'set-password' && !validPassword()) return;
    if (mode !== 'signup' && hasLocalRecordings) {
      setError('This phone has unmerged recordings. Create a new account here or contact support before signing in.');
      return;
    }
    if (!isSupabaseConfigured) {
      onUnavailable('Email authentication');
      return;
    }
    try {
      setLoading(true);
      if (mode === 'signup') {
        trackAnalyticsEvent('account_started', { method: 'email' });
        // The password exists only in component memory for this request.
        const user = await linkEmailPassword(email, password);
        setPassword('');
        await onAuthenticated(user.email, user.id);
      } else if (mode === 'signin') {
        const user = await signInWithEmail(email.trim(), password);
        if (user) await onAuthenticated(user.email, user.id);
      } else if (recoveryStep === 'email') {
        const state = await sendPasswordReset(email);
        setEmail(state.email);
        setPassword('');
        setRecoveryStep(state.step);
        setNotice('If the account exists, a reset link is on its way. Open it here.');
        return;
      } else if (recoveryStep === 'email-sent') {
        const state = await getPasswordRecoveryState();
        if (!state) throw new Error('Start the password-reset request again.');
        setRecoveryStep(state.step);
        setNotice(state.step === 'set-password'
          ? 'Reset link verified. Choose a new password.'
          : 'Open the newest reset email on this device.');
        return;
      } else {
        const user = await completePasswordRecovery(password);
        setPassword('');
        await onAuthenticated(user.email, user.id);
      }
      if (mode !== 'recovery') trackAnalyticsEvent('account_completed', { method: 'email' });
    } catch (caught) {
      if (mode !== 'recovery') trackAccountFailure();
      const message = caught instanceof Error ? caught.message : "Couldn't finish signing in.";
      setError(mode === 'signin' && message.toLowerCase().includes('invalid login')
        ? "That password doesn't match. Try again or reset it."
        : message);
    } finally {
      setLoading(false);
    }
  };

  const resendPasswordRecovery = async () => {
    if (loading) return;
    setError('');
    setNotice('');
    try {
      setLoading(true);
      const state = await sendPasswordReset(email);
      setRecoveryStep(state.step);
      setNotice('A fresh reset link is on its way. Use the newest email.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'A new reset email could not be sent.');
    } finally {
      setLoading(false);
    }
  };

  const useDifferentRecoveryEmail = () => {
    if (loading) return;
    setError('');
    setNotice('');
    setPassword('');
    setEmail('');
    setRecoveryStep('email');
    requestAnimationFrame(() => field.current?.focus());
  };

  const returnToSignIn = async () => {
    if (loading) return;
    setError('');
    setNotice('');
    setPassword('');
    try {
      setLoading(true);
      await cancelPasswordRecovery();
      setRecoveryStep('email');
      setMode('signin');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Password recovery could not be closed.');
    } finally {
      setLoading(false);
    }
  };

  const showEmailField = mode !== 'recovery' || recoveryStep === 'email';
  const showPasswordField = mode !== 'recovery' || recoveryStep === 'set-password';
  const emailIsVerified = mode === 'recovery' && recoveryStep === 'set-password';

  return (
    <Screen avoidKeyboard keyboardShouldPersistTaps="handled" header={<AppHeader onBack={onBack} />}>
      <Stagger index={0} style={styles.heading}>
        <Text accessibilityRole="header" style={styles.title}>
          {mode === 'recovery' ? 'Reset your password.' : 'Keep your nights safe.'}
        </Text>
        <Text style={styles.body}>
          {mode === 'recovery'
            ? 'Open the reset link on this device.'
            : mode === 'signup'
              ? 'Create an account with your email and a password.'
              : 'Use the account linked to your nights.'}
        </Text>
      </Stagger>

      <Stagger index={1} style={styles.stack}>
        {showEmailField ? (
          <Pressable
            accessible={false}
            onPress={() => field.current?.focus()}
            style={[styles.fieldWrap, focused === 'email' && styles.fieldFocused, Boolean(error) && styles.fieldError]}
          >
            <Mail size={18} strokeWidth={1.9} color={focused === 'email' ? colors.roseText : colors.boneFaint} />
            <TextInput
              ref={field}
              accessibilityLabel="Email address, used as your username"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              keyboardType="email-address"
              showSoftInputOnFocus
              returnKeyType={mode === 'recovery' ? 'go' : 'next'}
              onSubmitEditing={() => {
                if (mode === 'recovery') void submit();
                else passwordField.current?.focus();
              }}
              placeholder="you@example.com"
              placeholderTextColor={colors.boneFaint}
              value={email}
              onChangeText={(value) => { setEmail(value); if (error) setError(''); }}
              onFocus={() => setFocused('email')}
              onBlur={() => setFocused(null)}
              style={styles.field}
            />
          </Pressable>
        ) : (
          <View
            accessible
            accessibilityLabel={`${emailIsVerified ? 'Recovery verified for' : 'Reset sent to'} ${email}`}
            style={styles.verifiedEmail}
          >
            {emailIsVerified
              ? <CheckCircle2 size={19} strokeWidth={2} color={colors.mossText} />
              : <Mail size={19} strokeWidth={2} color={colors.brassText} />}
            <View style={styles.verifiedEmailCopy}>
              <Text style={styles.verifiedEmailLabel}>
                {emailIsVerified ? 'Recovery verified for' : 'Reset sent to'}
              </Text>
              <Text style={styles.verifiedEmailAddress}>{email}</Text>
            </View>
          </View>
        )}

        {showPasswordField ? (
          <View style={[styles.fieldWrap, focused === 'password' && styles.fieldFocused, Boolean(error) && styles.fieldError]}>
            <LockKeyhole size={18} strokeWidth={1.9} color={focused === 'password' ? colors.roseText : colors.boneFaint} />
            <TextInput
              ref={passwordField}
              accessibilityLabel={mode === 'signin' ? 'Password' : mode === 'recovery' ? 'New password' : 'Create password'}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              textContentType={mode === 'signin' ? 'password' : 'newPassword'}
              secureTextEntry={!passwordVisible}
              showSoftInputOnFocus
              returnKeyType="go"
              onSubmitEditing={() => void submit()}
              placeholder={mode === 'signin' ? 'Password' : mode === 'recovery' ? 'Choose a new password' : 'Create a password'}
              placeholderTextColor={colors.boneFaint}
              value={password}
              onChangeText={(value) => { setPassword(value); if (error) setError(''); }}
              onFocus={() => setFocused('password')}
              onBlur={() => setFocused(null)}
              style={styles.field}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={passwordVisible ? 'Hide password' : 'Show password'}
              accessibilityState={{ expanded: passwordVisible }}
              hitSlop={10}
              onPress={() => setPasswordVisible((visible) => !visible)}
              style={({ pressed }) => [styles.passwordToggle, pressed && styles.passwordTogglePressed]}
            >
              {passwordVisible
                ? <EyeOff size={20} strokeWidth={1.9} color={colors.roseText} />
                : <Eye size={20} strokeWidth={1.9} color={colors.boneFaint} />}
            </Pressable>
          </View>
        ) : null}

        {mode === 'signin' && !hasLocalRecordings ? (
          <View style={styles.singleAction}>
            <TextButton onPress={() => {
              setError('');
              setNotice('');
              setPassword('');
              setRecoveryStep('email');
              setMode('recovery');
            }}>
              Forgot password?
            </TextButton>
          </View>
        ) : null}

        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}

        <Button loading={loading} onPress={() => void submit()}>
          {mode === 'signin'
            ? 'Sign in'
            : mode === 'recovery'
              ? recoveryStep === 'email'
                ? 'Send reset email'
                : recoveryStep === 'email-sent'
                  ? "I've opened the reset link"
                  : 'Save new password'
              : 'Create account & continue'}
        </Button>

        {mode === 'recovery' && recoveryStep === 'email-sent' ? (
          <View
            pointerEvents={loading ? 'none' : 'auto'}
            style={[styles.verificationActions, loading && styles.verificationActionsBusy]}
          >
            <TextButton onPress={() => void resendPasswordRecovery()}>Resend email</TextButton>
            <TextButton onPress={useDifferentRecoveryEmail}>Use a different email</TextButton>
          </View>
        ) : null}

        {!hasLocalRecordings ? (
          <View style={styles.switchMode}>
            {mode === 'recovery' ? (
              <TextButton onPress={() => void returnToSignIn()}>Back to sign in</TextButton>
            ) : (
              <>
                <Text style={styles.switchCopy}>{mode === 'signin' ? 'Need an account?' : 'Already have an account?'}</Text>
                <TextButton onPress={() => { setError(''); setNotice(''); setPassword(''); setMode((value) => value === 'signin' ? 'signup' : 'signin'); }}>
                  {mode === 'signin' ? 'Link this device' : 'Sign in'}
                </TextButton>
              </>
            )}
          </View>
        ) : (
          <Text style={styles.recovery}>
            Sign-in is unavailable while this device has unmerged recordings.
          </Text>
        )}
      </Stagger>

      <Stagger index={2} style={styles.privacyCard}>
        <ShieldCheck size={17} strokeWidth={2} color={colors.mossText} />
        <Text style={styles.privacy}>
          Audio stays here until you allow backup and reflection processing.
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
  passwordToggle: {
    width: 36,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -8,
  },
  passwordTogglePressed: { opacity: 0.6 },
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
  singleAction: { minHeight: 36, alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: 4 },
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
