import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../api/auth';
import { ApiError } from '../api/client';
import { colors } from './theme';
import { authStyles } from './LoginScreen';

interface Props {
  onSwitchToLogin: () => void;
}

export function RegisterScreen({ onSwitchToLogin }: Props) {
  const { register } = useAuth();
  const [name, setName] = useState('');
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
      await register(name.trim(), email.trim(), password);
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
    <SafeAreaView style={authStyles.root}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={authStyles.content}>
          <Text style={authStyles.brand}>KADI</Text>
          <Text style={authStyles.subtitle}>Create your account</Text>

          <View style={authStyles.card}>
            <Text style={authStyles.label}>Name</Text>
            <TextInput
              style={[authStyles.input, errors.name && authStyles.inputError]}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              placeholder="Your name"
              placeholderTextColor={colors.textMuted}
            />
            {!!errors.name && (
              <Text style={authStyles.fieldError}>{errors.name}</Text>
            )}

            <Text style={[authStyles.label, { marginTop: 14 }]}>Email</Text>
            <TextInput
              style={[authStyles.input, errors.email && authStyles.inputError]}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
              placeholder="you@example.com"
              placeholderTextColor={colors.textMuted}
            />
            {!!errors.email && (
              <Text style={authStyles.fieldError}>{errors.email}</Text>
            )}

            <Text style={[authStyles.label, { marginTop: 14 }]}>Password</Text>
            <TextInput
              style={[authStyles.input, errors.password && authStyles.inputError]}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="At least 8 characters"
              placeholderTextColor={colors.textMuted}
            />
            {!!errors.password && (
              <Text style={authStyles.fieldError}>{errors.password}</Text>
            )}

            {!!formError && <Text style={authStyles.formError}>{formError}</Text>}

            <Pressable
              style={[
                authStyles.primary,
                submitting && authStyles.primaryDisabled,
              ]}
              onPress={submit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color={colors.black} />
              ) : (
                <Text style={authStyles.primaryText}>Create account</Text>
              )}
            </Pressable>
          </View>

          <Pressable onPress={onSwitchToLogin} hitSlop={8}>
            <Text style={authStyles.switch}>
              Already have an account?{' '}
              <Text style={authStyles.switchLink}>Sign in</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
