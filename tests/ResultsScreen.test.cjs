const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),React=require('react'),renderer=require('react-test-renderer'),load=require('./load-typescript.cjs');global.IS_REACT_ACT_ENVIRONMENT=true;
const text=node=>typeof node==='string'?node:(node.children||[]).map(text).join('');
const {createScanClient}=load(path.join(__dirname,'../scan-api.ts'));
const {authorizable,parseQuestionList,parseApplicationResults,countLine}=load(path.join(__dirname,'../results-contract.ts'));
const APP='30000000-0000-4000-8000-000000000001';
const id=n=>`40000000-0000-4000-8000-00000000000${n}`;
const counts=(correct,reviewPending=0)=>({questions:3,valid:3,correct,incorrect:3-correct-reviewPending,blank:0,invalid:0,annulled:0,reviewPending,manualPending:0});
const student=(n,name,extra={})=>({applicationStudentId:id(n),studentName:name,registration:null,number:n,resultId:null,processingStatus:'not_scanned',publicationStatus:'unpublished',currentVersionId:null,currentVersion:null,counts:null,percent:null,score:null,maxScore:null,cardScanId:null,scansInReview:0,publishable:false,published:null,belowExpected:false,followupStatus:null,...extra});
function results(){return {application:{id:APP,title:'Prova 1',subject:'Química',className:'1A',questionCounts:[3],settings:{minExpectedPercent:null,releasePolicy:'summary',annulledQuestions:[],annulledPolicy:null},minExpectedPercent:60},students:[
  student(1,'Ana',{resultId:id(5),processingStatus:'ready',currentVersionId:id(6),currentVersion:1,counts:counts(2),percent:66.67,score:2,maxScore:3,publishable:true}),
  student(2,'Bia',{resultId:id(7),processingStatus:'needs_review',currentVersionId:id(8),currentVersion:1,counts:counts(1,1),scansInReview:0}),
  student(3,'Caio'),
]};}
const RN={ActivityIndicator:'ActivityIndicator',Image:'Image',Pressable:'Pressable',Text:'Text',TextInput:'TextInput',View:'View',StyleSheet:{create:x=>x}};
async function setup(t,client,options={}){
  const {default:Screen}=load(path.join(__dirname,'../ResultsScreen.tsx'),{'react-native':RN});
  let back=0,component;
  await renderer.act(async()=>{component=renderer.create(React.createElement(Screen,{client,applicationId:APP,connected:options.connected??true,newId:()=>id(9),onReviewScan:options.onReviewScan,onBack:()=>back++}));});
  t.after(async()=>renderer.act(async()=>component.unmount()));
  const find=label=>component.root.findAll(node=>node.type==='Pressable'&&text(node).includes(label))[0];
  const press=async label=>{const b=find(label);assert(b,`Missing button ${label}`);assert(!b.props.disabled,`Disabled ${label}`);await renderer.act(async()=>b.props.onPress());};
  return {get text(){return text(component.root)},find,press,get back(){return back},component};
}

test('only results without pending reading can be selected and published after explicit confirmation',async t=>{
  let data=results();const calls=[];
  const client={applicationResults:async()=>data,authorize:async(app,items,mutation)=>{calls.push({app,items,mutation});data=results();data.students[0]={...data.students[0],publicationStatus:'published',published:{versionId:id(6),version:1,authorizedAt:'2026-11-03T10:00:00Z',authorizerName:'Profa.',legacy:false}};return {batchId:id(4),published:1,items:items.map(item=>({...item,outcome:'published'}))};},resultDetail:async()=>{throw Error('unused')},saveResultSettings:async()=>{throw Error('unused')},scanImage:async()=>({uri:'x',headers:{}})};
  const h=await setup(t,client);
  assert.match(h.text,/1 pronto\(s\) para autorizar · 1 com pendência · 0 publicado/);
  assert.match(h.text,/Pendências: 1 leitura\(s\) duvidosa\(s\)/);
  assert.match(h.text,/Sem cartão corrigido/);
  assert.equal(h.find('Autorizar lançamento').props.disabled,true,'nada selecionado');
  await h.press('Selecionar todos os prontos (1)');
  await h.press('Autorizar lançamento (1)');
  assert.match(h.text,/ficarão visíveis para o aluno/);
  assert.equal(calls.length,0,'a seleção sozinha não publica');
  await h.press('Confirmar e publicar');
  assert.deepEqual(calls,[{app:APP,items:[{resultId:id(5),versionId:id(6)}],mutation:id(9)}]);
  assert.match(h.text,/1 publicado\(s\)/);
  assert.match(h.text,/Publicado ao aluno/);
  assert.match(h.text,/0 pronto\(s\) para autorizar/);
});

test('a failed authorization keeps the same request id so a retry cannot publish twice',async t=>{
  const ids=[];let fail=true;let n=0;
  const client={applicationResults:async()=>results(),authorize:async(app,items,mutation)=>{ids.push(mutation);if(fail){fail=false;throw Error('Falha de conexão');}return {batchId:id(4),published:1,items:items.map(item=>({...item,outcome:'published'}))};},resultDetail:async()=>null,saveResultSettings:async()=>null,scanImage:async()=>null};
  const {default:Screen}=load(path.join(__dirname,'../ResultsScreen.tsx'),{'react-native':RN});
  let component;await renderer.act(async()=>{component=renderer.create(React.createElement(Screen,{client,applicationId:APP,connected:true,newId:()=>`50000000-0000-4000-8000-00000000000${++n}`,onBack:()=>{}}));});
  t.after(async()=>renderer.act(async()=>component.unmount()));
  const press=async label=>{const b=component.root.findAll(node=>node.type==='Pressable'&&text(node).includes(label))[0];await renderer.act(async()=>b.props.onPress());};
  await press('Selecionar todos');await press('Autorizar lançamento');await press('Confirmar e publicar');
  assert.match(text(component.root),/Falha de conexão/);
  await press('Confirmar e publicar');
  assert.equal(ids.length,2);assert.equal(ids[0],ids[1]);
});

test('detail shows the reading, answer key, pending questions, photo and history',async t=>{
  let reviewed;
  const detail={id:id(7),studentName:'Bia',processingStatus:'needs_review',publicationStatus:'unpublished',currentVersionId:id(8),publishedVersionId:null,
    versions:[{id:id(8),version:1,source:'omr',cardScanId:id(3),items:[{questionNumber:1,status:'correct',selectedLabels:['A'],correctLabels:['A'],awardedPoints:1,maxPoints:1},{questionNumber:2,status:'review_pending',selectedLabels:['B'],correctLabels:['B'],answerStatus:'uncertain',awardedPoints:null,maxPoints:1}],counts:counts(1,1),percent:null,score:null,maxScore:3,createdAt:'2026-11-03T10:00:00Z',createdByName:null}],
    changes:[],publications:[],scans:[{id:id(3),status:'review',createdAt:'2026-11-03T10:00:00Z',imageAvailable:true,duplicateOfScanId:null}]};
  const client={applicationResults:async()=>results(),resultDetail:async()=>detail,authorize:async()=>null,saveResultSettings:async()=>null,scanImage:async scan=>({uri:`https://api.test/api/card-scans/${scan}/image`,headers:{authorization:'Bearer t'}})};
  const h=await setup(t,client,{onReviewScan:scan=>{reviewed=scan;return true;}});
  const detailButtons=h.component.root.findAll(node=>node.type==='Pressable'&&text(node)==='Detalhes');
  await renderer.act(async()=>detailButtons[1].props.onPress());
  assert.match(h.text,/Questão 2 · Leitura duvidosa · revisar/);
  assert.match(h.text,/Lido: B \(sem confiança suficiente\)/);
  assert.match(h.text,/Gabarito: B/);
  assert.match(h.text,/Ainda não publicado ao aluno/);
  await h.press('Ver foto do cartão');
  const image=h.component.root.findAll(node=>node.type==='Image')[0];
  assert.equal(image.props.source.headers.authorization,'Bearer t');
  await h.press('Revisar leitura deste cartão');
  assert.equal(reviewed,id(3));
});

test('changing annulled questions requires a scoring policy and a second confirmation',async t=>{
  const saved=[];
  const client={applicationResults:async()=>results(),resultDetail:async()=>null,authorize:async()=>null,scanImage:async()=>null,saveResultSettings:async(app,settings)=>{saved.push(settings);return {...settings,recalculated:2};}};
  const h=await setup(t,client);
  await h.press('Regras da avaliação');
  const input=label=>h.component.root.findAll(node=>node.type==='TextInput'&&node.props.accessibilityLabel===label)[0];
  await renderer.act(async()=>input('Questões anuladas').props.onChangeText('3'));
  await renderer.act(async()=>input('Mínimo esperado em porcentagem').props.onChangeText('70'));
  await h.press('Salvar regras');
  assert.match(h.text,/Escolha como as questões anuladas serão pontuadas/);
  await h.press('Retirar da contagem');
  await h.press('Salvar regras');
  assert.equal(saved.length,0,'pede confirmação antes de recalcular');
  assert.match(h.text,/recalcula todos os resultados/);
  await h.press('Confirmar e recalcular');
  assert.deepEqual(saved,[{minExpectedPercent:70,releasePolicy:'summary',annulledQuestions:[3],annulledPolicy:'exclude'}]);
  assert.match(h.text,/2 resultado\(s\) recalculado\(s\)/);
});

test('without connection nothing is loaded or authorized',async t=>{
  let loads=0;
  const h=await setup(t,{applicationResults:async()=>{loads++;return results();}},{connected:false});
  assert.equal(loads,0);
  assert.match(h.text,/Conecte-se para consultar e autorizar resultados/);
});

test('contract helpers and client routes',async()=>{
  const parsed=parseApplicationResults(results());
  assert.deepEqual(parsed.students.map(authorizable),[true,false,false]);
  const published={...parsed.students[0],published:{versionId:id(6),version:1,authorizedAt:'',authorizerName:'',legacy:false}};
  assert.equal(authorizable(published),false,'versão já publicada não entra no lote');
  assert.deepEqual(parseQuestionList('3, 1;3 7'),[1,3,7]);
  assert.throws(()=>parseQuestionList('a, 2'));
  assert.equal(countLine(counts(2),66.67),'2 acerto(s) de 3 · 1 erro(s) · 0 em branco · 66,67%');
  assert.throws(()=>parseApplicationResults({students:[]}),/Atualize o servidor/);
  const requests=[];
  const fetcher=async(url,options)=>{requests.push({url,method:options.method||'GET',body:options.body&&JSON.parse(options.body),headers:options.headers});
    const data=url.endsWith('/results')?results():url.endsWith('/authorize')?{batchId:id(4),published:0,items:[]}:{minExpectedPercent:null,releasePolicy:'answers',annulledQuestions:[],annulledPolicy:null};
    return {ok:true,status:200,json:async()=>({data})};};
  const client=createScanClient('https://api.test/',async()=>'token',fetcher);
  await client.applicationResults(APP);
  await client.authorize(APP,[{resultId:id(5),versionId:id(6)}],id(9));
  await client.saveResultSettings(APP,{minExpectedPercent:null,releasePolicy:'answers',annulledQuestions:[],annulledPolicy:null});
  assert.deepEqual(requests.map(r=>[r.method,r.url]),[
    ['GET',`https://api.test/api/assessment-applications/${APP}/results`],
    ['POST','https://api.test/api/assessment-results/authorize'],
    ['PUT',`https://api.test/api/assessment-applications/${APP}/result-settings`],
  ]);
  assert.deepEqual(requests[1].body,{applicationId:APP,clientMutationId:id(9),items:[{resultId:id(5),versionId:id(6)}]});
  assert.equal(requests[0].headers.authorization,'Bearer token');
  assert.deepEqual(await client.scanImage(id(3)),{uri:`https://api.test/api/card-scans/${id(3)}/image`,headers:{authorization:'Bearer token','x-client':'mobile'}});
  await assert.rejects(client.authorize(APP,[{resultId:'x',versionId:id(6)}],id(9)));
});
