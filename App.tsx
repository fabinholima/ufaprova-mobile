import { useState } from 'react';
import { SafeAreaView, StyleSheet, Text, Pressable, View, TextInput, ActivityIndicator } from 'react-native';
import * as SecureStore from 'expo-secure-store';

type Screen = 'login' | 'home' | 'scan';
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://ufaprova-api.onrender.com';

export default function App() {
  const [screen, setScreen] = useState<Screen>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setError('');
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-client': 'mobile' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Não foi possível entrar.');
      if (body.data?.token) await SecureStore.setItemAsync('ufaprova.session', body.data.token);
      setScreen('home');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha de conexão com a API.');
    } finally { setLoading(false); }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.eyebrow}>UFA PROVA</Text>
        <Text style={styles.title}>Correção de avaliações</Text>
        {screen === 'login' ? (
          <>
            <Text style={styles.subtitle}>Entre com sua conta de professor para acessar suas avaliações.</Text>
            <TextInput style={styles.input} autoCapitalize="none" keyboardType="email-address" placeholder="E-mail" value={email} onChangeText={setEmail} />
            <TextInput style={styles.input} secureTextEntry placeholder="Senha" value={password} onChangeText={setPassword} />
            {!!error && <Text style={styles.error}>{error}</Text>}
            <Pressable style={styles.primary} onPress={signIn} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Entrar</Text>}
            </Pressable>
          </>
        ) : screen === 'home' ? (
          <>
            <Text style={styles.subtitle}>
              Selecione uma avaliação para iniciar a correção das folhas de respostas.
            </Text>
            <Pressable style={styles.primary} onPress={() => setScreen('scan')}>
              <Text style={styles.primaryText}>Escanear folha de respostas</Text>
            </Pressable>
            <Text style={styles.muted}>Nenhuma avaliação selecionada</Text>
          </>
        ) : (
          <>
            <Text style={styles.subtitle}>
              A câmera e a leitura OMR serão ativadas nesta etapa do MVP.
            </Text>
            <Pressable style={styles.secondary} onPress={() => setScreen('home')}>
              <Text style={styles.secondaryText}>Voltar</Text>
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8fafc' },
  container: { flex: 1, padding: 28, justifyContent: 'center' },
  eyebrow: { color: '#2563eb', fontWeight: '700', letterSpacing: 2, fontSize: 12 },
  title: { color: '#0f172a', fontSize: 30, fontWeight: '800', marginTop: 10 },
  subtitle: { color: '#475569', fontSize: 16, lineHeight: 24, marginTop: 14 },
  input: { backgroundColor: '#fff', borderColor: '#cbd5e1', borderWidth: 1, borderRadius: 10, padding: 14, marginTop: 14, fontSize: 16 },
  error: { color: '#b91c1c', marginTop: 12 },
  primary: { backgroundColor: '#0f172a', borderRadius: 12, padding: 16, marginTop: 28 },
  primaryText: { color: '#fff', textAlign: 'center', fontWeight: '700', fontSize: 16 },
  secondary: { borderColor: '#cbd5e1', borderWidth: 1, borderRadius: 12, padding: 16, marginTop: 28 },
  secondaryText: { color: '#0f172a', textAlign: 'center', fontWeight: '700', fontSize: 16 },
  muted: { color: '#94a3b8', marginTop: 18, textAlign: 'center' },
});
