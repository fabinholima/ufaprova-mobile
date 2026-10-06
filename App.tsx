import { useState } from 'react';
import { SafeAreaView, StyleSheet, Text, Pressable, View } from 'react-native';

type Screen = 'home' | 'scan';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.eyebrow}>UFA PROVA</Text>
        <Text style={styles.title}>Correção de avaliações</Text>
        {screen === 'home' ? (
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
  primary: { backgroundColor: '#0f172a', borderRadius: 12, padding: 16, marginTop: 28 },
  primaryText: { color: '#fff', textAlign: 'center', fontWeight: '700', fontSize: 16 },
  secondary: { borderColor: '#cbd5e1', borderWidth: 1, borderRadius: 12, padding: 16, marginTop: 28 },
  secondaryText: { color: '#0f172a', textAlign: 'center', fontWeight: '700', fontSize: 16 },
  muted: { color: '#94a3b8', marginTop: 18, textAlign: 'center' },
});
