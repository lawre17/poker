import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../api/auth';
import { ApiError } from '../api/client';
import { colors } from './theme';

interface Props {
  onSwitchToRegister: () => void;
}

export function LoginScreen({ onSwitchToRegister }: Props) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (submitting) return;
    setErrors({});
    setFormError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.errors) {
          const flat: Record<string, string> = {};
          for (const k of Object.keys(e.errors)) flat[k] = e.errors[k][0];
          setErrors(flat);
        }
        setFormError(e.message);
      } else {
        setFormError('Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.brand}>KADI</Text>
          <Text style={styles.subtitle}>Sign in to play online</Text>

          <View style={styles.card}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={[styles.input, errors.email && styles.inputError]}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
              placeholder="you@example.com"
              placeholderTextColor={colors.textMuted}
            />
            {!!errors.email && <Text style={styles.fieldError}>{errors.email}</Text>}

            <Text style={[styles.label, { marginTop: 14 }]}>Password</Text>
            <TextInput
              style={[styles.input, errors.password && styles.inputError]}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor={colors.textMuted}
            />
            {!!errors.password && (
              <Text style={styles.fieldError}>{errors.password}</Text>
            )}

            {!!formError && <Text style={styles.formError}>{formError}</Text>}

            <Pressable
              style={[styles.primary, submitting && styles.primaryDisabled]}
              onPress={submit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color={colors.black} />
              ) : (
                <Text style={styles.primaryText}>Sign in</Text>
              )}
            </Pressable>
          </View>

          <Pressable onPress={onSwitchToRegister} hitSlop={8}>
            <Text style={styles.switch}>
              No account? <Text style={styles.switchLink}>Create one</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export const authStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.felt },
  content: { padding: 24, alignItems: 'center', flexGrow: 1, justifyContent: 'center' },
  brand: {
    fontSize: 56,
    fontWeight: '900',
    color: colors.gold,
    letterSpacing: 6,
  },
  subtitle: { color: colors.textMuted, marginBottom: 28, fontSize: 16 },
  card: {
    backgroundColor: colors.feltDark,
    borderRadius: 16,
    padding: 20,
    width: '100%',
  },
  label: { color: colors.text, fontWeight: '800', fontSize: 14, marginBottom: 6 },
  input: {
    backgroundColor: colors.feltLight,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  inputError: { borderColor: colors.danger },
  fieldError: { color: colors.danger, fontSize: 13, marginTop: 4 },
  formError: {
    color: colors.danger,
    fontSize: 14,
    marginTop: 14,
    textAlign: 'center',
    fontWeight: '700',
  },
  primary: {
    backgroundColor: colors.gold,
    paddingVertical: 14,
    borderRadius: 26,
    marginTop: 20,
    alignItems: 'center',
  },
  primaryDisabled: { backgroundColor: 'rgba(244,197,66,0.55)' },
  primaryText: { color: colors.black, fontSize: 17, fontWeight: '900' },
  switch: { color: colors.textMuted, marginTop: 22, fontSize: 15 },
  switchLink: { color: colors.gold, fontWeight: '800' },
});

const styles = authStyles;
