import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, AppState, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { CameraCapturedPicture } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useUi } from './ui-styles';

export type CapturedSheet = {
  photo: CameraCapturedPicture;
  applicationId?: string;
  schoolId: string;
  assessmentId: string;
  classId: string;
  schoolName: string;
  assessmentTitle: string;
  className: string;
};

type Props = {
  applicationId?: string;
  school: { id: string; name: string };
  assessment: { id: string; title: string };
  schoolClass: { id: string; name: string };
  onConfirm: (sheet: CapturedSheet) => void | Promise<void>;
  onBack: () => void;
  // Progresso da aplicação e cartões salvos nesta sessão, logo abaixo do título.
  header?: ReactNode;
  backLabel?: string;
  // Textos para outras folhas (ex.: páginas de redação).
  instructions?: string;
  confirmLabel?: string;
};

export default function CaptureScreen({ applicationId, school, assessment, schoolClass, onConfirm, onBack, header, backLabel = 'Voltar para avaliações', instructions, confirmLabel = 'Usar esta foto' }: Props) {
  const ui = useUi();
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
  const [torch,setTorch]=useState(false);
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

  // Cartões fotografados antes (ou escaneados) entram pela galeria e seguem a
  // mesma conferência e o mesmo envio das fotos da câmera.
  async function pickFromGallery() {
    if (busy.current) return;
    busy.current = true;
    setError('');
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      const asset = result.canceled ? null : result.assets?.[0];
      if (asset?.uri && mounted.current) { setPhoto({ uri: asset.uri, width: asset.width, height: asset.height, format: 'jpg' } as CameraCapturedPicture); setReady(false); }
    } catch {
      if (mounted.current) setError('Não foi possível abrir a galeria. Tente novamente.');
    } finally { busy.current = false; }
  }

  async function confirmPhoto() {
    if (!photo || busy.current) return;
    busy.current = true; setSaving(true); setError('');
    try {
      await onConfirm({ photo, applicationId, schoolId: school.id, assessmentId: assessment.id, classId: schoolClass.id, schoolName: school.name, assessmentTitle: assessment.title, className: schoolClass.name });
      // Captura em sequência: a câmera volta pronta para o próximo cartão.
      if (mounted.current) retake();
    }
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
      <Text style={ui.title}>{assessment.title}</Text>
      <Text style={ui.text}>{school.name} • {schoolClass.name}</Text>
      {header}
      {photo ? (
        <>
          <Image source={{ uri: photo.uri }} style={styles.preview} resizeMode="contain" accessibilityLabel="Foto da folha de respostas" />
          <Text style={ui.text}>Confira se a folha inteira está visível e se as marcações estão nítidas.</Text>
          <Pressable disabled={saving} style={[ui.primary, saving && ui.disabled]} onPress={confirmPhoto}>
            <Text style={ui.primaryText}>{saving ? (instructions ? 'Enviando…' : 'Salvando no aparelho…') : confirmLabel}</Text>
          </Pressable>
          <Pressable disabled={saving} style={[ui.secondary, saving && ui.disabled]} onPress={retake}><Text style={ui.buttonText}>Refazer foto</Text></Pressable>
        </>
      ) : !permission ? (
        <ActivityIndicator style={styles.spacing} accessibilityLabel="Consultando permissão da câmera" />
      ) : !permission.granted ? (
        <>
          <Text style={ui.text}>Permita o acesso à câmera para fotografar a folha de respostas.</Text>
          <Pressable style={ui.primary} onPress={allowCamera}>
            <Text style={ui.primaryText}>{permission.canAskAgain ? 'Permitir câmera' : 'Abrir configurações'}</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={ui.text}>{instructions ?? 'Coloque a folha em uma superfície plana e bem iluminada. Enquadre o cartão inteiro, incluindo o QR Code e todas as alternativas. Evite sombras e mantenha o celular paralelo ao papel.'}</Text>
          {active && !cameraFailed ? (
            <View style={styles.preview}>
              <CameraView key={attempt} ref={camera} style={StyleSheet.absoluteFill} facing="back" mode="picture" autofocus="on" enableTorch={torch}
                onCameraReady={() => setReady(true)}
                onMountError={() => { setReady(false); setCameraFailed(true); setError('Não foi possível abrir a câmera. Tente novamente.'); }} />
              <View pointerEvents="none" style={styles.guide} />
            </View>
          ) : <Text style={ui.text}>{cameraFailed ? 'Câmera indisponível.' : 'Volte ao aplicativo para ativar a câmera.'}</Text>}
          {!cameraFailed && <Pressable accessibilityRole="switch" accessibilityState={{checked:torch}} style={ui.secondary} onPress={()=>setTorch(value=>!value)}><Text style={ui.buttonText}>{torch?'Desligar lanterna':'Ligar lanterna'}</Text></Pressable>}
          {cameraFailed ? (
            <Pressable disabled={saving} style={[ui.secondary, saving && ui.disabled]} onPress={retake}><Text style={ui.buttonText}>Tentar novamente</Text></Pressable>
          ) : (
            <Pressable accessibilityRole="button" accessibilityLabel="Fotografar folha de respostas" disabled={!ready || capturing || !active}
              style={[ui.primary, (!ready || capturing || !active) && ui.disabled]} onPress={capture}>
              {capturing ? <ActivityIndicator color="#fff" /> : <Text style={ui.primaryText}>{ready ? 'Fotografar folha' : 'Preparando câmera…'}</Text>}
            </Pressable>
          )}
        </>
      )}
      {!photo && <Pressable accessibilityRole="button" disabled={capturing} style={[ui.secondary, capturing && ui.disabled]} onPress={() => { void pickFromGallery(); }}>
        <Text style={ui.buttonText}>Escolher foto da galeria</Text>
      </Pressable>}
      {!!error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
      <Pressable disabled={capturing || saving} style={[ui.secondary, (capturing || saving) && ui.disabled]} onPress={onBack}>
        <Text style={ui.buttonText}>{backLabel}</Text>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  preview: { width: '100%', aspectRatio: 3 / 4, backgroundColor: '#0f172a', marginTop: 20, borderRadius: 12, overflow: 'hidden' },
  guide: { position: 'absolute', top: '5%', bottom: '5%', left: '5%', right: '5%', borderWidth: 2, borderColor: '#fff', borderRadius: 4 },
  spacing: { marginTop: 24 },
});
