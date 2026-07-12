import { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, ui } from '@/lib/ui';

export default function Login() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { role: 'driver', full_name: name } },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[ui.screen, { justifyContent: 'center' }]}>
      <Text style={ui.h1}>Halting Driver</Text>
      <Text style={[ui.muted, { marginBottom: 24 }]}>
        {mode === 'signin' ? 'Sign in to start driving' : 'Create your driver account'}
      </Text>
      {mode === 'signup' && (
        <TextInput style={ui.input} placeholder="Full name" value={name} onChangeText={setName} />
      )}
      <TextInput
        style={ui.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={ui.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {error && <Text style={ui.error}>{error}</Text>}
      <TouchableOpacity style={ui.btn} onPress={submit} disabled={busy}>
        <Text style={ui.btnText}>{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Sign up'}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')} style={{ marginTop: 16 }}>
        <Text style={{ color: colors.muted, textAlign: 'center' }}>
          {mode === 'signin' ? 'New driver? Create an account' : 'Already registered? Sign in'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
