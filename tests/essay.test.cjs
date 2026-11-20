const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),React=require('react'),renderer=require('react-test-renderer'),load=require('./load-typescript.cjs');global.IS_REACT_ACT_ENVIRONMENT=true;
const text=node=>typeof node==='string'?node:(node.children||[]).map(text).join('');
const contract=load(path.join(__dirname,'../essay-contract.ts'));
const {createScanClient}=load(path.join(__dirname,'../scan-api.ts'));
const id=n=>`60000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const APP=id(1),ENTRY=id(2),ENTRY2=id(3),SUB=id(4),FILE=id(5),AI=id(6),TG=id(7);
const levels=max=>[0,40,80,120,160,200].filter(v=>v<=max).map(score=>({score,descriptor:`Nível ${score}`}));
const rubric={name:'ENEM',maxScore:400,criteria:[{id:'c1',numeral:'I',title:'Norma',maxScore:200,levels:levels(200),observations:[]},{id:'c2',numeral:'II',title:'Tema',maxScore:200,levels:levels(200)}],annulmentReasons:[{id:'fuga',label:'Fuga ao tema'}]};
function entry(extra={}){return {id:ENTRY,applicationId:APP,status:'awaiting_grading',student:{id:id(9),name:'Ana'},className:'1º — A',yearLocked:false,aiAvailable:true,
  prompt:{title:'Mobilidade urbana',theme:'Transporte'},rubric,submission:{id:SUB,mode:'teacher_scan',status:'submitted',files:[{id:FILE,position:1,mimeType:'image/jpeg'}]},
  transcriptions:[{text:'Texto lido',source:'ocr',needsReview:false,version:1}],aiGrading:null,teacherGrading:null,jobs:[],...extra};}
const queuePage=(items,pages=1)=>({items,page:1,pageSize:30,total:items.length,pages});
const item=(n,status,name)=>({id:n,status,studentName:name,studentNumber:1,teacherTotal:null,aiTotal:null,maxScore:400});

test('the grading request keeps what the portal saved in each competency and the current revision',()=>{
  const e=contract.parseEssayEntry(entry({teacherGrading:{id:TG,kind:'teacher',status:'draft',revision:3,comments:'antigo',strengths:'Coesão',improvements:'',rewriteSuggestions:'',
    scores:[{criterionId:'c1',score:120,observations:{'desvios':true},note:'nota interna',evidence:['trecho'],feedback:'Revise vírgulas'}]}}));
  const input=contract.gradingInput(e,{c2:160},{comments:'Bom texto',annulmentReason:''});
  assert.deepEqual(input.scores,[
    {criterionId:'c1',score:120,observations:{'desvios':true},note:'nota interna',evidence:['trecho'],feedback:'Revise vírgulas'},
    {criterionId:'c2',score:160,observations:{},note:'',evidence:[],feedback:''},
  ]);
  assert.equal(input.revision,3);assert.equal(input.strengths,'Coesão');assert.equal(input.comments,'Bom texto');
  assert.deepEqual(contract.totalOf(e.rubric,{c1:120,c2:160},false),{total:280,partial:280});
  assert.deepEqual(contract.totalOf(e.rubric,{c1:120},false),{total:null,partial:120});
  assert.equal(contract.totalOf(e.rubric,{c1:120},true).total,0,'anulada vale zero');
});

test('AI suggestions only fill levels that exist in the rubric',()=>{
  const e=contract.parseEssayEntry(entry({aiGrading:{id:AI,kind:'ai',status:'final',total:250,maxScore:400,scores:[{criterionId:'c1',score:160},{criterionId:'c2',score:90}]}}));
  assert.deepEqual(contract.aiPicks(e),{c1:160});
});

test('unknown states and malformed ids are rejected',()=>{
  assert.throws(()=>contract.parseEssayEntry(entry({status:'whatever'})),/estado de redação desconhecido/);
  assert.throws(()=>contract.parseEssayEntry(entry({id:'../x'})),/Identificador/);
  const apps=contract.parseEssayApplications([{id:APP,promptTitle:'Tema',classGrade:'1º',className:'A',status:'active',studentsCount:30},{id:id(8),promptTitle:'X',status:'cancelled'}]);
  assert.equal(apps.length,1);assert.equal(apps[0].className,'1º — A');
});

test('the client pages through the queue and uses the right verbs for each action',async()=>{
  const calls=[];
  const fetcher=async(url,options={})=>{calls.push([options.method||'GET',url.replace('https://api.test',''),options.body?JSON.parse(options.body):undefined]);
    const u=new URL(url);
    if(u.pathname==='/api/essay-entries'){const page=Number(u.searchParams.get('page'));return {ok:true,status:200,json:async()=>({data:queuePage([item(page===1?ENTRY:ENTRY2,'awaiting_grading',`A${page}`)],2)})};}
    if(u.pathname.endsWith('/absent'))return {ok:true,status:200,json:async()=>({data:{ok:true}})};
    return {ok:true,status:200,json:async()=>({data:entry()})};};
  const client=createScanClient('https://api.test',async()=>'tok',fetcher);
  const queue=await client.essayQueue(APP);
  assert.deepEqual(queue.map(q=>q.id),[ENTRY,ENTRY2]);
  await client.essayAction(ENTRY,'grading',{scores:[]});
  await client.essayAction(ENTRY,'absent',{absent:true});
  await client.addEssayPage(ENTRY,'data:image/jpeg;base64,AAAA');
  await client.removeEssayPage(ENTRY,FILE);
  assert.deepEqual(calls.slice(2).map(c=>c.slice(0,2)),[
    ['PUT',`/api/essay-entries/${ENTRY}/grading`],
    ['POST',`/api/essay-entries/${ENTRY}/absent`],
    ['GET',`/api/essay-entries/${ENTRY}`],
    ['POST',`/api/essay-entries/${ENTRY}/files`],
    ['DELETE',`/api/essay-entries/${ENTRY}/files/${FILE}`],
  ]);
  assert.deepEqual(calls[5][2],{dataUrl:'data:image/jpeg;base64,AAAA'});
  const image=await client.essayPageImage(FILE);
  assert.equal(image.uri,`https://api.test/api/essay-files/${FILE}`);assert.equal(image.headers.authorization,'Bearer tok');
});

const RN={ActivityIndicator:'ActivityIndicator',Image:'Image',Pressable:'Pressable',Text:'Text',TextInput:'TextInput',View:'View'};
let captured;
const Capture=props=>{captured=props;return React.createElement('Text',null,'camera');};
async function setup(t,client,options={}){
  const {default:Screen}=load(path.join(__dirname,'../EssayScreen.tsx'),{'react-native':RN,'./CaptureScreen':{__esModule:true,default:Capture},'expo-camera':{}});
  const backRef={current:null};let component;
  await renderer.act(async()=>{component=renderer.create(React.createElement(Screen,{client,connected:options.connected??true,prepare:async()=> 'data:image/jpeg;base64,BBBB',backRef,onOpenPortal:()=>{}}));});
  t.after(async()=>renderer.act(async()=>component.unmount()));
  const find=label=>component.root.findAll(node=>node.type==='Pressable'&&text(node).includes(label))[0];
  const press=async label=>{const b=find(label);assert(b,`Missing button ${label}`);assert(!b.props.disabled,`Disabled ${label}`);await renderer.act(async()=>b.props.onPress());};
  return {get text(){return text(component.root)},find,press,backRef,component};
}
const apps=[{id:APP,promptTitle:'Mobilidade urbana',className:'A',status:'active',studentsCount:2,submittedCount:1,publishedCount:0,awaitingApprovalCount:0,rubricName:'ENEM'}];

test('the teacher grades by level, finalizes only when complete and publishes after confirming',async t=>{
  let current=entry();const actions=[];
  const client={
    essayApplications:async()=>contract.parseEssayApplications(apps),
    essayQueue:async()=>contract.parseEssayQueue(queuePage([item(ENTRY,current.status,'Ana'),item(ENTRY2,'pending','Bia')])).items,
    essayEntry:async()=>contract.parseEssayEntry(current),
    essayAction:async(entryId,action,body)=>{actions.push({action,body});
      if(action==='grading/finalize')current=entry({status:'awaiting_approval',teacherGrading:{id:TG,kind:'teacher',status:'final',total:280,maxScore:400,revision:1,scores:body.scores,comments:body.comments}});
      if(action==='publish')current={...current,status:'published'};
      return contract.parseEssayEntry(current);},
    addEssayPage:async()=>{},removeEssayPage:async()=>{},essayPageImage:async()=>({uri:'x',headers:{}}),
  };
  const h=await setup(t,client);
  assert.match(h.text,/1 de 2 entregues/);
  await h.press('Mobilidade urbana');
  assert.match(h.text,/Para corrigir \(1\)/);
  assert.doesNotMatch(h.text,/Bia/,'o filtro inicial mostra só quem dá para corrigir');
  await h.press('Ana');
  assert.equal(h.component.root.findAll(n=>n.type==='TextInput'&&n.props.accessibilityLabel==='Transcrição da redação')[0].props.value,'Texto lido');
  assert.equal(h.find('Finalizar correção').props.disabled,true,'sem todas as competências');
  const chip=(criterion,value)=>h.component.root.findAll(n=>n.type==='Pressable'&&text(n)===String(value))[criterion];
  await renderer.act(async()=>chip(0,120).props.onPress());
  assert.match(h.text,/Parcial: 120 de 400/);
  await renderer.act(async()=>chip(1,160).props.onPress());
  assert.match(h.text,/Total: 280 de 400/);
  await h.press('Finalizar correção');
  assert.equal(actions[0].action,'grading/finalize');
  assert.deepEqual(actions[0].body.scores.map(s=>s.score),[120,160]);
  assert.match(h.text,/Pronta para publicar/);
  await h.press('Publicar nota ao aluno');
  assert.equal(actions.length,1,'abrir a confirmação não publica');
  assert.match(h.text,/Ana verá a nota 280 de 400/);
  await h.press('Confirmar e publicar');
  assert.deepEqual(actions[1],{action:'publish',body:{confirm:true}});
  assert.match(h.text,/Nota publicada ao aluno/);
  const back=async()=>{let handled;await renderer.act(async()=>{handled=h.backRef.current();});return handled;};
  assert.equal(await back(),true);assert.match(h.text,/Para corrigir/);
  assert.equal(await back(),true);assert.match(h.text,/Atualizar lista/);
  assert.equal(await back(),false,'na lista de redações o voltar sai da aba');
});

test('pages photographed in sequence are uploaded and then the receipt is registered',async t=>{
  let current=entry({status:'pending',submission:null,transcriptions:[]});const uploads=[];const actions=[];
  const client={
    essayApplications:async()=>contract.parseEssayApplications(apps),
    essayQueue:async()=>contract.parseEssayQueue(queuePage([item(ENTRY,current.status,'Ana')])).items,
    essayEntry:async()=>contract.parseEssayEntry(current),
    essayAction:async(entryId,action,body)=>{actions.push(action);if(action==='receive')current={...current,status:'awaiting_grading',submission:{...current.submission,status:'submitted'}};return contract.parseEssayEntry(current);},
    addEssayPage:async(entryId,dataUrl)=>{uploads.push(dataUrl);current={...current,status:'draft',submission:{id:SUB,mode:'teacher_scan',status:'draft',files:uploads.map((_,i)=>({id:id(20+i),position:i+1,mimeType:'image/jpeg'}))}};},
    removeEssayPage:async()=>{},essayPageImage:async()=>({uri:'x',headers:{}}),
  };
  const h=await setup(t,client);
  await h.press('Mobilidade urbana');await h.press('Todas');await h.press('Ana');
  await h.press('Fotografar a redação');
  assert.match(captured.instructions,/uma página por vez/);
  await renderer.act(async()=>captured.onConfirm({photo:{uri:'a'}}));
  await renderer.act(async()=>captured.onConfirm({photo:{uri:'b'}}));
  assert.deepEqual(uploads,['data:image/jpeg;base64,BBBB','data:image/jpeg;base64,BBBB']);
  await renderer.act(async()=>captured.onBack());
  assert.match(h.text,/Páginas enviadas \(2\)/);
  await h.press('Registrar recebimento (2 páginas)');
  assert.deepEqual(actions,['receive']);
  assert.match(h.text,/Recebimento registrado/);
});

test('without a connection nothing is requested',async t=>{
  let calls=0;
  const client={essayApplications:async()=>{calls++;return [];}};
  const h=await setup(t,client,{connected:false});
  assert.equal(calls,0);
  assert.match(h.text,/exige conexão/);
});

test('the student sees the published grade with each competency and the teacher comments',async t=>{
  const {default:StudentEssays}=load(path.join(__dirname,'../StudentEssays.tsx'),{'react-native':RN});
  const request=async p=>p==='/api/student/essays'
    ?[{id:ENTRY,title:'Mobilidade urbana',className:'1º — A',appliedOn:'2026-11-10',submissionStatus:'published',canWrite:false,total:280,maxScore:400},{id:ENTRY2,title:'Outra',className:'1º — A',appliedOn:'2026-11-12',submissionStatus:'awaiting_grading',canWrite:false,total:null,maxScore:null}]
    :{id:ENTRY,status:'published',className:'1º — A',teacherName:'Profa. Lia',canWrite:false,prompt:{title:'Mobilidade urbana'},
      result:{total:280,maxScore:400,annulmentReason:'',comments:'Bom texto',strengths:'',improvements:'Conclusão',rewriteSuggestions:'',criteria:[{id:'c1',numeral:'I',title:'Norma',maxScore:200,score:120,level:'Nível 120',feedback:'Revise vírgulas'}]}};
  let component;
  await renderer.act(async()=>{component=renderer.create(React.createElement(StudentEssays,{request,onOpenPortal:()=>{}}));});
  t.after(async()=>renderer.act(async()=>component.unmount()));
  assert.match(text(component.root),/Nota 280 de 400/);
  assert.match(text(component.root),/Entregue · em correção/);
  const open=component.root.findAll(n=>n.type==='Pressable'&&text(n).includes('Mobilidade'))[0];
  await renderer.act(async()=>open.props.onPress());
  const shown=text(component.root);
  assert.match(shown,/Competência I · 120 de 200/);
  assert.match(shown,/Revise vírgulas/);
  assert.match(shown,/Comentário do professor/);
  assert.match(shown,/O que melhorar/);
});
