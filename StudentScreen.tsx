import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Image,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import StudentInviteScanner from "./StudentInviteScanner";
import StudentPhotoScreen from "./StudentPhotoScreen";
import StudentGrades from "./StudentGrades";
import StudentCodeJoin from "./StudentCodeJoin";
import { ui } from "./ui-styles";
import { createStudentClient, verifyStudentSession, STUDENT_SESSION_KEY } from "./student-api";
import type {
  StudentIdentity,
  StudentRequest,
  ClassInvite,
  StudentActivity,
  StudentProfile,
} from "./student-api";
import { startGoogleLogin, checkGoogleLogin } from "./google-login";
import type { GoogleAttempt } from "./google-login";
export default function StudentScreen({ apiUrl, onBack }: { apiUrl: string; onBack: () => void }) {
  const [scanning, setScanning] = useState(false),
    [activities, setActivities] = useState<StudentActivity[]>([]),
    [profiles, setProfiles] = useState<StudentProfile[] | null>([]),
    [photoProfile, setPhotoProfile] = useState<StudentProfile | null>(null);
  const [identity, setIdentity] = useState<StudentIdentity | null>(null),
    [token, setToken] = useState(""),
    [mode, setMode] = useState<"login" | "register">("login"),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [visible, setVisible] = useState(false),
    [code, setCode] = useState(""),
    [invite, setInvite] = useState<ClassInvite | null>(null),
    [requests, setRequests] = useState<StudentRequest[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState<GoogleAttempt | null>(null);
  const current = useRef<GoogleAttempt | null>(null),
    checking = useRef(false);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Não foi possível continuar.");
    } finally {
      setBusy(false);
    }
  }
  async function refresh(value = token) {
    const client = createStudentClient(apiUrl, value);
    const [list, own, profile] = await Promise.all([
      client<StudentRequest[]>("/api/class-join-requests/me"),
      client<StudentActivity[]>("/api/student/activities"),
      // An older API without photo support must not block grades and requests.
      client<StudentProfile[]>("/api/student/profile").catch(() => null),
    ]);
    setRequests(list);
    setActivities(own);
    setProfiles(profile);
  }
  async function accept(value: string) {
    const user = await verifyStudentSession(apiUrl, value);
    await SecureStore.setItemAsync(STUDENT_SESSION_KEY, JSON.stringify({ apiUrl, token: value }));
    setIdentity(user);
    setToken(value);
    setPassword("");
    setVisible(false);
    await refresh(value);
  }
  useEffect(() => {
    let active = true;
    void run(async () => {
      const saved = await SecureStore.getItemAsync(STUDENT_SESSION_KEY);
      if (saved) {
        const value = JSON.parse(saved);
        if (active && value.apiUrl === apiUrl && typeof value.token === "string")
          await accept(value.token);
      }
    });
    return () => {
      active = false;
      current.current = null;
    };
  }, [apiUrl]);
  async function check() {
    const value = current.current;
    if (!value || checking.current) return;
    checking.current = true;
    try {
      if (await checkGoogleLogin(apiUrl, value)) {
        if (current.current !== value) return;
        current.current = null;
        setAttempt(null);
        await accept(value.token);
      }
    } catch (e) {
      if (current.current === value) {
        current.current = null;
        setAttempt(null);
        setMessage(e instanceof Error ? e.message : "Entrada Google não concluída.");
      }
    } finally {
      checking.current = false;
    }
  }
  useEffect(() => {
    if (!attempt) return;
    void check();
    const timer = setInterval(() => {
      if (AppState.currentState === "active") void check();
    }, 3000);
    return () => clearInterval(timer);
  }, [attempt]);
  const button = (label: string, fn: () => Promise<void>, secondary = false) => (
    <Pressable
      accessibilityRole="button"
      disabled={busy}
      style={[secondary ? ui.secondary : ui.primary, busy && ui.disabled]}
      onPress={() => void run(fn)}
    >
      <Text style={secondary ? ui.buttonText : ui.primaryText}>{label}</Text>
    </Pressable>
  );
  if (photoProfile)
    return (
      <SafeAreaView style={ui.safe}>
        <ScrollView contentContainerStyle={ui.container}>
          <StudentPhotoScreen
            apiUrl={apiUrl}
            token={token}
            profile={photoProfile}
            onBack={() => setPhotoProfile(null)}
            onSaved={async () => {
              setPhotoProfile(null);
              setMessage("Foto salva no seu cadastro.");
              await refresh().catch(() => {});
            }}
          />
        </ScrollView>
      </SafeAreaView>
    );
  if (scanning)
    return (
      <SafeAreaView style={ui.safe}>
        <ScrollView contentContainerStyle={ui.container}>
          <StudentInviteScanner
            onClose={() => setScanning(false)}
            onCode={(value) => {
              setCode(value);
              setInvite(null);
              setScanning(false);
            }}
          />
        </ScrollView>
      </SafeAreaView>
    );
  return (
    <SafeAreaView style={ui.safe}>
      <ScrollView contentContainerStyle={ui.container} keyboardShouldPersistTaps="handled">
        <Text style={ui.eyebrow}>UFA PROVA · ALUNO</Text>
        <Text style={ui.title}>
          {identity
            ? "Minhas turmas"
            : mode === "register"
              ? "Criar conta de aluno"
              : "Entrar como aluno"}
        </Text>
        {busy && <ActivityIndicator />}
        {!identity ? (
          <>
            {mode === "register" && (
              <TextInput
                style={ui.input}
                accessibilityLabel="Seu nome"
                placeholder="Seu nome"
                value={name}
                onChangeText={setName}
              />
            )}
            <TextInput
              style={ui.input}
              accessibilityLabel="E-mail do aluno"
              placeholder="E-mail"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              style={ui.input}
              accessibilityLabel="Senha do aluno"
              placeholder={mode === "register" ? "Senha (pelo menos 10 caracteres)" : "Senha"}
              secureTextEntry={!visible}
              autoCapitalize="none"
              value={password}
              onChangeText={setPassword}
            />
            <Pressable
              accessibilityRole="button"
              style={ui.passwordToggle}
              onPress={() => setVisible(!visible)}
            >
              <Text style={ui.linkText}>{visible ? "Ocultar senha" : "Mostrar senha"}</Text>
            </Pressable>
            {button(mode === "register" ? "Criar conta" : "Entrar", async () => {
              const client = createStudentClient(apiUrl);
              if (mode === "register") {
                if (!name.trim() || password.length < 10)
                  throw Error("Informe seu nome e uma senha de pelo menos 10 caracteres.");
                await client("/api/auth/student/register", {
                  displayName: name.trim(),
                  email: email.trim(),
                  password,
                });
                setMode("login");
                setPassword("");
                setMessage(
                  "Enviamos um link de confirmação para seu e-mail. Confirme-o no navegador e entre aqui.",
                );
              } else {
                const result = await client<{ token: string }>("/api/auth/login", {
                  email: email.trim(),
                  password,
                });
                if (!result?.token) throw Error("Sessão inválida.");
                await accept(result.token);
              }
            })}
            {!attempt &&
              button(
                "Entrar com Google",
                async () => {
                  const value = await startGoogleLogin(apiUrl, "student");
                  current.current = value;
                  setAttempt(value);
                  try {
                    await Linking.openURL(value.browserUrl);
                    setMessage("Escolha sua conta Google e volte ao aplicativo.");
                  } catch (e) {
                    current.current = null;
                    setAttempt(null);
                    throw e;
                  }
                },
                true,
              )}
            {attempt && (
              <>
                {button("Concluir entrada com Google", check, true)}
                <Pressable
                  style={ui.secondary}
                  onPress={() => {
                    current.current = null;
                    setAttempt(null);
                    setMessage("");
                  }}
                >
                  <Text style={ui.buttonText}>Cancelar entrada com Google</Text>
                </Pressable>
              </>
            )}
            <Pressable
              style={ui.secondary}
              onPress={() => {
                setMode(mode === "login" ? "register" : "login");
                setMessage("");
              }}
            >
              <Text style={ui.buttonText}>
                {mode === "login" ? "Criar conta de aluno" : "Já tenho conta"}
              </Text>
            </Pressable>
            {button(
              "Reenviar confirmação de e-mail",
              async () => {
                await createStudentClient(apiUrl)("/api/auth/resend-verification", {
                  email: email.trim(),
                });
                setMessage("Se houver uma confirmação pendente, enviaremos um novo link.");
              },
              true,
            )}
            <Pressable style={ui.secondary} onPress={onBack}>
              <Text style={ui.buttonText}>Voltar para acesso de professor</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={ui.text}>Olá, {identity.user.displayName}.</Text>
            <StudentCodeJoin
              apiUrl={apiUrl}
              token={token}
              busy={busy}
              run={run}
              onLinked={async (claim) => {
                await refresh();
                setMessage(
                  claim.classes.length
                    ? `Conta vinculada. Turmas: ${claim.classes.map((c) => c.className).join(", ")}.`
                    : "Conta vinculada ao seu cadastro.",
                );
              }}
            />
            <Text style={ui.title}>Entrar com o código da turma</Text>
            <Text style={ui.small}>
              Digite o código da turma fornecido pelo professor. O vínculo depende da aprovação dele.
            </Text>
            <TextInput
              style={ui.input}
              accessibilityLabel="Código da turma"
              placeholder="ABCD-EFGH"
              maxLength={9}
              autoCapitalize="characters"
              autoCorrect={false}
              value={code}
              onChangeText={(value) => {
                setCode(value.toUpperCase());
                setInvite(null);
              }}
            />
            {button("Conferir turma", async () =>
              setInvite(
                await createStudentClient(apiUrl, token)<ClassInvite>(
                  "/api/class-invites/inspect",
                  { code },
                ),
              ),
            )}
            {invite && (
              <View style={ui.card}>
                <Text style={ui.cardTitle}>{invite.schoolName}</Text>
                <Text style={ui.text}>{invite.className}</Text>
                <Text style={ui.small}>Professor: {invite.teacherName}</Text>
                {button("Solicitar participação", async () => {
                  await createStudentClient(apiUrl, token)("/api/class-invites/request", { code });
                  setInvite(null);
                  await refresh();
                  setMessage("Solicitação enviada. Aguarde a aprovação do professor.");
                })}
              </View>
            )}
            <Pressable style={ui.secondary} onPress={() => setScanning(true)}>
              <Text style={ui.buttonText}>Ler QR Code da turma</Text>
            </Pressable>
            <Text style={ui.title}>Meus vínculos e solicitações</Text>
            {button("Atualizar solicitações", async () => refresh(), true)}
            {!requests.length && <Text style={ui.small}>Nenhuma solicitação enviada.</Text>}
            {requests.map((r) => (
              <View key={r.id} style={ui.card}>
                <Text style={ui.cardTitle}>{r.className}</Text>
                <Text style={ui.small}>{r.schoolName}</Text>
                <Text style={ui.text}>
                  {r.status === "approved"
                    ? "Vínculo aprovado"
                    : r.status === "rejected"
                      ? "Solicitação rejeitada"
                      : "Aguardando aprovação"}
                </Text>
              </View>
            ))}
            <Text style={ui.title}>Meu cadastro</Text>
            {profiles === null ? (
              <Text style={ui.small}>Não foi possível carregar seu cadastro agora.</Text>
            ) : !profiles.length ? (
              <Text style={ui.small}>
                A foto do cadastro fica disponível depois que o professor aprovar seu vínculo.
              </Text>
            ) : (
              profiles.map((p) => (
                <View key={p.id} style={ui.card}>
                  {p.selfieDataUrl ? (
                    <Image
                      source={{ uri: p.selfieDataUrl }}
                      style={styles.avatar}
                      accessibilityLabel={`Foto de ${p.name}`}
                    />
                  ) : (
                    <Text style={ui.small}>Cadastro sem foto</Text>
                  )}
                  <Text style={ui.cardTitle}>{p.name}</Text>
                  {!!p.registration && <Text style={ui.small}>Matrícula: {p.registration}</Text>}
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    style={[ui.secondary, busy && ui.disabled]}
                    onPress={() => {
                      setMessage("");
                      setPhotoProfile(p);
                    }}
                  >
                    <Text style={ui.buttonText}>
                      {p.selfieDataUrl ? "Trocar foto" : "Adicionar foto"}
                    </Text>
                  </Pressable>
                </View>
              ))
            )}
            <StudentGrades activities={activities} />
            {button(
              "Sair",
              async () => {
                await createStudentClient(apiUrl, token)("/api/auth/logout", {});
                await SecureStore.deleteItemAsync(STUDENT_SESSION_KEY);
                setIdentity(null);
                setToken("");
                setRequests([]);
                setProfiles([]);
                setInvite(null);
                onBack();
              },
              true,
            )}
          </>
        )}
        {!!message && (
          <Text accessibilityLiveRegion="polite" style={ui.text}>
            {message}
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 96, height: 96, borderRadius: 48, marginBottom: 12, backgroundColor: "#e2e8f0" },
});
