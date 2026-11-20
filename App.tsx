import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, BackHandler, Linking, Pressable, Text, TextInput, Vibration, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import NetInfo from '@react-native-community/netinfo';
import * as Crypto from 'expo-crypto';
import { sessionStore as SecureStore } from './platform-store';
import { authHeaders, credentials, endSession, loginToken, persistSession } from './platform-http';
import { API_URL, PORTAL_URL, sameApi } from './api-config';
import { moveAccount } from './account';
import { hostProfile, switchProfile, warnBeforeLeaving } from './host-profile';
import EducatorRegistrationScreen from './EducatorRegistrationScreen';
import StudentScreen from './StudentScreen';
import DeleteAccount from './DeleteAccount';
import {STUDENT_SESSION_KEY, createStudentClient} from './student-api';
import CaptureScreen from './CaptureScreen';
import type { CapturedSheet } from './CaptureScreen';
import RecordScreen, { localStatus } from './RecordScreen';
import ResultsScreen from './ResultsScreen';
import EssayScreen from './EssayScreen';
import { ACCOUNT_KEY, PERSISTENT_STORE, accountClient, accountFromLogin, getStore } from './offline-runtime';
import type { Account } from './offline-runtime';
import type { LocalRecord, OfflineStore, Operation } from './offline-store';
import { createSynchronizer, refreshRecord } from './offline-sync';
import { prepareImage } from './prepare-image';
import { ScanApiError } from './scan-api';
import {answerKeyProblem,parseApplications} from './application-contract';
import type {CorrectionApplication} from './application-contract';
import { useUi } from './ui-styles';
import { Chip, EmptyState, Header, Loading, Notice, ProgressBar, Screen, TabBar } from './components';
import TeacherHome from './TeacherHome';
import { applicationProgress, needsAttention } from './teacher-dashboard';
import type { Tab } from './components';
import { startGoogleLogin, checkGoogleLogin } from './google-login';
import { requestPasswordReset } from './password-reset';
import type { GoogleAttempt } from './google-login';

type Screen = 'login' | 'home' | 'schools' | 'scan' | 'records' | 'record' | 'results' | 'essays' | 'account';
type TeacherTab = 'correct' | 'essays' | 'records' | 'account';
const tabOf = (screen: Screen): TeacherTab => screen === 'records' || screen === 'record' ? 'records' : screen === 'account' ? 'account' : screen === 'essays' ? 'essays' : 'correct';
// Tela anterior de cada tela, para o botão voltar do Android e o "Voltar" do cabeçalho.
const parentOf: Partial<Record<Screen, Screen>> = { schools: 'home', scan: 'home', results: 'home', record: 'records' };
type School = { id: string; name: string; city?: string; state?: string };
type Assessment = { id: string; title: string; subject?: string; grade?: string };
type SchoolClass = { id: string; name: string; grade?: string; schoolYear?: number };

export default function App() {
  return <SafeAreaProvider><StatusBar style="auto" /><TeacherApp /></SafeAreaProvider>;
}

function TeacherApp() {
  const ui = useUi();
  const [educatorRegistration,setEducatorRegistration]=useState(false);
  const [studentAccess,setStudentAccess]=useState(false);
  useEffect(()=>{void SecureStore.getItemAsync(STUDENT_SESSION_KEY).then(raw=>{if(raw){const value=JSON.parse(raw);if(typeof value.token==='string'&&sameApi(value.apiUrl))setStudentAccess(true);}}).catch(()=>{});},[]);
  const [store, setStore] = useState<OfflineStore | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const ownerRef = useRef<string | null>(null);
  const [screen, setScreen] = useState<Screen>('login');
  const [booting, setBooting] = useState(true);
  const [loading, setLoading] = useState(false);
  const savingCapture = useRef(false);
  const [syncing, setSyncing] = useState(false);
  const [connected, setConnected] = useState(false);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [authExpired, setAuthExpired] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [googleAttempt, setGoogleAttempt] = useState<GoogleAttempt | null>(null);
  const googleChecking = useRef(false);
  const googleAttemptRef = useRef<GoogleAttempt | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [schools, setSchools] = useState<School[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [applications,setApplications]=useState<CorrectionApplication[]>([]);
  const [selectedApplication,setSelectedApplication]=useState<CorrectionApplication|null>(null);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [school, setSchool] = useState<School | null>(null);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [schoolClass, setSchoolClass] = useState<SchoolClass | null>(null);
  const [records, setRecords] = useState<LocalRecord[]>([]);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Última aplicação usada, para "Continuar de onde parou".
  const [lastApplicationId, setLastApplicationId] = useState<string | null>(null);
  const [recordsFilter, setRecordsFilter] = useState<'all' | 'attention'>('all');
  // Cartões salvos desde que a câmera abriu (captura em sequência).
  const [sessionSaved, setSessionSaved] = useState(0);
  // Alunos ainda sem cartão corrigido; só em memória, nunca no aparelho.
  const [missing, setMissing] = useState<string[] | null>(null);
  // Voltar dentro da aba Redações (aplicação → turma → aluno).
  const essayBack = useRef<(() => boolean) | null>(null);
  const client = useMemo(() => account ? accountClient(account) : null, [account]);
  const synchronizer = useMemo(() => store && client && account ? createSynchronizer(store, client, account.owner) : null, [store, client, account]);

  const reload = useCallback(async () => {
    if (!store || !account) return;
    const [savedRecords, pending] = await Promise.all([store.list(account.owner), store.operations(account.owner)]);
    if (ownerRef.current === account.owner) { setRecords(savedRecords); setOperations(pending); }
  }, [store, account]);

  async function activate(saved: Account, storage: OfflineStore) {
    ownerRef.current = saved.owner;
    setAccount(saved); setAuthExpired(false); setEmail(saved.email);
    const [cachedSchools, cachedAssessments, cachedClasses, selectedSchool, savedRecords, pending, cachedApplications] = await Promise.all([
      storage.cache<School[]>(saved.owner, 'schools'), storage.cache<Assessment[]>(saved.owner, 'assessments'), storage.cache<SchoolClass[]>(saved.owner, 'classes'), storage.cache<string>(saved.owner, 'school'), storage.list(saved.owner), storage.operations(saved.owner), storage.cache<CorrectionApplication[]>(saved.owner,'applications'),
    ]);
    const lastApplication = await storage.cache<string>(saved.owner, 'application');
    if (ownerRef.current !== saved.owner) return;
    setSchools(cachedSchools || []); setSchool(cachedSchools?.find(item => item.id === selectedSchool) || cachedSchools?.[0] || null);
    setApplications(cachedApplications || []);setSelectedApplication(null);
    setAssessments(cachedAssessments || []); setClasses(cachedClasses || []); setAssessment(null); setSchoolClass(null);
    setRecords(savedRecords); setOperations(pending); setRecordId(null); setLastApplicationId(lastApplication || null); setScreen('home');
  }

  const initialize = useCallback(async () => {
    setBooting(true); setError('');
    try {
      const storage = await getStore(); setStore(storage);
      const raw = await SecureStore.getItemAsync(ACCOUNT_KEY);
      if (raw) {
        let saved: Account & { sessionToken?: string } = JSON.parse(raw);
        if (sameApi(saved.apiUrl)) {
          if (saved.apiUrl !== API_URL.replace(/\/$/, '')) {
            const moved = moveAccount(saved, API_URL);
            await storage.renameOwner(saved.owner, moved.owner);
            saved = { ...saved, ...moved };
            await SecureStore.setItemAsync(ACCOUNT_KEY, JSON.stringify(saved));
          }
          const { sessionToken: _token, ...account } = saved;
          await activate(account, storage);
        }
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível abrir os dados do aparelho.'); }
    finally { setBooting(false); }
  }, []);
  useEffect(() => { void initialize(); }, [initialize]);
  useEffect(() => {
    const network = NetInfo.addEventListener(state => setConnected(state.isConnected === true && state.isInternetReachable !== false));
    const lifecycle = AppState.addEventListener('change', state => setActive(state === 'active'));
    return () => { network(); lifecycle.remove(); };
  }, []);

  const sync = useCallback(async (force = false) => {
    if (!synchronizer || !account || !connected) return;
    const owner = account.owner;
    setSyncing(true);
    try {
      const report = await synchronizer(force);
      if (ownerRef.current !== owner) return;
      setAuthExpired(report.authExpired);
      setMessage(report.error || (report.pending ? `${report.pending} alteração(ões) aguardando sincronização.` : 'Dados sincronizados.'));
      await reload();
    } catch (err) { if (ownerRef.current === owner) setError(err instanceof Error ? err.message : 'Falha no armazenamento local.'); }
    finally { if (ownerRef.current === owner) setSyncing(false); }
  }, [synchronizer, account, connected, reload]);
  const hasWork = operations.some(operation => operation.state === 'pending') || records.some(record => record.remoteId && (record.scan?.status !== 'completed' || !record.submission));
  const unsent = !PERSISTENT_STORE && operations.length > 0;
  useEffect(() => warnBeforeLeaving(unsent), [unsent]);
  useEffect(() => {
    if (!connected || !active || authExpired || !hasWork || !account) return;
    void sync();
    const timer = setInterval(() => { void sync(); }, 10_000);
    return () => clearInterval(timer);
  }, [connected, active, authExpired, hasWork, account, sync]);

  async function loadCatalog(current: Account, storage: OfflineStore, onlySchools = false) {
    const api = accountClient(current);
    try {
      const profile = await api.catalog('/api/educator-profile') as { schools?: School[] };
      if (!Array.isArray(profile.schools)) throw new Error('Lista de escolas inválida.');
      await storage.putCache(current.owner, 'schools', profile.schools);
      if (ownerRef.current === current.owner) { setSchools(profile.schools); setSchool(previous => profile.schools!.find(item => item.id === previous?.id) || profile.schools![0] || null); }
      if (!onlySchools) {
        const [list, classList, applicationList] = await Promise.all([api.catalog('/api/assessments'), api.catalog('/api/classes'),api.catalog('/api/assessment-applications')]);
        if (!Array.isArray(list) || !Array.isArray(classList)) throw new Error('Listas de avaliações ou turmas inválidas.');
        const appList=parseApplications(applicationList);await storage.putCache(current.owner,'applications',appList);
        await storage.putCache(current.owner, 'assessments', list); await storage.putCache(current.owner, 'classes', classList);
        if (ownerRef.current === current.owner) { setAssessments(list); setClasses(classList);setApplications(appList); }
      }
    } catch (err) {
      if (ownerRef.current === current.owner) {
        setMessage(err instanceof ScanApiError && err.status != null && err.status >= 400 && err.status < 500 ? err.message : 'Usando os dados já carregados neste aparelho. Conecte-se para atualizar as listas.');
        if (err instanceof ScanApiError && err.status === 401) setAuthExpired(true);
      }
    }
  }
  async function acceptSession(received: string, storage: OfflineStore) {
    const token = await persistSession(API_URL, received);
    const identityResponse = await fetch(`${API_URL}/api/auth/me`, { credentials, headers: authHeaders(token), signal: AbortSignal.timeout(15_000) });
    const identityBody = await identityResponse.json();
    if (!identityResponse.ok) throw new Error(identityBody.error || 'Não foi possível confirmar a instituição da conta.');
    if(identityBody.data?.role === 'student'){await SecureStore.setItemAsync(STUDENT_SESSION_KEY,JSON.stringify({apiUrl:API_URL,token}));setStudentAccess(true);setPassword('');return;}
    const current = accountFromLogin(API_URL, identityBody.data);
    ownerRef.current = current.owner;
    await SecureStore.deleteItemAsync(ACCOUNT_KEY);
    await SecureStore.setItemAsync('ufaprova.session', token);
    await SecureStore.setItemAsync(ACCOUNT_KEY, JSON.stringify({ ...current, sessionToken: token }));
    await activate(current, storage); setPassword(''); setShowPassword(false);
    await loadCatalog(current, storage);
  }
  function cancelGoogle() {
    googleAttemptRef.current = null; setGoogleAttempt(null); setMessage('');
  }
  async function googleSignIn() {
    if (loading || !store || googleAttemptRef.current) return;
    setLoading(true); setError(''); setMessage('');
    try {
      const attempt = await startGoogleLogin(API_URL);
      googleAttemptRef.current = attempt; setGoogleAttempt(attempt);
      setMessage('Escolha sua conta Google no navegador e depois volte ao UFA Prova para concluir a entrada.');
      await Linking.openURL(attempt.browserUrl);
    } catch (err) { cancelGoogle(); setError(err instanceof Error ? err.message : 'Não foi possível abrir a entrada com Google.'); }
    finally { setLoading(false); }
  }
  const finishGoogleSignIn = useCallback(async () => {
    const attempt = googleAttemptRef.current;
    if (!attempt || !store || googleChecking.current) return;
    googleChecking.current = true;
    try {
      const ready = await checkGoogleLogin(API_URL, attempt);
      if (googleAttemptRef.current !== attempt || !ready) return;
      setLoading(true);
      await acceptSession(attempt.token, store);
      cancelGoogle();
    } catch (err) {
      if (googleAttemptRef.current === attempt) {
        cancelGoogle(); setError(err instanceof Error ? err.message : 'Não foi possível concluir a entrada com Google.');
      }
    } finally { googleChecking.current = false; setLoading(false); }
  }, [store]);
  useEffect(() => {
    if (!googleAttempt || !active || !connected) return;
    void finishGoogleSignIn();
    const timer = setInterval(() => { void finishGoogleSignIn(); }, 3000);
    return () => clearInterval(timer);
  }, [googleAttempt, active, connected, finishGoogleSignIn]);
  useEffect(() => () => { googleAttemptRef.current = null; }, []);
  async function signIn() {
    if (loading || !store) return;
    setLoading(true); setError(''); setMessage('');
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, { method: 'POST', credentials, headers: { 'content-type': 'application/json', ...authHeaders(null) }, body: JSON.stringify({ email: email.trim(), password }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Não foi possível entrar.');
      const token = loginToken(body.data);
      if (!token) throw new Error('A API não retornou uma sessão válida.');
      await acceptSession(token, store);
    } catch (err) { setError(err instanceof Error ? err.message : 'Falha de conexão com a API.'); }
    finally { setLoading(false); }
  }
  // Token da sessão guardada da conta (no navegador a sessão é o cookie e não há token).
  async function sessionToken(current: Account) {
    const saved = await SecureStore.getItemAsync(ACCOUNT_KEY);
    const stored = saved ? JSON.parse(saved) : null;
    return stored?.owner === current.owner && typeof stored.sessionToken === 'string' ? stored.sessionToken : undefined;
  }
  async function signOut() {
    ownerRef.current = null;
    setAccount(null); setSyncing(false); setScreen('login'); setPassword(''); setError(''); setMessage('');
    setApplications([]);setSelectedApplication(null);setRecords([]); setOperations([]); setSchools([]); setSchool(null); setAssessments([]); setClasses([]); setAssessment(null); setSchoolClass(null);
    try { await SecureStore.deleteItemAsync(ACCOUNT_KEY); await SecureStore.deleteItemAsync('ufaprova.session'); await endSession(API_URL); }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível encerrar a sessão local.'); }
  }
  async function chooseSchool(item: School) {
    if (!account || !store) return;
    setSchool(item);
    await store.putCache(account.owner, 'school', item.id);
    if (ownerRef.current !== account.owner) return;
    setScreen('home');
    if (connected && !loading) { setLoading(true); try { await loadCatalog(account, store); } finally { setLoading(false); } }
  }
  function selectApplication(item: CorrectionApplication) {
    setSelectedApplication(item); setAssessment({ id: item.assessmentId, title: item.title }); setSchoolClass({ id: item.classId, name: item.className });
  }
  async function startCapture(item: CorrectionApplication) {
    if (!school) { setScreen('schools'); setMessage('Selecione a escola antes de fotografar os cartões.'); return; }
    selectApplication(item); setSessionSaved(0); setMissing(null); setError(''); setMessage('');
    setLastApplicationId(item.id); setScreen('scan');
    if (account && store) await store.putCache(account.owner, 'application', item.id).catch(() => {});
  }
  async function loadMissing() {
    if (!client || !selectedApplication) return;
    try {
      const results = await client.applicationResults(selectedApplication.id);
      setMissing(results.students.filter(student => student.processingStatus === 'not_scanned').map(student => student.studentName));
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível carregar a lista de alunos.'); }
  }
  async function saveCapture(sheet: CapturedSheet) {
    if (!store || !account) throw new Error('Abra os dados da conta antes de salvar.');
    if (savingCapture.current) return;
    savingCapture.current = true;
    try {
      const image = await prepareImage(sheet.photo);
      if (ownerRef.current !== account.owner) throw new Error('A conta mudou antes de salvar a captura.');
      if(!sheet.applicationId)throw Error('Selecione uma aplicação da prova antes de fotografar.');
      await store.create(account.owner, sheet, image);
      await reload();
      if (ownerRef.current === account.owner) { setSessionSaved(value => value + 1); setRecordId(null); Vibration.vibrate(60); }
    } finally { savingCapture.current = false; }
  }
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen === 'essays' && essayBack.current?.()) return true;
      const parent = parentOf[screen];
      if (parent) { setScreen(parent); return true; }
      if (screen !== 'login' && screen !== 'home') { setScreen('home'); return true; }
      return false;
    });
    return () => subscription.remove();
  }, [screen]);
  function changeTab(tab: TeacherTab) {
    setError('');
    if (tab === 'records') setRecordsFilter('all');
    setScreen(tab === 'records' ? 'records' : tab === 'account' ? 'account' : tab === 'essays' ? 'essays' : 'home');
  }
  async function pullToRefresh() {
    if (!account || !store || refreshing) return;
    setRefreshing(true);
    try { if (tabOf(screen) === 'records') await sync(true); else if (connected) await loadCatalog(account, store); }
    finally { setRefreshing(false); }
  }
  const selectedRecord = records.find(record => record.id === recordId);
  async function refreshSelected() {
    if (!connected || !client || !store || !selectedRecord) throw new Error('Conecte-se para atualizar o resultado do servidor.');
    await sync(true); await refreshRecord(store, client, selectedRecord); await reload();
  }
  async function retrySelected() {
    if (!connected || !client || !store || !selectedRecord?.remoteId) return;
    try { await client.retry(selectedRecord.remoteId); }
    finally { await refreshRecord(store, client, selectedRecord); await reload(); }
  }
  function nextCapture(record: LocalRecord) {
    setSchool({ id: record.sheet.schoolId, name: record.sheet.schoolName });
    setAssessment({ id: record.sheet.assessmentId, title: record.sheet.assessmentTitle });
    setSchoolClass({ id: record.sheet.classId, name: record.sheet.className });
    const application=applications.find(a=>a.id===record.sheet.applicationId);
    if(!application){setSelectedApplication(null);setScreen('home');setMessage('Selecione a aplicação antes de capturar o próximo cartão.');}else void startCapture(application);
  }
  if(educatorRegistration)return <EducatorRegistrationScreen apiUrl={API_URL} onBack={()=>setEducatorRegistration(false)} onCreated={(value,role)=>{setEducatorRegistration(false);setEmail(value);setPassword('');setShowPassword(false);setError('');setMessage(`Conta de ${role==='coordinator'?'coordenador':'professor'} criada. Confirme o link enviado ao seu e-mail e depois entre aqui.`);}} />;
  if(studentAccess&&hostProfile==='teacher')return <Screen>
    <Header title="Conta de aluno" />
    <Text style={ui.text}>Esta entrada é a área do professor. Suas notas e turmas ficam na área do aluno.</Text>
    <Pressable accessibilityRole="button" style={ui.primary} onPress={()=>switchProfile('student')}><Text style={ui.primaryText}>Abrir área do aluno</Text></Pressable>
    <Pressable accessibilityRole="button" style={ui.secondary} onPress={()=>{void endSession(API_URL).then(()=>SecureStore.deleteItemAsync(STUDENT_SESSION_KEY)).finally(()=>setStudentAccess(false));}}><Text style={ui.buttonText}>Sair e entrar como professor</Text></Pressable>
  </Screen>;
  if(studentAccess||hostProfile==='student')return <StudentScreen apiUrl={API_URL} onBack={()=>setStudentAccess(false)} onTeacherArea={hostProfile==='student'?()=>switchProfile('teacher'):undefined} />;
  if (booting || screen === 'login') return <Screen>
    <Header title="Correção de avaliações" />
    {booting ? <Loading label="Abrindo dados locais" /> : <>
      <Pressable accessibilityRole="button" style={ui.secondary} onPress={()=>hostProfile==='teacher'?switchProfile('student'):setStudentAccess(true)}><Text style={ui.buttonText}>{hostProfile==='teacher'?'Sou aluno · abrir área do aluno':'Sou aluno · entrar ou criar conta'}</Text></Pressable>
      <Text style={ui.text}>{PERSISTENT_STORE ? 'Entre uma vez com internet. Depois, as escolas, avaliações e turmas já carregadas ficam disponíveis neste aparelho.' : 'No navegador, nada da escola fica salvo no aparelho: as fotos ficam só nesta aba até serem enviadas.'}</Text>
      <TextInput style={ui.input} accessibilityLabel="E-mail" autoCapitalize="none" keyboardType="email-address" placeholder="E-mail" placeholderTextColor={ui.small.color} value={email} onChangeText={setEmail} />
      <TextInput style={ui.input} accessibilityLabel="Senha" secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false} textContentType="password" placeholder="Senha" placeholderTextColor={ui.small.color} value={password} onChangeText={setPassword} />
      <Pressable accessibilityRole="button" accessibilityLabel={showPassword ? 'Ocultar senha' : 'Mostrar senha'} style={ui.passwordToggle} onPress={() => setShowPassword(value => !value)}><Text style={ui.linkText}>{showPassword ? 'Ocultar senha' : 'Mostrar senha'}</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={loading} style={ui.passwordToggle} onPress={()=>{setError('');setMessage('');void requestPasswordReset(API_URL,email).then(setMessage,err=>setError(err instanceof Error?err.message:'Não foi possível pedir uma nova senha.'));}}><Text style={ui.linkText}>Esqueci minha senha</Text></Pressable>
      {!!error && <Notice tone="danger">{error}</Notice>}
      <Pressable disabled={loading || !store || !!googleAttempt} style={[ui.primary, (loading || !store || !!googleAttempt) && ui.disabled]} onPress={signIn}>{loading ? <ActivityIndicator color="#fff" /> : <Text style={ui.primaryText}>Entrar</Text>}</Pressable>
      <Text style={ui.separator}>ou</Text>
      <Pressable accessibilityRole="button" disabled={loading || !store || !!googleAttempt} style={[ui.secondary, (loading || !store || !!googleAttempt) && ui.disabled]} onPress={googleSignIn}><Text style={ui.buttonText}>Entrar com Google</Text></Pressable>
      {!!message && <Notice>{message}</Notice>}
      {!!googleAttempt && <>
        <Pressable disabled={loading} style={ui.secondary} onPress={() => { void finishGoogleSignIn(); }}><Text style={ui.buttonText}>Concluir entrada com Google</Text></Pressable>
        <Pressable disabled={loading} style={ui.passwordToggle} onPress={cancelGoogle}><Text style={ui.linkText}>Cancelar entrada com Google</Text></Pressable>
      </>}
      <Pressable accessibilityRole="button" disabled={loading||!!googleAttempt} style={ui.secondary} onPress={()=>setEducatorRegistration(true)}><Text style={ui.buttonText}>Criar conta de professor/coordenador</Text></Pressable>
      {!store && <Pressable style={ui.secondary} onPress={() => { void initialize(); }}><Text style={ui.buttonText}>Reabrir armazenamento local</Text></Pressable>}
    </>}
  </Screen>;
  const pending = operations.length;
  const tabs: Tab<TeacherTab>[] = [
    { key: 'correct', label: 'Corrigir', icon: 'scan' },
    { key: 'essays', label: 'Redações', icon: 'create' },
    { key: 'records', label: 'Digitalizações', icon: 'documents', badge: pending },
    { key: 'account', label: 'Conta', icon: 'person-circle' },
  ];
  const back = parentOf[screen] ? () => setScreen(parentOf[screen]!) : undefined;
  const status = `${account?.displayName} • ${connected ? 'Conectado' : 'Sem conexão'}${syncing ? ' • Sincronizando…' : ''}`;
  // Telas com cabeçalho próprio do App mostram a conta e a conexão nele.
  const ownHeader = screen === 'home' || screen === 'schools' || screen === 'account' || screen === 'records';
  const attentionRecords = records.filter(record => needsAttention(record, operations));
  const shownRecords = recordsFilter === 'attention' ? attentionRecords : records;
  const scanProgress = selectedApplication ? applicationProgress(selectedApplication, records) : null;
  // Próxima digitalização pendente depois da atual, para revisar em fila.
  const nextPending = selectedRecord ? attentionRecords.find(record => record.id !== selectedRecord.id) : undefined;
  const notices = <>
    {!connected && <Notice tone="warning" icon="cloud-offline">Sem internet: as capturas ficam salvas neste aparelho e são enviadas quando a conexão voltar.</Notice>}
    {unsent && <Notice tone="warning">Há fotos aguardando envio. No navegador elas existem só nesta aba: mantenha-a aberta até o envio terminar.</Notice>}
    {!!message && <Notice>{message}</Notice>}{!!error && <Notice tone="danger">{error}</Notice>}
    {authExpired && <Pressable style={ui.secondary} onPress={() => { void signOut(); }}><Text style={ui.buttonText}>Entrar novamente para sincronizar</Text></Pressable>}
  </>;
  return <Screen
    refreshing={refreshing}
    onRefresh={screen === 'home' || screen === 'schools' || screen === 'records' ? () => { void pullToRefresh(); } : undefined}
    tabs={screen === 'scan' ? undefined : <TabBar tabs={tabs} current={tabOf(screen)} onChange={changeTab} />}
  >
    {!ownHeader && <Text style={ui.small}>{status}</Text>}
    {!ownHeader && notices}
    {screen === 'home' ? <>
      <Header title="Corrigir" status={status} />{notices}
      {loading && <Loading label="Atualizando listas" />}
      <TeacherHome
        schoolName={school?.name ?? null} canChangeSchool={schools.length !== 1} onChangeSchool={() => setScreen('schools')}
        applications={applications} records={records} attention={attentionRecords.length}
        onOpenAttention={() => { setRecordsFilter('attention'); setScreen('records'); }}
        lastApplicationId={lastApplicationId} selectedId={selectedApplication?.id ?? null} onSelect={selectApplication}
        onCapture={item => { void startCapture(item); }} onResults={item => { selectApplication(item); setScreen('results'); }}
        connected={connected} busy={loading}
        onOpenPortal={() => void Linking.openURL(`${PORTAL_URL}/portal`).catch(() => setError('Não foi possível abrir o portal.'))}
      />
    </> : screen === 'schools' ? <>
      <Header title="Selecione a escola" onBack={back} status={status} />{notices}
      {!schools.length && <EmptyState icon="school" title="Nenhuma escola neste aparelho" text="Conecte-se para carregar seu cadastro." />}
      {schools.map(item => <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ selected: school?.id === item.id }} style={[ui.card, school?.id === item.id && ui.selected]} onPress={() => { void chooseSchool(item).catch(err => setError(err.message)); }}><Text style={ui.cardTitle}>{item.name}</Text><Text style={ui.small}>{[item.city, item.state].filter(Boolean).join(' • ')}</Text></Pressable>)}
    </> : screen === 'results' && selectedApplication && client ? <ResultsScreen key={selectedApplication.id} client={client} applicationId={selectedApplication.id} connected={connected} newId={Crypto.randomUUID}
        onReviewScan={scanId=>{const local=records.find(record=>record.remoteId===scanId);if(!local)return false;setRecordId(local.id);setScreen('record');return true;}} onBack={()=>setScreen('home')} />
    : screen === 'essays' && client ? <EssayScreen client={client} connected={connected} prepare={prepareImage} backRef={essayBack}
        onOpenPortal={() => void Linking.openURL(`${PORTAL_URL}/portal`).catch(() => setError('Não foi possível abrir o portal.'))} />
    : screen === 'scan' && school && assessment && schoolClass ? <CaptureScreen applicationId={selectedApplication?.id} school={school} assessment={assessment} schoolClass={schoolClass} onConfirm={saveCapture} onBack={() => setScreen('home')} backLabel={sessionSaved ? 'Concluir captura' : 'Voltar'}
        header={<>
          {sessionSaved > 0 && <Notice tone="success" icon="checkmark-circle">{sessionSaved} cartão(ões) salvo(s) nesta sessão. Fotografe o próximo.</Notice>}
          {scanProgress && <View style={ui.card}>
            <Text style={ui.cardTitle}>{scanProgress.completed} de {scanProgress.students} corrigidos</Text>
            <ProgressBar value={scanProgress.completed} max={scanProgress.students} label={`${scanProgress.completed} de ${scanProgress.students} corrigidos`} />
            {!!scanProgress.waiting && <Text style={ui.small}>{scanProgress.waiting} foto(s) no aparelho aguardando envio.</Text>}
            {connected && missing === null && <Pressable accessibilityRole="button" style={ui.passwordToggle} onPress={() => { void loadMissing(); }}><Text style={ui.linkText}>Ver quem falta</Text></Pressable>}
            {missing !== null && <Text style={ui.small}>{missing.length ? `Faltam: ${missing.join(', ')}.` : 'Todos os alunos já têm cartão corrigido.'}</Text>}
          </View>}
        </>} />
    : screen === 'record' && selectedRecord && store ? <RecordScreen key={selectedRecord.id} record={selectedRecord} operations={operations} store={store} connected={connected} onSaved={reload} onRefresh={refreshSelected} onRetry={retrySelected} onNext={() => nextCapture(selectedRecord)} onBack={() => setScreen('records')}
        onNextPending={nextPending ? () => setRecordId(nextPending.id) : undefined} />
    : screen === 'account' ? <>
      <Header title="Conta" subtitle={account?.email} status={status} />{notices}
      <View style={ui.card}>
        <Text style={ui.cardTitle}>Sincronização</Text>
        <Text style={ui.small}>{pending ? `${pending} alteração(ões) ainda não sincronizada(s).` : 'Tudo sincronizado neste aparelho.'}</Text>
        <Pressable disabled={!connected || syncing} style={[ui.secondary, (!connected || syncing) && ui.disabled]} onPress={() => { void sync(true); }}><Text style={ui.buttonText}>{syncing ? 'Sincronizando…' : 'Sincronizar agora'}</Text></Pressable>
        <Pressable disabled={!connected || loading} style={[ui.secondary, (!connected || loading) && ui.disabled]} onPress={() => { if (account && store) { setLoading(true); void loadCatalog(account, store).finally(() => setLoading(false)); } }}><Text style={ui.buttonText}>Atualizar listas</Text></Pressable>
      </View>
      <Pressable style={ui.secondary} onPress={() => { void signOut(); }}><Text style={ui.buttonText}>Sair da conta</Text></Pressable>
      {account && connected && <DeleteAccount request={async (path, input) => createStudentClient(account.apiUrl, await sessionToken(account))(path, input)} onDeleted={async () => { await store?.clearOwner(account.owner); await signOut(); }} />}
    </> : <>
      <Header title="Digitalizações salvas" subtitle={pending ? `${pending} alteração(ões) aguardando sincronização.` : undefined} status={status} />{notices}
      {records.length > 0 && <View style={ui.options}>
        <Chip label={`Todas (${records.length})`} selected={recordsFilter === 'all'} onPress={() => setRecordsFilter('all')} />
        <Chip label={`Precisam de revisão (${attentionRecords.length})`} selected={recordsFilter === 'attention'} onPress={() => setRecordsFilter('attention')} />
      </View>}
      {!records.length && <EmptyState icon="documents" title="Nenhuma folha capturada" text="As folhas capturadas aparecerão aqui, mesmo sem conexão." />}
      {!!records.length && !shownRecords.length && <EmptyState icon="checkmark-done" title="Nada para revisar" text="Todas as digitalizações estão em dia." />}
      {shownRecords.map(record => <Pressable key={record.id} style={ui.card} onPress={() => { setRecordId(record.id); setScreen('record'); }}><Text style={ui.cardTitle}>{record.sheet.assessmentTitle} • {record.sheet.className}</Text><Text style={ui.small}>{localStatus(record, operations)}</Text><Text style={ui.small}>{record.sheet.schoolName}</Text></Pressable>)}
      <Pressable style={ui.primary} onPress={() => changeTab('correct')}><Text style={ui.primaryText}>Nova captura</Text></Pressable>
    </>}
  </Screen>;
}
