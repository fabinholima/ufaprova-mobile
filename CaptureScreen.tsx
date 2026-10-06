import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { CameraCapturedPicture } from 'expo-camera';

export type CapturedSheet = {
  photo: CameraCapturedPicture;
  schoolId: string;
  assessmentId: string;
  classId: string;
  schoolName: string;
  assessmentTitle: string;
  className: string;
};

type Props = {
  school: { id: string; name: string };
  assessment: { id: string; title: string };
  schoolClass: { id: string; name: string };
  onConfirm: (sheet: CapturedSheet) => void | Promise<void>;
  onBack: () => void;
};

export default function CaptureScreen({ school, assessment, schoolClass, onConfirm, onBack }: Props) {
  const camera = useRef<CameraView>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  const [permission, requestPermission, refreshPermission] = useCameraPermissions();
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photo, setPhoto] = useState<CameraCapturedPicture | null>(null);
  const [error, setError] = useState('');
  const [cameraFailed, setCameraFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', (state) => {
      setActive(state === 'active');
      setReady(false);
      if (state === 'active') void refreshPermission().catch(() => {
        if (mounted.current) setError('Não foi possível consultar a permissão da câmera.');
      });
    });
    return () => { mounted.current = false; subscription.remove(); };
  }, [refreshPermission]);

  async function allowCamera() {
    setError('');
    try {
      if (permission?.canAskAgain === false) await Linking.openSettings();
      else await requestPermission();
    } catch {
      if (mounted.current) setError('Não foi possível abrir a permissão da câmera. Tente novamente.');
    }
  }

  async function capture() {
    if (!camera.current || !ready || !active || busy.current) return;
    busy.current = true;
    setCapturing(true);
    setError('');
    try {
      const picture = await camera.current.takePictureAsync({ quality: 1 });
      if (!picture?.uri) throw new Error('Foto indisponível');
      if (mounted.current) { setPhoto(picture); setReady(false); }
    } catch {
      if (mounted.current) setError('Não foi possível capturar a folha. Mantenha o celular firme e tente novamente.');
    } finally {
      busy.current = false;
      if (mounted.current) setCapturing(false);
    }
  }

  async function confirmPhoto() {
    if (!photo || busy.current) return;
    busy.current = true; setSaving(true); setError('');
    try { await onConfirm({ photo, schoolId: school.id, assessmentId: assessment.id, classId: schoolClass.id, schoolName: school.name, assessmentTitle: assessment.title, className: schoolClass.name }); }
    catch (err) { if (mounted.current) setError(err instanceof Error ? err.message : 'Não foi possível salvar a foto no aparelho.'); }
    finally { busy.current = false; if (mounted.current) setSaving(false); }
  }

  function retake() {
    setPhoto(null);
    setReady(false);
    setError('');
    setCameraFailed(false);
    setAttempt((value) => value + 1);
  }

  return (
    <>
      <Text style={styles.title}>{assessment.title}</Text>
      <Text style={styles.text}>{school.name} • {schoolClass.name}</Text>
      {photo ? (
        <>
          <Image source={{ uri: photo.uri }} style={styles.preview} resizeMode="contain" accessibilityLabel="Foto da folha de respostas" />
          <Text style={styles.text}>Confira se a folha inteira está visível e se as marcações estão nítidas.</Text>
          <Pressable disabled={saving} style={[styles.primary, saving && styles.disabled]} onPress={confirmPhoto}>
            <Text style={styles.primaryText}>{saving ? 'Salvando no aparelho…' : 'Usar esta foto'}</Text>
          </Pressable>
          <Pressable disabled={saving} style={[styles.secondary, saving && styles.disabled]} onPress={retake}><Text style={styles.buttonText}>Refazer foto</Text></Pressable>
        </>
      ) : !permission ? (
        <ActivityIndicator style={styles.spacing} accessibilityLabel="Consultando permissão da câmera" />
      ) : !permission.granted ? (
        <>
          <Text style={styles.text}>Permita o acesso à câmera para fotografar a folha de respostas.</Text>
          <Pressable style={styles.primary} onPress={allowCamera}>
            <Text style={styles.primaryText}>{permission.canAskAgain ? 'Permitir câmera' : 'Abrir configurações'}</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.text}>Coloque a folha em uma superfície plana e bem iluminada. Enquadre toda a página, sem sombras.</Text>
          {active && !cameraFailed ? (
            <View style={styles.preview}>
              <CameraView key={attempt} ref={camera} style={StyleSheet.absoluteFill} facing="back" mode="picture" autofocus="on"
                onCameraReady={() => setReady(true)}
                onMountError={() => { setReady(false); setCameraFailed(true); setError('Não foi possível abrir a câmera. Tente novamente.'); }} />
              <View pointerEvents="none" style={styles.guide} />
            </View>
          ) : <Text style={styles.text}>{cameraFailed ? 'Câmera indisponível.' : 'Volte ao aplicativo para ativar a câmera.'}</Text>}
          {cameraFailed ? (
            <Pressable disabled={saving} style={[styles.secondary, saving && styles.disabled]} onPress={retake}><Text style={styles.buttonText}>Tentar novamente</Text></Pressable>
          ) : (
            <Pressable accessibilityRole="button" accessibilityLabel="Fotografar folha de respostas" disabled={!ready || capturing || !active}
              style={[styles.primary, (!ready || capturing || !active) && styles.disabled]} onPress={capture}>
              {capturing ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{ready ? 'Fotografar folha' : 'Preparando câmera…'}</Text>}
            </Pressable>
          )}
        </>
      )}
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <Pressable disabled={capturing || saving} style={[styles.secondary, (capturing || saving) && styles.disabled]} onPress={onBack}>
        <Text style={styles.buttonText}>Voltar para avaliações</Text>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  title: { color: '#0f172a', fontSize: 20, fontWeight: '700', marginTop: 24 },
  text: { color: '#475569', fontSize: 16, lineHeight: 24, marginTop: 14 },
  preview: { width: '100%', aspectRatio: 3 / 4, backgroundColor: '#0f172a', marginTop: 20, borderRadius: 12, overflow: 'hidden' },
  guide: { position: 'absolute', top: '5%', bottom: '5%', left: '5%', right: '5%', borderWidth: 2, borderColor: '#fff', borderRadius: 4 },
  primary: { backgroundColor: '#0f172a', borderRadius: 12, padding: 16, marginTop: 20 },
  primaryText: { color: '#fff', textAlign: 'center', fontWeight: '700', fontSize: 16 },
  secondary: { borderColor: '#cbd5e1', borderWidth: 1, borderRadius: 12, padding: 16, marginTop: 16 },
  buttonText: { color: '#0f172a', textAlign: 'center', fontWeight: '700', fontSize: 16 },
  disabled: { opacity: 0.45 },
  spacing: { marginTop: 24 },
  error: { color: '#b91c1c', marginTop: 12 },
});
