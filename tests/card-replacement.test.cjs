const test=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');const {randomUUID}=require('node:crypto');
const load=require('./load-typescript.cjs');
const {createMemoryStore}=load(path.join(__dirname,'../memory-store.ts'));
const {createSynchronizer}=load(path.join(__dirname,'../offline-sync.ts'));
const {ScanApiError}=load(path.join(__dirname,'../scan-api.ts'));
const OLD='50000000-0000-4000-8000-000000000001';
const sheet=(extra={})=>({photo:{uri:'file:///cache/nova.jpg',width:3000,height:4000},applicationId:'app-1',schoolId:'s',assessmentId:'a',classId:'c',schoolName:'Escola',assessmentTitle:'Prova',className:'Turma',...extra});
const image='data:image/jpeg;base64,YQ==';
// Cliente falso: registra envios e descartes; discard pode falhar de propósito.
function remote(discard){const calls={uploads:[],discards:[]};return {calls,client:{
  capabilities:async()=>{},
  upload:async(data,id,applicationId)=>{calls.uploads.push({id,applicationId});return {id,status:'queued'};},
  discard:async id=>{calls.discards.push(id);if(discard)await discard(id);},
  read:async id=>({id,status:'queued',submissionId:null,revision:null,score:null,maxScore:null,requiresManualReview:false,imageAvailable:true,detectedAnswers:[],candidates:[]}),
}};}

test('a replacement photo is uploaded first and then discards the failed card on the server',async()=>{
  const store=createMemoryStore(randomUUID);const owner='teacher';
  const id=await store.create(owner,sheet({replacesRemoteId:OLD}),image);
  const {calls,client}=remote();
  const report=await createSynchronizer(store,client,owner,()=>Date.now())(true);
  assert.equal(report.error,null);
  assert.equal(calls.uploads.length,1);assert.equal(calls.uploads[0].id,id);
  assert.deepEqual(calls.discards,[OLD]);
  assert.equal((await store.get(owner,id)).remoteId,id);
});

test('a card the server will not discard (409) does not block the new photo',async()=>{
  const store=createMemoryStore(randomUUID);const owner='teacher';
  const id=await store.create(owner,sheet({replacesRemoteId:OLD}),image);
  const {calls,client}=remote(async()=>{throw new ScanApiError('Só é possível remover da fila cartões com erro.',false,409);});
  const report=await createSynchronizer(store,client,owner,()=>Date.now())(true);
  assert.equal(report.error,null);
  assert.deepEqual(calls.discards,[OLD]);
  assert.equal((await store.get(owner,id)).remoteId,id);
});

test('a failed discard is reported, but the new photo stays sent',async()=>{
  const store=createMemoryStore(randomUUID);const owner='teacher';
  const id=await store.create(owner,sheet({replacesRemoteId:OLD}),image);
  const {client}=remote(async()=>{throw new ScanApiError('Falha de conexão',true,503);});
  const report=await createSynchronizer(store,client,owner,()=>Date.now())(true);
  assert.match(report.error,/cartão anterior ainda não foi descartado/);
  assert.equal((await store.get(owner,id)).remoteId,id);
  assert.equal((await store.operations(owner)).length,0);
});

test('an ordinary capture never calls discard',async()=>{
  const store=createMemoryStore(randomUUID);const owner='teacher';
  await store.create(owner,sheet(),image);
  const {calls,client}=remote();
  const report=await createSynchronizer(store,client,owner,()=>Date.now())(true);
  assert.equal(report.error,null);assert.deepEqual(calls.discards,[]);
});
