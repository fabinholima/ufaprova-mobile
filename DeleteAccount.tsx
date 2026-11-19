import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useUi } from "./ui-styles";

type Props = {
  // POST autenticado na API com a sessão atual.
  request: (path: string, input: object) => Promise<unknown>;
  // Limpa a sessão e os dados do aparelho depois que a conta foi excluída.
  onDeleted: () => Promise<void>;
};

// Exclusão da conta pelo próprio usuário (exigência da Play Store). A API apaga
// os dados pessoais e os acessos; o que é da escola continua com a escola.
export default function DeleteAccount({ request, onDeleted }: Props) {
  const ui = useUi();
  const [open, setOpen] = useState(false),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!open)
    return (
      <Pressable accessibilityRole="button" style={ui.secondary} onPress={() => setOpen(true)}>
        <Text style={ui.buttonText}>Excluir minha conta</Text>
      </Pressable>
    );
  const ready = confirm.trim().toUpperCase() === "EXCLUIR" && !busy;
  return (
    <View style={ui.card}>
      <Text style={ui.cardTitle}>Excluir minha conta</Text>
      <Text style={ui.text}>
        Seu nome, e-mail, senha, telefone, CPF e foto são apagados, e você sai de todos os aparelhos. O que está guardado neste
        aparelho, inclusive fotos ainda não enviadas, também é apagado. Não dá para desfazer.
      </Text>
      <Text style={ui.small}>
        Alunos, turmas, provas e notas pertencem à escola e continuam com ela. Se você é o único administrador de
        uma escola com outras pessoas, passe a administração antes.
      </Text>
      <TextInput
        style={ui.input}
        accessibilityLabel="Senha atual"
        placeholder="Senha atual (em branco se entra só com Google)"
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        value={password}
        onChangeText={setPassword}
      />
      <TextInput
        style={ui.input}
        accessibilityLabel="Digite EXCLUIR para confirmar"
        placeholder="Digite EXCLUIR para confirmar"
        autoCapitalize="characters"
        autoCorrect={false}
        value={confirm}
        onChangeText={setConfirm}
      />
      {!!error && <Text style={ui.error}>{error}</Text>}
      <Pressable
        accessibilityRole="button"
        disabled={!ready}
        style={[ui.primary, !ready && ui.disabled]}
        onPress={() => {
          setBusy(true);
          setError("");
          void request("/api/account/delete", { confirm, ...(password ? { password } : {}) })
            .then(async () => {
              setPassword("");
              await onDeleted();
            })
            .catch((e: unknown) => setError(e instanceof Error ? e.message : "Não foi possível excluir a conta."))
            .finally(() => setBusy(false));
        }}
      >
        <Text style={ui.primaryText}>{busy ? "Excluindo…" : "Excluir conta definitivamente"}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        style={ui.secondary}
        onPress={() => {
          setOpen(false);
          setPassword("");
          setConfirm("");
          setError("");
        }}
      >
        <Text style={ui.buttonText}>Cancelar</Text>
      </Pressable>
    </View>
  );
}
