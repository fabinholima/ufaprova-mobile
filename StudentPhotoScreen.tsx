import { useRef, useState } from "react";
import { ActivityIndicator, Image, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import type { CameraCapturedPicture } from "expo-camera";
import { ui } from "./ui-styles";
import { createStudentClient } from "./student-api";
import type { StudentProfile } from "./student-api";
import { prepareSelfie } from "./prepare-selfie";

type Props = {
  apiUrl: string;
  token: string;
  profile: StudentProfile;
  onSaved: () => void | Promise<void>;
  onBack: () => void;
};

export default function StudentPhotoScreen({ apiUrl, token, profile, onSaved, onBack }: Props) {
  const camera = useRef<CameraView>(null);
  const busy = useRef(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false);
  const [photo, setPhoto] = useState<CameraCapturedPicture | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function allowCamera() {
    setError("");
    try {
      if (permission?.canAskAgain === false) await Linking.openSettings();
      else await requestPermission();
    } catch {
      setError("Não foi possível abrir a permissão da câmera. Tente novamente.");
    }
  }

  async function guard(fn: () => Promise<void>, fallback: string) {
    if (busy.current) return;
    busy.current = true;
    setWorking(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : fallback);
    } finally {
      busy.current = false;
      setWorking(false);
    }
  }

  const capture = () =>
    guard(async () => {
      if (!camera.current || !ready) return;
      const picture = await camera.current.takePictureAsync({ quality: 1 });
      if (!picture?.uri) throw Error("Foto indisponível.");
      setPhoto(picture);
      setReady(false);
    }, "Não foi possível tirar a foto. Tente novamente.");

  const send = () =>
    guard(async () => {
      if (!photo) return;
      const selfieDataUrl = await prepareSelfie(photo);
      await createStudentClient(apiUrl, token)("/api/student/profile", {
        studentId: profile.id,
        selfieDataUrl,
      });
      await onSaved();
    }, "Não foi possível enviar a foto.");

  return (
    <>
      <Text style={ui.title}>Foto do cadastro</Text>
      <Text style={ui.text}>{profile.name}</Text>
      <Text style={ui.small}>
        A foto ajuda o professor a identificar você na turma. Use um local iluminado, rosto de frente
        e sem óculos escuros ou boné.
      </Text>
      {photo ? (
        <>
          <Image
            source={{ uri: photo.uri }}
            style={ui.preview}
            resizeMode="cover"
            accessibilityLabel="Prévia da sua foto"
          />
          <Pressable
            accessibilityRole="button"
            disabled={working}
            style={[ui.primary, working && ui.disabled]}
            onPress={send}
          >
            <Text style={ui.primaryText}>{working ? "Enviando…" : "Usar esta foto"}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={working}
            style={[ui.secondary, working && ui.disabled]}
            onPress={() => {
              setPhoto(null);
              setError("");
            }}
          >
            <Text style={ui.buttonText}>Tirar outra foto</Text>
          </Pressable>
        </>
      ) : !permission ? (
        <ActivityIndicator accessibilityLabel="Consultando permissão da câmera" />
      ) : !permission.granted ? (
        <Pressable accessibilityRole="button" style={ui.primary} onPress={allowCamera}>
          <Text style={ui.primaryText}>
            {permission.canAskAgain ? "Permitir câmera" : "Abrir configurações"}
          </Text>
        </Pressable>
      ) : (
        <>
          <View style={styles.frame}>
            <CameraView
              ref={camera}
              style={StyleSheet.absoluteFill}
              facing="front"
              mode="picture"
              onCameraReady={() => setReady(true)}
              onMountError={() => setError("Não foi possível abrir a câmera.")}
            />
            <View pointerEvents="none" style={styles.face} />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tirar foto"
            disabled={!ready || working}
            style={[ui.primary, (!ready || working) && ui.disabled]}
            onPress={capture}
          >
            <Text style={ui.primaryText}>{ready ? "Tirar foto" : "Preparando câmera…"}</Text>
          </Pressable>
        </>
      )}
      {!!error && (
        <Text accessibilityRole="alert" style={ui.error}>
          {error}
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        disabled={working}
        style={[ui.secondary, working && ui.disabled]}
        onPress={onBack}
      >
        <Text style={ui.buttonText}>Voltar</Text>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: "100%",
    aspectRatio: 3 / 4,
    backgroundColor: "#0f172a",
    marginTop: 20,
    borderRadius: 12,
    overflow: "hidden",
  },
  face: {
    position: "absolute",
    top: "15%",
    bottom: "20%",
    left: "18%",
    right: "18%",
    borderWidth: 2,
    borderColor: "#fff",
    borderRadius: 999,
  },
});
