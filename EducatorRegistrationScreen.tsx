import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { ui } from "./ui-styles";
import { registerEducator } from "./educator-registration";
import type { EducatorRegistration } from "./educator-registration";
const initial: EducatorRegistration = {
  professionalRole: "teacher",
  displayName: "",
  email: "",
  cpf: "",
  password: "",
  confirmPassword: "",
  subjects: "",
  grades: "",
  stages: [],
  schoolName: "",
  schoolType: "estadual",
  address: "",
  city: "",
  state: "",
};
export default function EducatorRegistrationScreen({
  apiUrl,
  onBack,
  onCreated,
}: {
  apiUrl: string;
  onBack: () => void;
  onCreated: (email: string, role: "teacher" | "coordinator") => void;
}) {
  const [form, setForm] = useState<EducatorRegistration>(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [visible, setVisible] = useState(false);
  const saving = useRef(false);
  const set = (name: keyof EducatorRegistration, value: string) =>
    setForm((current) => ({ ...current, [name]: value }));
  const field = (
    name: keyof EducatorRegistration,
    label: string,
    placeholder = label,
    options: object = {},
  ) => (
    <View>
      <Text style={ui.small}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholder={placeholder}
        style={ui.input}
        value={String(form[name])}
        editable={!busy}
        onChangeText={(value) => set(name, value)}
        {...options}
      />
    </View>
  );
  async function submit() {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await registerEducator(apiUrl, form);
      setForm(initial);
      onCreated(result.email, result.professionalRole);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível criar a conta.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <SafeAreaView style={ui.safe}>
      <ScrollView contentContainerStyle={ui.container} keyboardShouldPersistTaps="handled">
        <Text style={ui.eyebrow}>UFA PROVA</Text>
        <Text style={ui.title}>Criar conta de professor ou coordenador</Text>
        <Text style={ui.text}>
          Cadastre seu perfil e sua primeira escola. Depois, confirme o e-mail para entrar.
        </Text>
        <Text style={ui.small}>Seu perfil profissional</Text>
        <View style={ui.options}>
          {(
            [
              ["teacher", "Professor"],
              ["coordinator", "Coordenador"],
            ] as const
          ).map(([value, label]) => (
            <Pressable
              key={value}
              accessibilityRole="radio"
              accessibilityState={{ checked: form.professionalRole === value }}
              disabled={busy}
              style={[ui.option, form.professionalRole === value && ui.selected]}
              onPress={() => set("professionalRole", value)}
            >
              <Text style={ui.buttonText}>{label}</Text>
            </Pressable>
          ))}
        </View>
        {field("displayName", "Nome completo", "Seu nome", {
          autoComplete: "name",
          maxLength: 160,
        })}
        {field("email", "E-mail do professor ou coordenador", "E-mail", {
          autoCapitalize: "none",
          keyboardType: "email-address",
          autoComplete: "email",
          maxLength: 254,
        })}
        {field("cpf", "CPF", "000.000.000-00", { keyboardType: "number-pad", maxLength: 14 })}
        <Text style={ui.small}>
          Seu CPF será protegido pelo servidor e não será salvo neste aparelho.
        </Text>
        {field("password", "Senha para nova conta", "Pelo menos 10 caracteres", {
          secureTextEntry: !visible,
          autoCapitalize: "none",
          autoCorrect: false,
          maxLength: 200,
        })}
        {field("confirmPassword", "Confirmar senha", "Digite a senha novamente", {
          secureTextEntry: !visible,
          autoCapitalize: "none",
          autoCorrect: false,
          maxLength: 200,
        })}
        <Pressable disabled={busy} style={ui.passwordToggle} onPress={() => setVisible(!visible)}>
          <Text style={ui.linkText}>{visible ? "Ocultar senhas" : "Mostrar senhas"}</Text>
        </Pressable>
        {form.professionalRole === "teacher" ? (
          <>
            {field("subjects", "Disciplinas", "Ex.: Matemática, Ciências", { maxLength: 500 })}
            {field("grades", "Séries em que leciona", "Ex.: 6º ano, 7º ano", { maxLength: 500 })}
            <Text style={ui.small}>Separe disciplinas e séries por vírgula.</Text>
          </>
        ) : (
          <>
            <Text style={ui.small}>Etapas sob sua coordenação</Text>
            {["Educação Infantil", "Ensino Fundamental", "Ensino Médio"].map((stage) => (
              <Pressable
                key={stage}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: form.stages.includes(stage) }}
                disabled={busy}
                style={[ui.secondary, form.stages.includes(stage) && ui.selected]}
                onPress={() =>
                  setForm((current) => ({
                    ...current,
                    stages: current.stages.includes(stage)
                      ? current.stages.filter((item) => item !== stage)
                      : [...current.stages, stage],
                  }))
                }
              >
                <Text style={ui.buttonText}>
                  {form.stages.includes(stage) ? "✓ " : ""}
                  {stage}
                </Text>
              </Pressable>
            ))}
          </>
        )}
        <Text style={ui.title}>Sua primeira escola</Text>
        {field("schoolName", "Nome da escola", "Nome da escola", { maxLength: 140 })}
        <Text style={ui.small}>Tipo de escola</Text>
        <View style={ui.options}>
          {(
            [
              ["municipal", "Municipal"],
              ["estadual", "Estadual"],
              ["federal", "Federal"],
              ["privada", "Privada"],
              ["outra", "Outra"],
            ] as const
          ).map(([value, label]) => (
            <Pressable
              key={value}
              accessibilityRole="radio"
              accessibilityState={{ checked: form.schoolType === value }}
              disabled={busy}
              style={[ui.option, form.schoolType === value && ui.selected]}
              onPress={() => set("schoolType", value)}
            >
              <Text style={ui.buttonText}>{label}</Text>
            </Pressable>
          ))}
        </View>
        {field("address", "Endereço da escola", "Rua e número", { maxLength: 240 })}
        {field("city", "Cidade da escola", "Cidade", { maxLength: 100 })}
        {field("state", "Estado da escola (UF)", "Ex.: MS", {
          autoCapitalize: "characters",
          maxLength: 2,
        })}
        <Text style={ui.small}>
          Teste por 7 dias, sem cobrança automática. O perfil profissional não concede acesso
          administrativo a outras escolas.
        </Text>
        {!!error && (
          <Text accessibilityLiveRegion="polite" style={ui.error}>
            {error}
          </Text>
        )}
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          style={[ui.primary, busy && ui.disabled]}
          onPress={() => void submit()}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={ui.primaryText}>Criar minha conta</Text>
          )}
        </Pressable>
        <Pressable disabled={busy} style={ui.secondary} onPress={onBack}>
          <Text style={ui.buttonText}>Já tenho conta · voltar para entrar</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
