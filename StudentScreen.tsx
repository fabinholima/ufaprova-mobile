import { useEffect, useRef, useState, useMemo } from "react";
import {
  AppState,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { sessionStore as SecureStore } from "./platform-store";
import { loginToken, persistSession } from "./platform-http";
import { PORTAL_URL, sameApi } from "./api-config";
import StudentInviteScanner from "./StudentInviteScanner";
import StudentPhotoScreen from "./StudentPhotoScreen";
import StudentGrades from "./StudentGrades";
import StudentEssays from "./StudentEssays";
import StudentCodeJoin from "./StudentCodeJoin";
import StudentCodeAccess from "./StudentCodeAccess";
import DeleteAccount from "./DeleteAccount";
import { useUi } from "./ui-styles";
import { useColors } from "./theme";
import { EmptyState, Header, Loading, Notice, Screen, TabBar } from "./components";
import type { Tab } from "./components";
import { createStudentClient, verifyStudentSession, STUDENT_SESSION_KEY } from "./student-api";
import type {
  StudentIdentity,
  StudentRequest,
  ClassInvite,
  StudentActivity,
  StudentProfile,
} from "./student-api";
import { startGoogleLogin, checkGoogleLogin } from "./google-login";
import { requestPasswordReset } from "./password-reset";
import { disablePush, enablePush, onResultOpened, syncPush } from "./push";
import type { PushStatus } from "./push";
import type { GoogleAttempt } from "./google-login";
type StudentTab = "grades" | "essays" | "classes" | "profile";
const studentTabs: Tab<StudentTab>[] = [
  { key: "grades", label: "Notas", icon: "stats-chart" },
  { key: "essays", label: "Redações", icon: "create" },
  { key: "classes", label: "Turmas", icon: "people" },
  { key: "profile", label: "Perfil", icon: "person-circle" },
];
const photoSkipKey = (studentId: string) => `ufaprova.studentPhotoSkipped.${studentId}`;
// onTeacherArea: na web (aluno.<domínio>), leva à área do professor em vez de
// voltar para a tela de entrada do aplicativo.
export default function StudentScreen({
  apiUrl,
  onBack,
  onTeacherArea,
}: {
  apiUrl: string;
  onBack: () => void;
  onTeacherArea?: () => void;
}) {
  const [scanning, setScanning] = useState(false),
    [activities, setActivities] = useState<StudentActivity[]>([]),
    [profiles, setProfiles] = useState<StudentProfile[] | null>([]),
    [photoProfile, setPhotoProfile] = useState<StudentProfile | null>(null),
    // Aberta sozinha ao entrar: "Agora não" fica guardado e não pergunta de novo.
    [photoPrompt, setPhotoPrompt] = useState(false),
    [tab, setTab] = useState<StudentTab>("grades"),
    [refreshing, setRefreshing] = useState(false),
    [push, setPush] = useState<PushStatus>("unsupported"),
    // Avaliação a abrir depois de tocar num aviso de nota nova.
    [openResultId, setOpenResultId] = useState<string | null>(null);
  const ui = useUi(),
    colors = useColors();
  const [identity, setIdentity] = useState<StudentIdentity | null>(null),
    [token, setToken] = useState(""),
    [mode, setMode] = useState<"login" | "register" | "code">("login"),
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
  const gradesRequest = useMemo(() => createStudentClient(apiUrl, token), [apiUrl, token]);
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
  async function forgetSession() {
    await SecureStore.deleteItemAsync(STUDENT_SESSION_KEY);
    setIdentity(null);
    setToken("");
    setRequests([]);
    setProfiles([]);
    setInvite(null);
    onBack();
  }
  // first: logo após entrar, abre Turmas quando ainda não há notas para mostrar.
  async function refresh(value = token, first = false) {
    const client = createStudentClient(apiUrl, value);
    const [list, own, profile] = await Promise.all([
      client<StudentRequest[]>("/api/class-join-requests/me"),
      client<StudentActivity[]>("/api/student/activities"),
      // An older API without photo support must not block grades and requests.
      client<StudentProfile[]>("/api/student/profile").catch(() => null),
    ]);
    setRequests(list);
    setActivities(own);
    if (first) setTab(own.length ? "grades" : "classes");
    setProfiles(profile);
    return profile;
  }
  async function accept(received: string) {
    const value = await persistSession(apiUrl, received);
    const user = await verifyStudentSession(apiUrl, value);
    await SecureStore.setItemAsync(STUDENT_SESSION_KEY, JSON.stringify({ apiUrl, token: value }));
    setIdentity(user);
    setToken(value);
    setPassword("");
    setVisible(false);
    const profile = await refresh(value, true);
    // Sem pedir permissão aqui: só renova o registro de quem já ativou.
    void syncPush(createStudentClient(apiUrl, value))
      .then(setPush)
      .catch(() => setPush("unsupported"));
    // Primeiro acesso com o cadastro sem foto: abre a câmera direto.
    const missing = profile?.find((p) => !p.selfieDataUrl);
    if (missing && !(await SecureStore.getItemAsync(photoSkipKey(missing.id)))) {
      setPhotoPrompt(true);
      setPhotoProfile(missing);
    }
  }
  useEffect(() => {
    let active = true;
    void run(async () => {
      const saved = await SecureStore.getItemAsync(STUDENT_SESSION_KEY);
      if (saved) {
        const value = JSON.parse(saved);
        if (active && sameApi(value.apiUrl, apiUrl) && typeof value.token === "string")
          await accept(value.token);
      }
    });
    return () => {
      active = false;
      current.current = null;
    };
  }, [apiUrl]);
  useEffect(() => {
    if (!identity) return;
    return onResultOpened((resultId) => {
      setTab("grades");
      setOpenResultId(resultId);
      void refresh().catch(() => {});
    });
  }, [identity]);
  async function turnOnPush() {
    let status: PushStatus;
    try {
      status = await enablePush(createStudentClient(apiUrl, token));
    } catch {
      setMessage("Não foi possível ativar os avisos agora. Tente novamente mais tarde.");
      return;
    }
    setPush(status);
    setMessage(
      status === "on"
        ? "Pronto: você recebe um aviso quando o professor publicar uma nota."
        : status === "denied"
          ? "Os avisos estão bloqueados. Libere as notificações do UFA Prova nas configurações do celular."
          : "",
    );
  }
  const pushCard = () => (
    <View style={ui.card}>
      <Text style={ui.cardTitle}>Aviso de nota nova</Text>
      <Text style={ui.small}>
        {push === "on"
          ? "Ativado neste celular. O aviso mostra só o nome da avaliação; a nota aparece aqui no aplicativo."
          : push === "denied"
            ? "Bloqueado nas configurações do celular."
            : "Receba um aviso quando o professor publicar uma nota. O aviso mostra só o nome da avaliação."}
      </Text>
      {push === "ask" && button("Ativar avisos", turnOnPush)}
      {push === "denied" && button("Abrir configurações", () => Linking.openSettings(), true)}
    </View>
  );
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
      <Screen>
        <StudentPhotoScreen
          apiUrl={apiUrl}
          token={token}
          profile={photoProfile}
          backLabel={photoPrompt ? "Agora não" : "Voltar"}
          onBack={() => {
            if (photoPrompt)
              void SecureStore.setItemAsync(photoSkipKey(photoProfile.id), "1").catch(() => {});
            setPhotoPrompt(false);
            setPhotoProfile(null);
          }}
          onSaved={async () => {
            setPhotoPrompt(false);
            setPhotoProfile(null);
            setMessage("Foto salva no seu cadastro.");
            await refresh().catch(() => {});
          }}
        />
      </Screen>
    );
  if (scanning)
    return (
      <Screen>
        <StudentInviteScanner
          onClose={() => setScanning(false)}
          onCode={(value) => {
            setCode(value);
            setInvite(null);
            setScanning(false);
          }}
        />
      </Screen>
    );
  const pullToRefresh = () => {
    setRefreshing(true);
    void refresh()
      .catch((e) => setMessage(e instanceof Error ? e.message : "Não foi possível atualizar."))
      .finally(() => setRefreshing(false));
  };
  const pendingRequests = requests.filter((r) => r.status === "pending").length;
  return (
    <Screen
      refreshing={refreshing}
      onRefresh={identity ? pullToRefresh : undefined}
      tabs={
        identity ? (
          <TabBar
            tabs={studentTabs.map((t) => (t.key === "classes" ? { ...t, badge: pendingRequests } : t))}
            current={tab}
            onChange={(key) => {
              setTab(key);
              setMessage("");
            }}
          />
        ) : undefined
      }
    >
      <Header
        title={
          identity
            ? tab === "grades"
              ? "Minhas notas"
              : tab === "essays"
                ? "Minhas redações"
                : tab === "classes"
                  ? "Minhas turmas"
                  : "Meu perfil"
            : mode === "register"
              ? "Criar conta de aluno"
              : mode === "code"
                ? "Entrar com o código da escola"
                : "Entrar como aluno"
        }
        subtitle={identity ? `Olá, ${identity.user.displayName}.` : undefined}
      />
      {busy && <Loading label="Carregando" />}
      {!identity && mode === "code" ? (
        <>
          <StudentCodeAccess
            apiUrl={apiUrl}
            busy={busy}
            run={run}
            onSession={async (result) => {
              const value = loginToken(result);
              if (!value) throw Error("Sessão inválida.");
              await accept(value);
            }}
            onEmail={() => {
              setMode("login");
              setMessage("");
            }}
          />
          <Pressable style={ui.secondary} onPress={onTeacherArea ?? onBack}>
            <Text style={ui.buttonText}>
              {onTeacherArea ? "Sou professor · abrir área do professor" : "Voltar para acesso de professor"}
            </Text>
          </Pressable>
        </>
      ) : !identity ? (
        <>
          {mode === "login" && (
            <Pressable
              accessibilityRole="button"
              style={ui.secondary}
              onPress={() => {
                setMode("code");
                setMessage("");
              }}
            >
              <Text style={ui.buttonText}>Não tenho e-mail · entrar com o código da escola</Text>
            </Pressable>
          )}
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
              const result = await client<{ token?: string }>("/api/auth/login", {
                email: email.trim(),
                password,
              });
              const value = loginToken(result);
              if (!value) throw Error("Sessão inválida.");
              await accept(value);
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
            <Text style={ui.buttonText}>{mode === "login" ? "Criar conta de aluno" : "Já tenho conta"}</Text>
          </Pressable>
          {mode === "login" &&
            button(
              "Esqueci minha senha",
              async () => setMessage(await requestPasswordReset(apiUrl, email)),
              true,
            )}
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
          <Pressable style={ui.secondary} onPress={onTeacherArea ?? onBack}>
            <Text style={ui.buttonText}>
              {onTeacherArea ? "Sou professor · abrir área do professor" : "Voltar para acesso de professor"}
            </Text>
          </Pressable>
        </>
      ) : (
        <>
          {tab === "grades" ? (
            <>
              {!activities.length && (
                <EmptyState
                  icon="stats-chart"
                  title="Ainda não há notas"
                  text="As notas aparecem aqui depois que o professor publicar os resultados das suas avaliações."
                >
                  <Pressable style={ui.secondary} onPress={() => setTab("classes")}>
                    <Text style={ui.buttonText}>Ver minhas turmas</Text>
                  </Pressable>
                </EmptyState>
              )}
              {push === "ask" && requests.some((r) => r.status === "approved") && pushCard()}
              <StudentGrades
                activities={activities}
                request={gradesRequest}
                openResultId={openResultId}
                onOpened={() => setOpenResultId(null)}
              />
            </>
          ) : tab === "essays" ? (
            <StudentEssays
              request={gradesRequest}
              onOpenPortal={() => void Linking.openURL(`${PORTAL_URL}/portal`).catch(() => setMessage("Não foi possível abrir o portal."))}
            />
          ) : tab === "classes" ? (
            <>
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
                  await createStudentClient(apiUrl, token)<ClassInvite>("/api/class-invites/inspect", {
                    code,
                  }),
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
              {button(
                "Atualizar solicitações",
                async () => {
                  await refresh();
                },
                true,
              )}
              {!requests.length && (
                <EmptyState
                  icon="people"
                  title="Nenhuma solicitação enviada"
                  text="Use o código ou o QR Code da turma para pedir participação."
                />
              )}
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
            </>
          ) : (
            <>
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
                        style={[styles.avatar, { backgroundColor: colors.surfaceMuted }]}
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
                        setPhotoPrompt(false);
                        setPhotoProfile(p);
                      }}
                    >
                      <Text style={ui.buttonText}>{p.selfieDataUrl ? "Trocar foto" : "Adicionar foto"}</Text>
                    </Pressable>
                  </View>
                ))
              )}
              {push !== "unsupported" && pushCard()}
              {button(
                "Sair",
                async () => {
                  // Este celular para de receber avisos desta conta.
                  await disablePush(createStudentClient(apiUrl, token)).catch(() => {});
                  setPush("unsupported");
                  await createStudentClient(apiUrl, token)("/api/auth/logout", {});
                  await forgetSession();
                },
                true,
              )}
              <DeleteAccount
                request={(path, input) => createStudentClient(apiUrl, token)(path, input)}
                onDeleted={forgetSession}
              />
            </>
          )}
        </>
      )}
      {!!message && <Notice>{message}</Notice>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    marginBottom: 12,
  },
});
