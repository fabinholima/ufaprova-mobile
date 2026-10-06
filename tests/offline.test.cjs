const test=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');const fs=require('node:fs/promises');const os=require('node:os');const {randomUUID}=require('node:crypto');
const load=require('./load-typescript.cjs');const open=require('./sqlite-adapter.cjs');
const {createOfflineStore}=load(path.join(__dirname,'../offline-store.ts'));
const {createSynchronizer}=load(path.join(__dirname,'../offline-sync.ts'));
const {ScanApiError}=load(path.join(__dirname,'../scan-api.ts'));
const {manualPayload,initialManualDraft,parseSubmission}=load(path.join(__dirname,'../manual-contract.ts'));
const VERSION='40000000-0000-4000-8000-000000000001', SUBMISSION='30000000-0000-4000-8000-000000000001';
const sheet={photo:{uri:'file:///cache/temporary.jpg',width:3000,height:4000},schoolId:'s',assessmentId:'a',classId:'c',schoolName:'Escola',assessmentTitle:'Prova',className:'Turma'};
const image='data:image/jpeg;base64,YQ==';
const submission={id:SUBMISSION,versionId:VERSION,revision:0,candidate:{name:'Ana',class:'Turma'},responses:[],result:{items:[{questionNumber:1,status:'unanswered',maxPoints:3,awardedPoints:null}]},questions:[{number:1,type:'essay',points:3,statement:[{type:'paragraph',text:'Explique.'}],guide:[]}],score:0,maxScore:3,requiresManualReview:true};
async function setup(t){const db=open();const store=createOfflineStore(db,randomUUID);await store.initialize();t.after(()=>db.close());return {db,store};}
function remote(){const saved=new Map();let uploads=0,manuals=0;let current=structuredClone(submission);return {
  get uploads(){return uploads},get manuals(){return manuals},get current(){return current},set current(value){current=value},
  client:{capabilities:async()=>{},upload:async(data,id)=>{if(!saved.has(id)){saved.set(id,data);uploads++;}return {id,status:'completed'};},read:async id=>({id,status:'completed',submissionId:current.id,revision:current.revision,score:current.score,maxScore:current.maxScore,requiresManualReview:current.requiresManualReview,imageAvailable:true,detectedAnswers:[],candidates:[]}),submission:async()=>structuredClone(current),manual:async(id,payload,key)=>{manuals++;if(payload.expectedRevision!==current.revision)throw new ScanApiError('Resultado mudou',false,409);current={...current,revision:current.revision+1,score:payload.reviews[0].awardedPoints,requiresManualReview:false,result:{items:[{questionNumber:1,status:'manually_reviewed',maxPoints:3,awardedPoints:payload.reviews[0].awardedPoints,feedback:payload.reviews[0].feedback}]}};return structuredClone(current);},confirm:async()=>{throw Error('Unexpected objective review')}}
};}

test('photos, context, drafts and immutable operation IDs survive a real SQLite restart',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'ufaprova-sqlite-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));const filename=path.join(directory,'offline.db');
  let db=open(filename),store=createOfflineStore(db,randomUUID);await store.initialize();const id=await store.create('teacher-a',sheet,image);
  await store.putCache('teacher-a','schools',[{id:'s',name:'Escola'}]);await store.saveDraft('teacher-a',id,'manual',{revision:0,points:{1:'2,5'},feedback:{1:'Comentário'}});
  const operation=(await store.operations('teacher-a'))[0];await store.claim('teacher-a',operation.id);db.close();
  db=open(filename);t.after(()=>db.close());store=createOfflineStore(db,randomUUID);await store.initialize();
  const record=await store.get('teacher-a',id);assert.equal(record.imageDataUrl,image);assert.equal(record.sheet.className,'Turma');assert.equal(record.sheet.photo.uri,`local:${id}`);
  assert.equal((await store.operations('teacher-a'))[0].id,operation.id);assert.equal((await store.operations('teacher-a'))[0].state,'pending');
  assert.deepEqual((await store.draft('teacher-a',id,'manual')).points,{1:'2,5'});assert.equal((await store.cache('teacher-a','schools'))[0].name,'Escola');
});

test('records, cached lists, drafts and queued operations are isolated by account',async t=>{
  const {store}=await setup(t);const id=await store.create('teacher-a',sheet,image);await store.putCache('teacher-a','schools',['private']);await store.saveDraft('teacher-a',id,'manual',{points:{1:'1'}});
  assert.equal((await store.list('teacher-b')).length,0);assert.equal((await store.operations('teacher-b')).length,0);assert.equal(await store.get('teacher-b',id),null);assert.equal(await store.cache('teacher-b','schools'),null);assert.equal(await store.draft('teacher-b',id,'manual'),null);
  await assert.rejects(store.enqueue('teacher-b',id,'manual',{expectedRevision:0,reviews:[]}),/não encontrada/);
  const operation=(await store.operations('teacher-a'))[0];assert.equal(await store.claim('teacher-b',operation.id),false);
});

test('lost upload response retries the same server ID and concurrent sync runs share one worker',async t=>{
  const {store}=await setup(t);const id=await store.create('owner',sheet,image);const server=remote();const upload=server.client.upload;let lose=true;
  server.client.upload=async(...args)=>{const result=await upload(...args);if(lose){lose=false;throw new ScanApiError('Offline after receipt',true);}return result;};
  const sync=createSynchronizer(store,server.client,'owner');const before=(await store.operations('owner'))[0].id;
  await sync();assert.equal(server.uploads,1);assert.equal((await store.operations('owner'))[0].id,before);
  await Promise.all([sync(true),sync(true)]);assert.equal(server.uploads,1);assert.equal((await store.operations('owner')).length,0);assert.equal((await store.get('owner',id)).remoteId,id);
  assert.equal((await store.get('owner',id)).submission.id,SUBMISSION);
});

test('manual notes queue offline and only a server acknowledgement updates the final grade',async t=>{
  const {store}=await setup(t);const id=await store.create('owner',sheet,image),server=remote(),sync=createSynchronizer(store,server.client,'owner');await sync();
  const draft=initialManualDraft(submission);draft.points[1]='2,5';draft.feedback[1]='Muito bom';await store.saveDraft('owner',id,'manual',draft);await store.enqueue('owner',id,'manual',{...manualPayload(submission,draft),submissionId:submission.id});
  assert.equal((await store.get('owner',id)).grade.score,0);assert.equal((await store.operations('owner'))[0].kind,'manual');
  await sync(true);const result=await store.get('owner',id);assert.equal(result.grade.score,2.5);assert.equal(result.submission.revision,1);assert.equal(result.grade.requiresManualReview,false);assert.equal(await store.draft('owner',id,'manual'),null);
});

test('conflicts retain the old draft and require a new explicit revision before resaving',async t=>{
  const {store}=await setup(t);const id=await store.create('owner',sheet,image),server=remote(),sync=createSynchronizer(store,server.client,'owner');await sync();
  const draft=initialManualDraft(submission);draft.points[1]='1,5';await store.saveDraft('owner',id,'manual',draft);await store.enqueue('owner',id,'manual',{...manualPayload(submission,draft),submissionId:submission.id});const oldId=(await store.operations('owner'))[0].id;
  server.current={...server.current,revision:1,score:1};await sync(true);
  const blocked=(await store.operations('owner'))[0];assert.equal(blocked.state,'blocked');assert.equal(blocked.payload.expectedRevision,0);assert.equal((await store.draft('owner',id,'manual')).revision,0);assert.equal((await store.get('owner',id)).submission.revision,1);
  await sync(true);assert.equal(server.manuals,1);
  const latest=(await store.get('owner',id)).submission;draft.revision=latest.revision;await store.saveDraft('owner',id,'manual',draft);await store.enqueue('owner',id,'manual',{...manualPayload(latest,draft),submissionId:latest.id});assert.notEqual((await store.operations('owner'))[0].id,oldId);
  await sync(true);assert.equal((await store.get('owner',id)).grade.score,1.5);assert.equal((await store.operations('owner')).length,0);
});

test('unsupported servers and expired sessions never consume or blindly send queued photos',async t=>{
  const {store}=await setup(t);await store.create('owner',sheet,image);const server=remote();server.client.capabilities=async()=>{throw new ScanApiError('Old endpoint',false,404)};
  const unsupported=await createSynchronizer(store,server.client,'owner')();assert.match(unsupported.error,/atualização/);assert.equal(server.uploads,0);assert.equal((await store.operations('owner')).length,1);
  server.client.capabilities=async()=>{throw new ScanApiError('Expired',false,401)};
  const expired=await createSynchronizer(store,server.client,'owner')();assert.equal(expired.authExpired,true);assert.equal(server.uploads,0);
});

test('manual draft validation distinguishes zero from missing points and rejects invalid ranges',()=>{
  const parsed=parseSubmission(submission);const draft=initialManualDraft(parsed);assert.throws(()=>manualPayload(parsed,draft),/Informe a nota/);
  for(const value of ['-1','4','1,123','NaN','1e2']){draft.points[1]=value;assert.throws(()=>manualPayload(parsed,draft));}
  draft.points[1]='0';assert.equal(manualPayload(parsed,draft).reviews[0].awardedPoints,0);draft.points[1]='2,50';assert.equal(manualPayload(parsed,draft).reviews[0].awardedPoints,2.5);
});

test('account-scoped clients read the account and token as one secure snapshot',async()=>{
  const key='ufaprova.account';const account={owner:'owner-a',apiUrl:'https://api.example.test',userId:'u',institutionId:'i',email:'teacher@example.test',displayName:'Teacher'};
  let credentials=JSON.stringify({...account,sessionToken:'token-a'});let headers;
  const previousFetch=global.fetch;global.fetch=async(url,options)=>{headers=options.headers;return Response.json({data:{schools:[]}})};
  const {accountClient}=load(path.join(__dirname,'../offline-runtime.ts'),{'expo-sqlite':{},'expo-crypto':{},'expo-secure-store':{getItemAsync:async name=>{assert.equal(name,key);const snapshot=credentials;credentials=JSON.stringify({...account,owner:'owner-b',sessionToken:'token-b'});return snapshot;}}});
  try{
    await accountClient(account).catalog('/api/educator-profile');assert.equal(headers.authorization,'Bearer token-a');
    headers=null;await assert.rejects(accountClient(account).catalog('/api/educator-profile'),error=>error.status===401);assert.equal(headers,null);
  }finally{global.fetch=previousFetch;}
});

test('queued manual points never follow a record that was reassigned to another submission',async t=>{
  const {store}=await setup(t);const id=await store.create('owner',sheet,image),server=remote(),sync=createSynchronizer(store,server.client,'owner');await sync();
  const draft=initialManualDraft(submission);draft.points[1]='2';await store.saveDraft('owner',id,'manual',draft);await store.enqueue('owner',id,'manual',{...manualPayload(submission,draft),submissionId:submission.id});
  const reassigned={...submission,id:'30000000-0000-4000-8000-000000000002',candidate:{name:'Outro aluno'}};
  await store.update('owner',id,{submission:reassigned});await sync(true);
  assert.equal(server.manuals,0);const blocked=(await store.operations('owner'))[0];assert.equal(blocked.state,'blocked');assert.match(blocked.error,/identificação/);
  assert.equal((await store.draft('owner',id,'manual')).submissionId,submission.id);
});
