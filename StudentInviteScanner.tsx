import { useRef, useState } from "react";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Pressable, Text, View } from "react-native";
import { ui } from "./ui-styles";
import { inviteCodeFromQr } from "./student-api";
export default function StudentInviteScanner({
  onCode,
  onClose,
}: {
  onCode: (code: string) => void;
  onClose: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const handled = useRef(false);
  const [error, setError] = useState("");
  return (
    <View>
      <Text style={ui.title}>Ler convite da turma</Text>
      {permission?.granted ? (
        <CameraView
          style={ui.preview}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={({ data }) => {
            if (handled.current) return;
            try {
              const code = inviteCodeFromQr(data);
              handled.current = true;
              onCode(code);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Convite inválido.");
            }
          }}
        />
      ) : (
        <Pressable style={ui.primary} onPress={() => void requestPermission()}>
          <Text style={ui.primaryText}>Permitir câmera para ler QR Code</Text>
        </Pressable>
      )}
      {!!error && <Text style={ui.error}>{error}</Text>}
      <Pressable style={ui.secondary} onPress={onClose}>
        <Text style={ui.buttonText}>Voltar e digitar código</Text>
      </Pressable>
    </View>
  );
}
