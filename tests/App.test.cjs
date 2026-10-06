const test=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');const {randomUUID}=require('node:crypto');const React=require('react');const renderer=require('react-test-renderer');const load=require('./load-typescript.cjs');const open=require('./sqlite-adapter.cjs');
const {createOfflineStore}=load(path.join(__dirname,'../offline-store.ts'));global.IS_REACT_ACT_ENVIRONMENT=true;
const account={owner:'teacher-owner',apiUrl:'https://ufaprova-api.onrender.com',userId:'u',institutionId:'i',email:'teacher@example.test',displayName:'Professor'};
const school={id:'s',name:'Escola'},assessment={id:'a',title:'Prova'},schoolClass={id:'c',name:'Turma'};
function text(node){return typeof node==='string'?node:node.children.map(text).join('');}function button(component,label){return component.root.findAllByType('Pressable').find(node=>text(node).includes(label));}
async function setup(t){
  const db=open(),store=createOfflineStore(db,randomUUID);await store.initialize();t.after(()=>db.close());
  await store.putCache(account.owner,'schools',[school]);await store.putCache(account.owner,'assessments',[assessment]);await store.putCache(account.owner,'classes',[schoolClass]);
  let network;let token=JSON.stringify({...account,sessionToken:'token'});let uploads=0;
  const client={capabilities:async()=>{},upload:async(data,id)=>{uploads++;return {id,status:'completed'}},read:async id=>({id,status:'completed',submissionId:null,revision:null,score:null,maxScore:null,requiresManualReview:false,imageAvailable:true,candidates:[],detectedAnswers:[]}),catalog:async path=>path==='/api/educator-profile'?{schools:[school]}:path==='/api/classes'?[schoolClass]:[assessment]};
  const Capture=props=>React.createElement('Pressable',{onPress:()=>props.onConfirm({photo:{uri:'file:///photo.jpg',width:1000,height:2000},schoolId:props.school.id,assessmentId:props.assessment.id,classId:props.schoolClass.id,schoolName:props.school.name,assessmentTitle:props.assessment.title,className:props.schoolClass.name})},React.createElement('Text',null,'Confirmar foto de teste'));
  const Record=props=>React.createElement('Text',null,`Registro ${props.record.sheet.assessmentTitle}: ${props.record.remoteId?'enviado':'salvo localmente'}`);
  const {default:App}=load(path.join(__dirname,'../App.tsx'),{
    'react-native':{ActivityIndicator:'ActivityIndicator',AppState:{currentState:'active',addEventListener:()=>({remove(){}})},Pressable:'Pressable',SafeAreaView:'SafeAreaView',ScrollView:'ScrollView',Text:'Text',TextInput:'TextInput',View:'View',StyleSheet:{create:x=>x}},
    '@react-native-community/netinfo':{addEventListener:listener=>{network=listener;listener({isConnected:false,isInternetReachable:false});return()=>{}}},
    'expo-secure-store':{getItemAsync:async()=>token,deleteItemAsync:async()=>{token=null},setItemAsync:async(_,v)=>{token=v}},
    './offline-runtime':{ACCOUNT_KEY:'ufaprova.account',getStore:async()=>store,accountClient:()=>client,accountFromLogin:()=>account},
    './prepare-image':{prepareImage:async()=> 'data:image/jpeg;base64,YQ=='},
    './CaptureScreen':{default:Capture,__esModule:true},'./RecordScreen':{default:Record,__esModule:true,localStatus:record=>record.remoteId?'Sincronizada':'Pendente'},
  });
  let component;await renderer.act(async()=>{component=renderer.create(React.createElement(App));});
  t.after(async()=>renderer.act(async()=>component.unmount()));
  async function press(label){const b=button(component,label);assert(b,`Missing button ${label}`);assert(!b.props.disabled,`Disabled ${label}`);await renderer.act(async()=>b.props.onPress());}
  return {component,store,press,connect:async()=>renderer.act(async()=>network({isConnected:true,isInternetReachable:true})),get uploads(){return uploads}};
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
