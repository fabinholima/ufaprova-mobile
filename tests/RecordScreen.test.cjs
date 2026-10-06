const test=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');const {randomUUID}=require('node:crypto');const React=require('react');const renderer=require('react-test-renderer');const load=require('./load-typescript.cjs');const open=require('./sqlite-adapter.cjs');
const {createOfflineStore}=load(path.join(__dirname,'../offline-store.ts'));global.IS_REACT_ACT_ENVIRONMENT=true;
const native={Image:'Image',Pressable:'Pressable',Text:'Text',TextInput:'TextInput',View:'View',StyleSheet:{create:x=>x}};
const {default:RecordScreen}=load(path.join(__dirname,'../RecordScreen.tsx'),{'react-native':native});
const {default:ManualReviewScreen}=load(path.join(__dirname,'../ManualReviewScreen.tsx'),{'react-native':native});
const A='10000000-0000-4000-8000-000000000001',C='20000000-0000-4000-8000-000000000001',S='30000000-0000-4000-8000-000000000001',SUB='40000000-0000-4000-8000-000000000001',V='50000000-0000-4000-8000-000000000001';
const candidate={id:S,studentName:'Ana',versionCode:'B',assessmentId:A,classId:C,assessmentTitle:'Prova',className:'Turma',questions:[{number:1,type:'single_choice',labels:['A','B']},{number:2,type:'essay',labels:[]}]};
const submission={id:SUB,versionId:V,revision:0,candidate:{name:'Ana',class:'Turma'},responses:[],result:{items:[{questionNumber:1,status:'correct',maxPoints:1,awardedPoints:1},{questionNumber:2,status:'unanswered',maxPoints:3,awardedPoints:null}]},questions:[{number:1,type:'single_choice',points:1,statement:[],guide:[]},{number:2,type:'essay',points:3,statement:[{type:'paragraph',text:'Explique a resposta.'}],guide:[{type:'paragraph',text:'Orientação para corrigir.'}]}],score:1,maxScore:4,requiresManualReview:true};
function text(node){return typeof node==='string'?node:node.children.map(text).join('');}function button(root,label){return root.findAllByType('Pressable').find(item=>text(item).includes(label));}
async function data(t){const db=open(),store=createOfflineStore(db,randomUUID);await store.initialize();t.after(()=>db.close());const id=await store.create('owner',{photo:{uri:'file:///temporary.jpg',width:2000,height:3000},schoolId:'school',assessmentId:A,classId:C,schoolName:'Escola',assessmentTitle:'Prova',className:'Turma'},'data:image/jpeg;base64,YQ==');const op=(await store.operations('owner'))[0];await store.acknowledge('owner',op.id,id,{remoteId:id,scan:{id,status:'review',applicationStudentId:S,imageAvailable:true,detectedAnswers:[{questionNumber:1,selectedLabels:['B'],status:'recognized'}],candidates:[candidate]}});return {db,store,id};}
async function render(t,Component,props){let component;await renderer.act(async()=>{component=renderer.create(React.createElement(Component,props));});t.after(async()=>renderer.act(async()=>component.unmount()));return component;}
async function press(component,label){const b=button(component.root,label);assert(b,`Missing: ${label}`);assert(!b.props.disabled,`Disabled: ${label}`);await renderer.act(async()=>b.props.onPress());}

test('objective review can be saved offline with mandatory verification and intact context',async t=>{
  const {store,id}=await data(t);const record=await store.get('owner',id);const props={record,store,operations:[],connected:false,onSaved:async()=>{},onRefresh:async()=>{},onNext(){},onBack(){},onRetry:async()=>{}};
  const screen=await render(t,RecordScreen,props);assert.equal(button(screen.root,'Salvar revisão').props.disabled,true);
  assert(text(screen.root).includes('Sem conexão'));await press(screen,'Conferi o aluno');await press(screen,'Salvar revisão');
  const operation=(await store.operations('owner'))[0];assert.equal(operation.kind,'confirm');assert.equal(operation.payload.candidate.id,S);assert.deepEqual(operation.payload.answers,{1:['B']});
  assert.equal((await store.get('owner',id)).scan.status,'review');
});

test('candidate filtering uses assessment/class IDs even when names collide',async t=>{
  const {store,id}=await data(t),record=await store.get('owner',id);record.scan.applicationStudentId=null;record.scan.candidates.push({...candidate,id:randomUUID(),assessmentId:randomUUID(),studentName:'Bruno'});
  const screen=await render(t,RecordScreen,{record,store,operations:[],connected:false,onSaved:async()=>{},onRefresh:async()=>{},onNext(){},onBack(){},onRetry:async()=>{}});
  assert(!text(screen.root).includes('Bruno'));assert(!button(screen.root,'Salvar revisão'));
  await press(screen,'Ana');assert.equal(button(screen.root,'Salvar revisão').props.disabled,true);assert(text(screen.root).includes('Em branco'));
});

test('manual grades and feedback save a draft and a durable queue entry without changing the final grade',async t=>{
  const {store,id}=await data(t);await store.update('owner',id,{submission});const record=await store.get('owner',id);
  const screen=await render(t,ManualReviewScreen,{record,store,onSaved:async()=>{},onRefresh:async()=>{}});
  assert(text(screen.root).includes('Explique a resposta.'));assert(text(screen.root).includes('Orientação para corrigir.'));
  const input=screen.root.findAllByType('TextInput').find(node=>node.props.accessibilityLabel==='Nota da questão 2');
  await renderer.act(async()=>input.props.onChangeText('2,5'));const feedback=screen.root.findAllByType('TextInput').find(node=>node.props.accessibilityLabel==='Comentário da questão 2');await renderer.act(async()=>feedback.props.onChangeText('Boa resposta'));
  await press(screen,'Conferi o aluno e todas as notas');await press(screen,'Salvar correção');
  const op=(await store.operations('owner'))[0];assert.equal(op.kind,'manual');assert.deepEqual(op.payload,{submissionId:SUB,expectedRevision:0,reviews:[{questionNumber:2,awardedPoints:2.5,feedback:'Boa resposta'}]});
  assert.equal((await store.get('owner',id)).submission.score,1);assert.equal((await store.draft('owner',id,'manual')).points[2],'2,5');
});

test('manual conflict requires comparing server points and explicitly adopting the current revision',async t=>{
  const {store,id}=await data(t);await store.update('owner',id,{submission:{...submission,revision:1}});await store.saveDraft('owner',id,'manual',{submissionId:SUB,revision:0,points:{2:'2'},feedback:{2:'Local'}});
  const record=await store.get('owner',id);const screen=await render(t,ManualReviewScreen,{record,store,onSaved:async()=>{},onRefresh:async()=>{}});
  assert(text(screen.root).includes('resultado no servidor mudou'));assert.equal(button(screen.root,'Salvar correção').props.disabled,true);
  await press(screen,'Conferi as alterações');await press(screen,'Conferi o aluno e todas as notas');await press(screen,'Salvar correção');assert.equal((await store.operations('owner'))[0].payload.expectedRevision,1);
});

test('queued manual corrections cannot be edited or duplicated while awaiting acknowledgement',async t=>{
  const {store,id}=await data(t);await store.update('owner',id,{submission});await store.enqueue('owner',id,'manual',{submissionId:SUB,expectedRevision:0,reviews:[{questionNumber:2,awardedPoints:2,feedback:''}]});const operation=(await store.operations('owner'))[0];
  const screen=await render(t,ManualReviewScreen,{record:await store.get('owner',id),store,operation,onSaved:async()=>{},onRefresh:async()=>{}});
  assert.equal(button(screen.root,'Salvar correção').props.disabled,true);assert(screen.root.findAllByType('TextInput').every(input=>input.props.editable===false));
  await assert.rejects(store.enqueue('owner',id,'manual',operation.payload),/já está aguardando/);
});
