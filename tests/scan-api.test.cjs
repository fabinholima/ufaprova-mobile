const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const load = require('./load-typescript.cjs');
const { createScanClient, jpegDataUrl, watchScan, ScanApiError } = load(path.join(__dirname, '../scan-api.ts'));
const { parseScan, initialAnswers, matchesContext, reviewResponses } = load(path.join(__dirname, '../scan-contract.ts'));
const ID = '10000000-0000-4000-8000-000000000001';
const STUDENT = '20000000-0000-4000-8000-000000000001';
const SUBMISSION = '30000000-0000-4000-8000-000000000001';
const candidate = { id: STUDENT, studentName: 'Ana', versionCode: 'B', assessmentTitle: 'Matemática', className: '6º A', questions: [
  { number: 1, type: 'multiple_choice', labels: ['A','B','C','D','E'] },
  { number: 2, type: 'essay', labels: [] },
  { number: 3, type: 'multiple_choice', labels: ['A','B','C'] },
] };
const scan = status => ({ id: ID, status, applicationStudentId: STUDENT, imageAvailable: true, error: null,
  candidates: [candidate], detectedAnswers: [{ questionNumber: 1, selectedLabels: ['B','D'], status: 'multiple' },{ questionNumber: 3, selectedLabels: [], status: 'blank' }] });

test('upload, poll, review confirmation and grade follow the server contract over HTTP', async t => {
  let reads = 0;
  const requests = [];
  const server = http.createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : null;
    requests.push({ method: req.method, path: req.url, body });
    assert.equal(req.headers.authorization, 'Bearer session-token');
    assert.equal(req.headers['x-client'], 'mobile');
    let data;
    if (req.method === 'POST' && req.url === '/api/card-scans') {
      assert.deepEqual(Object.keys(body), ['imageDataUrl']);
      assert.equal(body.imageDataUrl, 'data:image/jpeg;base64,YQ==');
      res.statusCode = 202; data = { id: ID, status: 'queued' };
    } else if (req.method === 'GET' && req.url === `/api/card-scans/${ID}`) data = scan(++reads < 2 ? 'processing' : 'review');
    else if (req.method === 'POST' && req.url.endsWith('/confirm')) {
      assert.deepEqual(body, { applicationStudentId: STUDENT, responses: [{questionNumber:1,selectedLabels:['C']},{questionNumber:3,selectedLabels:[]}] });
      data = { id: ID, submissionId: SUBMISSION, score: 2, maxScore: 3, requiresManualReview: true };
    } else if (req.method === 'GET' && req.url === '/api/card-scans') data = [{ id: ID, submissionId: SUBMISSION, score: 2, maxScore: 3, requiresManualReview: true }];
    else if (req.method === 'POST' && req.url.endsWith('/retry')) { res.statusCode = 202; data = { id: ID, status: 'queued' }; }
    else { res.statusCode = 404; data = null; }
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ data }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const client = createScanClient(`http://127.0.0.1:${server.address().port}/`, async () => 'session-token');
  assert.equal((await client.upload(jpegDataUrl('YQ=='))).id, ID);
  const statuses = [];
  const result = await watchScan(client, ID, { signal: new AbortController().signal, onScan:r=>statuses.push(r.status), delay:async()=>{} });
  assert.equal(result.status, 'review'); assert.deepEqual(statuses,['processing','review']);
  const grade = await client.confirm(ID, result.candidates[0], {1:['C'],3:[]});
  assert.equal(grade.score,2); assert.equal(grade.requiresManualReview,true);
  assert.equal((await client.grade(ID)).submissionId,SUBMISSION);
  await client.retry(ID);
  assert.equal(requests.filter(r=>r.method==='POST' && r.path==='/api/card-scans').length,1);
});

test('image payload enforces the real API limit, including the data URL prefix', () => {
  assert.throws(()=>jpegDataUrl(undefined), /preparar/);
  assert.throws(()=>jpegDataUrl('invalid%'), /preparar/);
  assert.throws(()=>jpegDataUrl('A'), /preparar/);
  assert.equal(jpegDataUrl('A'.repeat(7_999_976)).length,7_999_999);
  assert.throws(()=>jpegDataUrl('A'.repeat(7_999_980)), /limite/);
});

test('review uses the chosen version, keeps blank/multiple marks, and excludes essays', () => {
  const record = parseScan(scan('review'));
  assert.deepEqual(initialAnswers(candidate,record.detectedAnswers,true),{1:['B','D'],3:[]});
  assert.deepEqual(initialAnswers(candidate,record.detectedAnswers,false),{1:[],3:[]});
  assert.deepEqual(reviewResponses(candidate,{1:['B','D'],2:['A'],3:[]}),[{questionNumber:1,selectedLabels:['B','D']},{questionNumber:3,selectedLabels:[]}]);
  assert.throws(()=>reviewResponses(candidate,{1:['E'],3:['E']}), /questão 3/);
  assert.throws(()=>reviewResponses(candidate,{1:['A','A']}), /inválida/);
  assert.equal(matchesContext(candidate,{assessmentTitle:'Matemática',className:'6º B'}),false);
});

test('polling stops at terminal states, on cancellation and at its configured limit', async () => {
  let calls=0; const controller=new AbortController();
  await watchScan({read:async()=>{calls++;return parseScan(scan('completed'));}},ID,{signal:controller.signal,onScan:()=>{},delay:async()=>{throw Error('unexpected wait')}});
  assert.equal(calls,1);
  calls=0;
  assert.equal(await watchScan({read:async()=>{calls++;return parseScan(scan('queued'));}},ID,{signal:controller.signal,maxAttempts:2,onScan:()=>{},delay:async()=>{}}),null);
  assert.equal(calls,2);
  controller.abort();
  await watchScan({read:async()=>{throw Error('unexpected fetch')}},ID,{signal:controller.signal,onScan:()=>{throw Error('unexpected callback')}});
  let resolve; const pending=new Promise(r=>resolve=r); const aborted=new AbortController(); let updates=0;
  const watching=watchScan({read:()=>pending},ID,{signal:aborted.signal,onScan:()=>updates++});
  aborted.abort(); resolve(parseScan(scan('review'))); await watching; assert.equal(updates,0);
});

test('missing authentication and unsafe/malformed API responses cannot masquerade as success', async () => {
  const missing=createScanClient('https://example.test',async()=>null,async()=>{throw Error('unexpected fetch')});
  await assert.rejects(missing.upload(jpegDataUrl('YQ==')),e=>e instanceof ScanApiError && e.status===401 && !e.uncertain);
  const broken=createScanClient('https://example.test',async()=>'token',async()=>new Response('gateway',{status:502}));
  await assert.rejects(broken.upload(jpegDataUrl('YQ==')),e=>e.uncertain===true);
  const offline=createScanClient('https://example.test',async()=>'token',async()=>{throw Error('offline')});
  await assert.rejects(offline.upload(jpegDataUrl('YQ==')),e=>e.uncertain===true);
  const rejected=createScanClient('https://example.test',async()=>'token',async()=>Response.json({error:'Foto muito grande'},{status:422}));
  await assert.rejects(rejected.upload(jpegDataUrl('YQ==')),e=>e.status===422 && !e.uncertain);
  const malformed=createScanClient('https://example.test',async()=>'token',async()=>Response.json({data:{id:'bad',status:'queued'}}));
  await assert.rejects(malformed.upload(jpegDataUrl('YQ==')),e=>e.uncertain===true);
  assert.throws(()=>parseScan({...scan('review'),status:'mystery'}), /Status/);
  assert.throws(()=>parseScan({...scan('review'),detectedAnswers:[{questionNumber:1,selectedLabels:['Z']}]}), /alternativas/);
});

test('image preparation bounds the longest edge, encodes JPEG and releases native resources', async () => {
  const operations=[];
  const image={saveAsync:async options=>{operations.push(options);return {base64:'YQ=='}},release:()=>operations.push('release image')};
  const context={resize:size=>operations.push(size),renderAsync:async()=>image,release:()=>operations.push('release context')};
  const {prepareImage}=load(path.join(__dirname,'../prepare-image.ts'),{'expo-image-manipulator':{ImageManipulator:{manipulate:uri=>{operations.push(uri);return context}},SaveFormat:{JPEG:'jpeg'}}});
  assert.equal(await prepareImage({uri:'file:///photo.jpg',width:3000,height:4000}),jpegDataUrl('YQ=='));
  assert.deepEqual(operations,['file:///photo.jpg',{height:2600},{format:'jpeg',compress:0.9,base64:true},'release image','release context']);
  operations.length=0;await prepareImage({uri:'file:///small.jpg',width:1000,height:2000});assert(!operations.some(item=>item && item.height===2600));
});

test('offline clients verify the current institution and include the expected scope in mutations',async()=>{
  const userId='10000000-0000-4000-8000-000000000001',institutionId='20000000-0000-4000-8000-000000000001';let mismatch=true,calls=0;
  const client=createScanClient('https://example.test',async()=>'token',async(url,options)=>{
    if(url.endsWith('/api/mobile-sync'))return Response.json({data:{version:1,idempotentUploads:true,manualReview:true,userId,institutionId:mismatch?'different':institutionId}});
    calls++;const body=JSON.parse(options.body);assert.equal(body.expectedInstitutionId,institutionId);assert.equal(body.clientScanId,ID);return Response.json({data:{id:ID,status:'queued'}});
  },{userId,institutionId});
  await assert.rejects(client.capabilities(),error=>error.status===401);assert.equal(calls,0);
  mismatch=false;await client.capabilities();await client.upload(jpegDataUrl('YQ=='),ID);assert.equal(calls,1);
});
