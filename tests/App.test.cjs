const test=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');const {randomUUID}=require('node:crypto');const React=require('react');const renderer=require('react-test-renderer');const load=require('./load-typescript.cjs');const open=require('./sqlite-adapter.cjs');
const {createOfflineStore}=load(path.join(__dirname,'../offline-store.ts'));global.IS_REACT_ACT_ENVIRONMENT=true;
const account={owner:'teacher-owner',apiUrl:'https://ufaprova-api.onrender.com',userId:'u',institutionId:'i',email:'teacher@example.test',displayName:'Professor'};
const school={id:'s',name:'Escola'},assessment={id:'a',title:'Prova'},schoolClass={id:'c',name:'Turma'};
function text(node){return typeof node==='string'?node:node.children.map(text).join('');}function button(component,label){return component.root.findAllByType('Pressable').find(node=>text(node).includes(label));}
async function setup(t, options = {}){
  const db=open(),store=createOfflineStore(db,randomUUID);await store.initialize();t.after(()=>db.close());
  await store.putCache(account.owner,'schools',[school]);await store.putCache(account.owner,'assessments',[assessment]);await store.putCache(account.owner,'classes',[schoolClass]);
  let network;let token=options.login ? null : JSON.stringify({...account,sessionToken:'token'});let uploads=0;
  let openedUrl;let googleReady=false;
  const client={capabilities:async()=>{},upload:async(data,id)=>{uploads++;return {id,status:'completed'}},read:async id=>({id,status:'completed',submissionId:null,revision:null,score:null,maxScore:null,requiresManualReview:false,imageAvailable:true,candidates:[],detectedAnswers:[]}),catalog:async path=>path==='/api/educator-profile'?{schools:[school]}:path==='/api/classes'?[schoolClass]:[assessment]};
  const Capture=props=>React.createElement('Pressable',{onPress:()=>props.onConfirm({photo:{uri:'file:///photo.jpg',width:1000,height:2000},schoolId:props.school.id,assessmentId:props.assessment.id,classId:props.schoolClass.id,schoolName:props.school.name,assessmentTitle:props.assessment.title,className:props.schoolClass.name})},React.createElement('Text',null,'Confirmar foto de teste'));
  const Record=props=>React.createElement('Text',null,`Registro ${props.record.sheet.assessmentTitle}: ${props.record.remoteId?'enviado':'salvo localmente'}`);
  const {default:App}=load(path.join(__dirname,'../App.tsx'),{
    './StudentScreen':()=>React.createElement('Text',null,'Painel do aluno'),
    'react-native':{ActivityIndicator:'ActivityIndicator',AppState:{currentState:'active',addEventListener:()=>({remove(){}})},Linking:{openURL:async url=>{openedUrl=url}},Pressable:'Pressable',SafeAreaView:'SafeAreaView',ScrollView:'ScrollView',Text:'Text',TextInput:'TextInput',View:'View',StyleSheet:{create:x=>x}},
    '@react-native-community/netinfo':{addEventListener:listener=>{network=listener;listener({isConnected:false,isInternetReachable:false});return()=>{}}},
    'expo-secure-store':{getItemAsync:async()=>token,deleteItemAsync:async()=>{token=null},setItemAsync:async(_,v)=>{token=v}},
    './offline-runtime':{ACCOUNT_KEY:'ufaprova.account',getStore:async()=>store,accountClient:()=>client,accountFromLogin:()=>account},
    './prepare-image':{prepareImage:async()=> 'data:image/jpeg;base64,YQ=='},
    './google-login':{startGoogleLogin:async()=>({id:'attempt',token:'google-session',browserUrl:'https://ufaprova-api.onrender.com/api/auth/google/mobile/browser?ticket=test',expiresAt:Date.now()+600000}),checkGoogleLogin:async()=>googleReady},
    './CaptureScreen':{default:Capture,__esModule:true},'./RecordScreen':{default:Record,__esModule:true,localStatus:record=>record.remoteId?'Sincronizada':'Pendente'},
  });
  let component;await renderer.act(async()=>{component=renderer.create(React.createElement(App));});
  t.after(async()=>renderer.act(async()=>component.unmount()));
  async function press(label){const b=button(component,label);assert(b,`Missing button ${label}`);assert(!b.props.disabled,`Disabled ${label}`);await renderer.act(async()=>b.props.onPress());}
  return {component,store,press,connect:async()=>renderer.act(async()=>network({isConnected:true,isInternetReachable:true})),get uploads(){return uploads},get openedUrl(){return openedUrl},googleReady:()=>{googleReady=true},get credentials(){return token}};
}
test('startup restores cached account and lists, and an offline capture survives navigation',async t=>{
  const h=await setup(t);assert(text(h.component.root).includes('Sem conexão'));assert(text(h.component.root).includes('Escola'));
  await h.press('Continuar para avaliações');await h.press('Prova');await h.press('Turma');await h.press('Continuar para captura');await h.press('Confirmar foto de teste');
  const records=await h.store.list(account.owner);assert.equal(records.length,1);assert.equal(records[0].sheet.assessmentId,'a');assert.equal(h.uploads,0);assert(text(h.component.root).includes('salvo localmente'));
  await h.press('Digitalizações');assert(text(h.component.root).includes('Pendente'));
});
test('connectivity restoration consumes the saved queue while preserving account context',async t=>{
  const h=await setup(t);await h.press('Continuar para avaliações');await h.press('Prova');await h.press('Turma');await h.press('Continuar para captura');await h.press('Confirmar foto de teste');
  await h.connect();assert.equal(h.uploads,1);const record=(await h.store.list(account.owner))[0];assert.equal(record.remoteId,record.id);assert.equal((await h.store.operations(account.owner)).length,0);
});
test('password starts hidden and can be revealed without changing its value',async t=>{
  const h=await setup(t,{login:true});
  const password=()=>h.component.root.findAllByType('TextInput').find(node=>node.props.accessibilityLabel==='Senha');
  assert.equal(password().props.secureTextEntry,true);
  await renderer.act(async()=>password().props.onChangeText('senha digitada'));
  await h.press('Mostrar senha');assert.equal(password().props.secureTextEntry,false);assert.equal(password().props.value,'senha digitada');
  await h.press('Ocultar senha');assert.equal(password().props.secureTextEntry,true);
});
test('Google opens the server browser flow and cancellation keeps the account signed out',async t=>{
  const h=await setup(t,{login:true});await h.press('Entrar com Google');
  assert.match(h.openedUrl,/\/api\/auth\/google\/mobile\/browser/);assert.equal(h.credentials,null);
  assert(text(h.component.root).includes('Concluir entrada com Google'));
  await h.press('Cancelar entrada com Google');assert.equal(h.credentials,null);assert(!text(h.component.root).includes('Concluir entrada com Google'));
});
test('completed Google login verifies the API identity before persisting and opening schools',async t=>{
  const original=global.fetch;t.after(()=>{global.fetch=original});
  let identityCalls=0;
  global.fetch=async(url,options)=>{assert.equal(options.headers.authorization,'Bearer google-session');identityCalls++;return {ok:true,json:async()=>({data:{user:{id:'u'},institution:{id:'i'}}})}};
  const h=await setup(t,{login:true});await h.press('Entrar com Google');h.googleReady();await h.press('Concluir entrada com Google');
  assert.equal(identityCalls,1);assert.equal(JSON.parse(h.credentials).sessionToken,'google-session');assert(text(h.component.root).includes('Selecione a escola'));
});
test('failed identity verification never persists a Google session',async t=>{
  const original=global.fetch;t.after(()=>{global.fetch=original});
  global.fetch=async()=>({ok:false,json:async()=>({error:'Conta sem acesso'})});
  const h=await setup(t,{login:true});await h.press('Entrar com Google');h.googleReady();await h.press('Concluir entrada com Google');
  assert.equal(h.credentials,null);assert(text(h.component.root).includes('Conta sem acesso'));
});

test('a student identity opens the student panel instead of teacher correction tools',async t=>{const previous=global.fetch;t.after(()=>global.fetch=previous);global.fetch=async()=>({ok:true,json:async()=>({data:{role:'student',user:{id:'student-id',displayName:'Aluno'}}})});const h=await setup(t,{login:true});await h.press('Entrar com Google');h.googleReady();await h.press('Concluir entrada com Google');assert(text(h.component.root).includes('Painel do aluno'));assert(!text(h.component.root).includes('Selecione a escola'));});

test('native coordinator signup returns to login with the email filled and never saves a session',async t=>{
 const previous=global.fetch;t.after(()=>global.fetch=previous);let calls=0;
 global.fetch=async(url,options)=>{assert(url.endsWith('/api/auth/register'));assert.equal(options.headers['x-client'],'mobile');const payload=JSON.parse(options.body);assert.equal(payload.educatorProfile.professionalRole,'coordinator');assert.deepEqual(payload.educatorProfile.stages,['Ensino Médio']);assert.equal(payload.role,undefined);calls++;return Response.json({data:{verificationRequired:true}});};
 const h=await setup(t,{login:true});await h.press('Criar conta de professor/coordenador');await h.press('Coordenador');await h.press('Ensino Médio');
 for(const [label,value] of [['Nome completo','Coordenador Teste'],['E-mail do professor ou coordenador','coord@example.test'],['CPF','12345678909'],['Senha para nova conta','TestPassword123!'],['Confirmar senha','TestPassword123!'],['Nome da escola','Escola Teste'],['Endereço da escola','Rua Teste, 1'],['Cidade da escola','Campo Grande'],['Estado da escola (UF)','MS']])await renderer.act(async()=>h.component.root.findAllByType('TextInput').find(n=>n.props.accessibilityLabel===label).props.onChangeText(value));
 await h.press('Criar minha conta');assert.equal(calls,1);assert.equal(h.credentials,null);assert(text(h.component.root).includes('Confirme o link enviado ao seu e-mail'));assert.equal(h.component.root.findAllByType('TextInput').find(n=>n.props.accessibilityLabel==='E-mail').props.value,'coord@example.test');
});
