import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import * as SecureStore from 'expo-secure-store';
import CaptureScreen from './CaptureScreen';
import type { CapturedSheet } from './CaptureScreen';
import RecordScreen, { localStatus } from './RecordScreen';
import { ACCOUNT_KEY, accountClient, accountFromLogin, getStore } from './offline-runtime';
import type { Account } from './offline-runtime';
import type { LocalRecord, OfflineStore, Operation } from './offline-store';
import { createSynchronizer, refreshRecord } from './offline-sync';
import { prepareImage } from './prepare-image';
import { ScanApiError } from './scan-api';
import { ui } from './ui-styles';

type Screen = 'login' | 'home' | 'assessments' | 'scan' | 'records' | 'record';
type School = { id: string; name: string; city?: string; state?: string };
type Assessment = { id: string; title: string; subject?: string; grade?: string };
type SchoolClass = { id: string; name: string; grade?: string; schoolYear?: number };
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://ufaprova-api.onrender.com';

export default function App() {
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
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [schools, setSchools] = useState<School[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [school, setSchool] = useState<School | null>(null);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [schoolClass, setSchoolClass] = useState<SchoolClass | null>(null);
  const [records, setRecords] = useState<LocalRecord[]>([]);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [recordId, setRecordId] = useState<string | null>(null);
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
    const [cachedSchools, cachedAssessments, cachedClasses, selectedSchool, savedRecords, pending] = await Promise.all([
      storage.cache<School[]>(saved.owner, 'schools'), storage.cache<Assessment[]>(saved.owner, 'assessments'), storage.cache<SchoolClass[]>(saved.owner, 'classes'), storage.cache<string>(saved.owner, 'school'), storage.list(saved.owner), storage.operations(saved.owner),
    ]);
    if (ownerRef.current !== saved.owner) return;
    setSchools(cachedSchools || []); setSchool(cachedSchools?.find(item => item.id === selectedSchool) || cachedSchools?.[0] || null);
    setAssessments(cachedAssessments || []); setClasses(cachedClasses || []); setAssessment(null); setSchoolClass(null);
    setRecords(savedRecords); setOperations(pending); setRecordId(null); setScreen('home');
  }

  const initialize = useCallback(async () => {
    setBooting(true); setError('');
    try {
      const storage = await getStore(); setStore(storage);
      const raw = await SecureStore.getItemAsync(ACCOUNT_KEY);
      if (raw) {
        const saved: Account = JSON.parse(raw);
        if (saved.apiUrl === API_URL.replace(/\/$/, '')) await activate(saved, storage);
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
        const [list, classList] = await Promise.all([api.catalog('/api/assessments'), api.catalog('/api/classes')]);
        if (!Array.isArray(list) || !Array.isArray(classList)) throw new Error('Listas de avaliações ou turmas inválidas.');
        await storage.putCache(current.owner, 'assessments', list); await storage.putCache(current.owner, 'classes', classList);
        if (ownerRef.current === current.owner) { setAssessments(list); setClasses(classList); }
      }
    } catch (err) {
      if (ownerRef.current === current.owner) {
        setMessage(err instanceof ScanApiError && err.status != null && err.status >= 400 && err.status < 500 ? err.message : 'Usando os dados já carregados neste aparelho. Conecte-se para atualizar as listas.');
        if (err instanceof ScanApiError && err.status === 401) setAuthExpired(true);
      }
    }
  }
  async function signIn() {
    if (loading || !store) return;
    setLoading(true); setError(''); setMessage('');
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-client': 'mobile' }, body: JSON.stringify({ email: email.trim(), password }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Não foi possível entrar.');
      if (typeof body.data?.token !== 'string' || !body.data.token) throw new Error('A API não retornou uma sessão válida.');
      const identityResponse = await fetch(`${API_URL}/api/auth/me`, { headers: { authorization: `Bearer ${body.data.token}`, 'x-client': 'mobile' } });
      const identityBody = await identityResponse.json();
      if (!identityResponse.ok) throw new Error(identityBody.error || 'Não foi possível confirmar a instituição da conta.');
      const current = accountFromLogin(API_URL, identityBody.data);
      // Switch the account guard before replacing its token so another account's queued requests cannot use it.
      await SecureStore.deleteItemAsync(ACCOUNT_KEY);
      await SecureStore.setItemAsync('ufaprova.session', body.data.token);
      await SecureStore.setItemAsync(ACCOUNT_KEY, JSON.stringify({ ...current, sessionToken: body.data.token }));
      await activate(current, store); setPassword('');
      await loadCatalog(current, store);
    } catch (err) { setError(err instanceof Error ? err.message : 'Falha de conexão com a API.'); }
    finally { setLoading(false); }
  }
  async function signOut() {
    ownerRef.current = null;
    setAccount(null); setSyncing(false); setScreen('login'); setPassword(''); setError(''); setMessage('');
    setRecords([]); setOperations([]); setSchools([]); setSchool(null); setAssessments([]); setClasses([]); setAssessment(null); setSchoolClass(null);
    try { await SecureStore.deleteItemAsync(ACCOUNT_KEY); await SecureStore.deleteItemAsync('ufaprova.session'); }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível encerrar a sessão local.'); }
  }
  async function continueSchool() {
    if (!school || !account || !store) return;
    await store.putCache(account.owner, 'school', school.id);
    if (ownerRef.current !== account.owner) return;
    setScreen('assessments'); setAssessment(null); setSchoolClass(null);
    if (connected && !loading) { setLoading(true); try { await loadCatalog(account, store); } finally { setLoading(false); } }
  }
  async function saveCapture(sheet: CapturedSheet) {
    if (!store || !account) throw new Error('Abra os dados da conta antes de salvar.');
    if (savingCapture.current) return;
    savingCapture.current = true;
    try {
      const image = await prepareImage(sheet.photo);
      if (ownerRef.current !== account.owner) throw new Error('A conta mudou antes de salvar a captura.');
      const id = await store.create(account.owner, sheet, image);
      await reload(); if (ownerRef.current === account.owner) { setRecordId(id); setScreen('record'); }
    } finally { savingCapture.current = false; }
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
    setSchoolClass({ id: record.sheet.classId, name: record.sheet.className }); setScreen('scan');
  }
  return <SafeAreaView style={ui.safe}><ScrollView contentContainerStyle={ui.container} keyboardShouldPersistTaps="handled">
    <Text style={ui.eyebrow}>UFA PROVA</Text><Text style={ui.title}>Correção de avaliações</Text>
    {booting ? <ActivityIndicator accessibilityLabel="Abrindo dados locais" /> : screen === 'login' ? <>
      <Text style={ui.text}>Entre uma vez com internet. Depois, as escolas, avaliações e turmas já carregadas ficam disponíveis neste aparelho.</Text>
      <TextInput style={ui.input} accessibilityLabel="E-mail" autoCapitalize="none" keyboardType="email-address" placeholder="E-mail" value={email} onChangeText={setEmail} />
      <TextInput style={ui.input} accessibilityLabel="Senha" secureTextEntry placeholder="Senha" value={password} onChangeText={setPassword} />
      {!!error && <Text style={ui.error}>{error}</Text>}
      <Pressable disabled={loading || !store} style={[ui.primary, (loading || !store) && ui.disabled]} onPress={signIn}>{loading ? <ActivityIndicator color="#fff" /> : <Text style={ui.primaryText}>Entrar</Text>}</Pressable>
      {!store && <Pressable style={ui.secondary} onPress={() => { void initialize(); }}><Text style={ui.buttonText}>Reabrir armazenamento local</Text></Pressable>}
    </> : <>
      <Text style={ui.small}>{account?.displayName} • {connected ? 'Conectado' : 'Sem conexão'}</Text>
      <View style={ui.options}>
        <Pressable style={ui.secondary} onPress={() => setScreen('records')}><Text style={ui.buttonText}>Digitalizações ({records.length})</Text></Pressable>
        <Pressable disabled={!connected || syncing} style={[ui.secondary, (!connected || syncing) && ui.disabled]} onPress={() => { void sync(true); }}><Text style={ui.buttonText}>{syncing ? 'Sincronizando…' : 'Sincronizar agora'}</Text></Pressable>
      </View>
      {operations.length > 0 && <Text style={ui.small}>{operations.length} alteração(ões) ainda não sincronizada(s).</Text>}
      {!!message && <Text style={ui.small}>{message}</Text>}{!!error && <Text style={ui.error}>{error}</Text>}
      {authExpired && <Pressable style={ui.secondary} onPress={() => { void signOut(); }}><Text style={ui.buttonText}>Entrar novamente para sincronizar</Text></Pressable>}
      {screen === 'home' ? <>
        <Text style={ui.title}>Selecione a escola</Text>
        {!schools.length && <Text style={ui.text}>Nenhuma escola disponível neste aparelho. Conecte-se para carregar seu cadastro.</Text>}
        {schools.map(item => <Pressable key={item.id} style={[ui.card, school?.id === item.id && ui.selected]} onPress={() => setSchool(item)}><Text style={ui.cardTitle}>{item.name}</Text><Text style={ui.small}>{[item.city, item.state].filter(Boolean).join(' • ')}</Text></Pressable>)}
        <Pressable disabled={!school || loading} style={[ui.primary, (!school || loading) && ui.disabled]} onPress={() => { void continueSchool().catch(err => setError(err.message)); }}><Text style={ui.primaryText}>Continuar para avaliações</Text></Pressable>
        <Pressable disabled={!connected || loading} style={[ui.secondary, (!connected || loading) && ui.disabled]} onPress={() => { if (account && store) { setLoading(true); void loadCatalog(account, store).finally(() => setLoading(false)); } }}><Text style={ui.buttonText}>Atualizar listas</Text></Pressable>
      </> : screen === 'assessments' ? <>
        <Text style={ui.text}>{school?.name}</Text><Text style={ui.small}>Avaliações e turmas da instituição da sua conta.</Text>
        {loading && <ActivityIndicator />}
        <Text style={ui.title}>Selecione a avaliação</Text>
        {!assessments.length && <Text style={ui.text}>Nenhuma avaliação disponível. Atualize as listas com internet.</Text>}
        {assessments.map(item => <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ selected: assessment?.id === item.id }} style={[ui.card, assessment?.id === item.id && ui.selected]} onPress={() => setAssessment(item)}><Text style={ui.cardTitle}>{item.title}</Text><Text style={ui.small}>{[item.subject, item.grade].filter(Boolean).join(' • ')}</Text></Pressable>)}
        <Text style={ui.title}>Selecione a turma</Text>
        {!classes.length && <Text style={ui.text}>Nenhuma turma disponível. Atualize as listas com internet.</Text>}
        {classes.map(item => <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ selected: schoolClass?.id === item.id }} style={[ui.card, schoolClass?.id === item.id && ui.selected]} onPress={() => setSchoolClass(item)}><Text style={ui.cardTitle}>{item.name}</Text><Text style={ui.small}>{[item.grade, item.schoolYear].filter(Boolean).join(' • ')}</Text></Pressable>)}
        <Pressable disabled={!assessment || !schoolClass} style={[ui.primary, (!assessment || !schoolClass) && ui.disabled]} onPress={() => setScreen('scan')}><Text style={ui.primaryText}>Continuar para captura</Text></Pressable>
        <Pressable style={ui.secondary} onPress={() => setScreen('home')}><Text style={ui.buttonText}>Trocar escola</Text></Pressable>
      </> : screen === 'scan' && school && assessment && schoolClass ? <CaptureScreen school={school} assessment={assessment} schoolClass={schoolClass} onConfirm={saveCapture} onBack={() => setScreen('assessments')} /> : screen === 'record' && selectedRecord && store ? <RecordScreen key={selectedRecord.id} record={selectedRecord} operations={operations} store={store} connected={connected} onSaved={reload} onRefresh={refreshSelected} onRetry={retrySelected} onNext={() => nextCapture(selectedRecord)} onBack={() => setScreen('records')} /> : <>
        <Text style={ui.title}>Digitalizações salvas</Text>
        {!records.length && <Text style={ui.text}>As folhas capturadas aparecerão aqui, mesmo sem conexão.</Text>}
        {records.map(record => <Pressable key={record.id} style={ui.card} onPress={() => { setRecordId(record.id); setScreen('record'); }}><Text style={ui.cardTitle}>{record.sheet.assessmentTitle} • {record.sheet.className}</Text><Text style={ui.small}>{localStatus(record, operations)}</Text><Text style={ui.small}>{record.sheet.schoolName}</Text></Pressable>)}
        <Pressable style={ui.primary} onPress={() => setScreen('home')}><Text style={ui.primaryText}>Nova captura</Text></Pressable>
      </>}
      <Pressable style={ui.secondary} onPress={() => { void signOut(); }}><Text style={ui.buttonText}>Sair da conta</Text></Pressable>
    </>}
  </ScrollView></SafeAreaView>;
}
