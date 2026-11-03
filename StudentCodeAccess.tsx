import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { ui } from "./ui-styles";
import { createStudentClient, normalizeStudentCode } from "./student-api";
import type { FirstAccessMatch } from "./student-api";

type Props = {
  apiUrl: string;
  busy: boolean;
  run: (fn: () => Promise<void>) => Promise<void>;
  // Recebe a resposta de login (com token no app nativo, sem token na web).
  onSession: (result: { token?: string }) => Promise<void>;
  onEmail: () => void;
};
type Step = "login" | "code" | "confirm" | "password";

// Aluno sem e-mail: entra com o código pessoal entregue pelo professor e uma
// senha. No primeiro acesso (ou com um código novo, quando esqueceu a senha),
// confere os dados do cadastro e cria a senha.
export default function StudentCodeAccess({ apiUrl, busy, run, onSession, onEmail }: Props) {
  const [step, setStep] = useState<Step>("login"),
    [code, setCode] = useState(""),
    [password, setPassword] = useState(""),
    [repeat, setRepeat] = useState(""),
    [visible, setVisible] = useState(false),
    [match, setMatch] = useState<FirstAccessMatch | null>(null),
    [notice, setNotice] = useState("");
  const client = () => createStudentClient(apiUrl);
  const go = (next: Step) => {
    setStep(next);
    setPassword("");
    setRepeat("");
    setNotice("");
  };
  const action = (label: string, fn: () => Promise<void>, secondary = false) => (
    <Pressable
      accessibilityRole="button"
      disabled={busy}
      style={[secondary ? ui.secondary : ui.primary, busy && ui.disabled]}
      onPress={() => void run(fn)}
    >
      <Text style={secondary ? ui.buttonText : ui.primaryText}>{label}</Text>
    </Pressable>
  );
  const codeField = (
    <TextInput
      style={ui.input}
      accessibilityLabel="Código do aluno"
      placeholder="UFA-XXXXXXXX"
      maxLength={12}
      autoCapitalize="characters"
      autoCorrect={false}
      value={code}
      onChangeText={(value) => setCode(value.toUpperCase())}
    />
  );
  const passwordField = (label: string, value: string, change: (value: string) => void) => (
    <TextInput
      style={ui.input}
      accessibilityLabel={label}
      placeholder={label}
      secureTextEntry={!visible}
      autoCapitalize="none"
      autoCorrect={false}
      value={value}
      onChangeText={change}
    />
  );
  const toggle = (
    <Pressable accessibilityRole="button" style={ui.passwordToggle} onPress={() => setVisible(!visible)}>
      <Text style={ui.linkText}>{visible ? "Ocultar senha" : "Mostrar senha"}</Text>
    </Pressable>
  );

  if (step === "code")
    return (
      <>
        <Text style={ui.text}>
          Primeiro acesso ou esqueceu a senha? Digite o código que o professor entregou. Se esqueceu a senha, peça
          um código novo ao professor.
        </Text>
        {codeField}
        {!!notice && <Text style={ui.small}>{notice}</Text>}
        {action("Continuar", async () => {
          const value = normalizeStudentCode(code);
          setCode(value);
          setMatch(await client()<FirstAccessMatch>("/api/auth/student/first-access/inspect", { code: value }));
          go("confirm");
        })}
        {action("Voltar", async () => go("login"), true)}
      </>
    );
  if (step === "confirm" && match)
    return (
      <>
        <View style={ui.card}>
          <Text style={ui.cardTitle}>{match.studentName}</Text>
          <Text style={ui.small}>{match.schoolName}</Text>
          <Text style={ui.text}>Turmas: {match.classes.map((c) => c.className).join(", ")}</Text>
        </View>
        <Text style={ui.text}>Estes são os seus dados?</Text>
        {action("Sou eu, continuar", async () => go("password"))}
        {action(
          "Não sou eu",
          async () => {
            setMatch(null);
            setCode("");
            go("code");
            setNotice("Confira o código com o professor. Nada foi gravado.");
          },
          true,
        )}
      </>
    );
  if (step === "password" && match)
    return (
      <>
        <Text style={ui.text}>
          {match.passwordReset
            ? `${match.studentName}, crie uma nova senha. A senha antiga deixa de valer.`
            : `${match.studentName}, crie sua senha. Depois, entre com o código e esta senha.`}
        </Text>
        {passwordField("Nova senha (pelo menos 8 caracteres)", password, setPassword)}
        {passwordField("Repita a senha", repeat, setRepeat)}
        {toggle}
        {action(match.passwordReset ? "Salvar nova senha e entrar" : "Criar senha e entrar", async () => {
          if (password.length < 8) throw Error("A senha precisa ter pelo menos 8 caracteres.");
          if (password !== repeat) throw Error("As duas senhas não são iguais.");
          const result = await client()<{ token?: string }>("/api/auth/student/first-access", {
            code: normalizeStudentCode(code),
            password,
          });
          setPassword("");
          setRepeat("");
          await onSession(result);
        })}
        {action("Voltar", async () => go("confirm"), true)}
      </>
    );
  return (
    <>
      <Text style={ui.small}>Use o código pessoal entregue pelo professor (UFA-XXXXXXXX) e a sua senha.</Text>
      {codeField}
      {passwordField("Senha", password, setPassword)}
      {toggle}
      {action("Entrar", async () => {
        const value = normalizeStudentCode(code);
        setCode(value);
        const result = await client()<{ token?: string }>("/api/auth/student/code-login", { code: value, password });
        setPassword("");
        await onSession(result);
      })}
      {action("Primeiro acesso ou esqueci a senha", async () => go("code"), true)}
      {action("Entrar com e-mail", async () => onEmail(), true)}
    </>
  );
}
