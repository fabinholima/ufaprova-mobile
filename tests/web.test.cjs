const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),vm=require('node:vm'),load=require('./load-typescript.cjs');
const API='https://api.test';
function mockFetch(t,handler){const previous=global.fetch;global.fetch=handler;t.after(()=>{global.fetch=previous;});}

test('the subdomain chooses the entry profile; local builds use ?perfil=',()=>{
  const {profileFromLocation}=load(path.join(__dirname,'../profiles.ts'));
  assert.equal(profileFromLocation('professor.ufaprova.com.br'),'teacher');
  assert.equal(profileFromLocation('ALUNO.ufaprova.com.br'),'student');
  assert.equal(profileFromLocation('ufaprova.com.br'),null);
  assert.equal(profileFromLocation('localhost','?perfil=aluno'),'student');
  assert.equal(profileFromLocation('localhost','?perfil=professor'),'teacher');
  assert.equal(profileFromLocation('aluno-falso.example','?perfil=admin'),null);
});

test('in the browser the session is the HttpOnly cookie, never a stored token',async t=>{
  const web=load(path.join(__dirname,'../platform-http.web.ts'));
  assert.deepEqual(web.authHeaders(web.COOKIE_SESSION),{'x-client':'web'});
  assert.equal(web.loginToken({}),web.COOKIE_SESSION,'o login pelo navegador não devolve token no corpo');
  const calls=[];mockFetch(t,async(url,options)=>{calls.push({url,options});return {ok:true,status:200};});
  assert.equal(await web.persistSession(`${API}/`,'google-token'),web.COOKIE_SESSION);
  assert.equal(calls[0].url,`${API}/api/auth/session/cookie`);
  assert.equal(calls[0].options.credentials,'include');
  assert.equal(calls[0].options.headers.authorization,'Bearer google-token');
  assert.equal(await web.persistSession(API,web.COOKIE_SESSION),web.COOKIE_SESSION);
  assert.equal(calls.length,1,'cookie já existente não é trocado de novo');
  await web.endSession(API);
  assert.equal(calls[1].url,`${API}/api/auth/logout`);assert.equal(calls[1].options.credentials,'include');
  const native=load(path.join(__dirname,'../platform-http.ts'));
  assert.deepEqual(native.authHeaders('t'),{'x-client':'mobile',authorization:'Bearer t'});
  assert.equal(native.loginToken({}),null);
});

test('the browser restores the session from the API instead of browser storage',async t=>{
  const loadStore=()=>load(path.join(__dirname,'../platform-store.web.ts'),{'./api-config':{API_URL:API}}).sessionStore;
  let identity={role:'student',user:{id:'u'}};const urls=[];
  mockFetch(t,async(url,options)=>{urls.push(url);assert.equal(options.credentials,'include');assert.equal(options.headers.authorization,undefined);return identity?Response.json({data:identity}):Response.json({error:'x'},{status:401});});
  let store=loadStore();
  assert.deepEqual(JSON.parse(await store.getItemAsync('ufaprova.student.session.v1')),{apiUrl:API,token:'cookie-session'});
  assert.equal(await store.getItemAsync('ufaprova.account'),null);
  assert.equal(urls.length,1,'consulta a API uma vez por abertura');
  await store.deleteItemAsync('ufaprova.student.session.v1');
  assert.equal(await store.getItemAsync('ufaprova.student.session.v1'),null);
  identity={role:'teacher',user:{id:'10000000-0000-4000-8000-000000000001',email:'p@example.test',displayName:'Profa.'},institution:{id:'20000000-0000-4000-8000-000000000001'}};
  store=loadStore();
  const account=JSON.parse(await store.getItemAsync('ufaprova.account'));
  assert.equal(account.sessionToken,'cookie-session');assert.equal(account.displayName,'Profa.');
  identity=null;store=loadStore();
  assert.equal(await store.getItemAsync('ufaprova.account'),null);
  assert.equal(typeof globalThis.localStorage,'undefined');
});

test('the service worker caches only the public app files of its own origin',async()=>{
  const listeners={},cached=[];
  const caches={open:async()=>({put:async(request)=>{cached.push(typeof request==='string'?request:request.url);},addAll:async()=>{}}),match:async()=>undefined,keys:async()=>[],delete:async()=>true};
  const self={location:{origin:'https://professor.ufaprova.com.br'},addEventListener:(type,listener)=>{listeners[type]=listener;},skipWaiting:()=>{},clients:{claim:()=>{}}};
  const response=(cacheControl='')=>({ok:true,type:'basic',headers:new Headers({'cache-control':cacheControl}),clone(){return this;}});
  let next=response();
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/sw.js'),'utf8'),{self,caches,URL,fetch:async()=>next,Promise});
  async function request(url,options={}){let handled=null;listeners.fetch({request:{url,method:options.method||'GET',mode:options.mode||'cors'},respondWith:value=>{handled=value;}});if(handled)await handled;await new Promise(resolve=>setImmediate(resolve));return handled!==null;}
  assert.equal(await request('https://api.ufaprova.com.br/api/student/activities'),false,'API em outra origem');
  assert.equal(await request('https://professor.ufaprova.com.br/api/assessment-results/x'),false,'rota /api na mesma origem');
  assert.equal(await request('https://professor.ufaprova.com.br/_expo/static/js/web/AppEntry-abc.js',{method:'POST'}),false);
  assert.equal(await request('https://professor.ufaprova.com.br/_expo/static/js/web/AppEntry-abc.js'),true);
  next=response('no-store');
  assert.equal(await request('https://professor.ufaprova.com.br/_expo/static/js/web/private.js'),true);
  assert.equal(await request('https://professor.ufaprova.com.br/turma',{mode:'navigate'}),true);
  assert.deepEqual(cached,['https://professor.ufaprova.com.br/_expo/static/js/web/AppEntry-abc.js'],'respostas no-store não entram no cache');
});

test('the previous API address counts as the same API only for the new default',()=>{
  const {sameApi,API_URL}=load(path.join(__dirname,'../api-config.ts'));
  assert.equal(API_URL,process.env.EXPO_PUBLIC_API_URL||'https://api.ufaprova.com.br');
  assert.equal(sameApi('https://ufaprova-api.onrender.com','https://api.ufaprova.com.br/'),true);
  assert.equal(sameApi('https://api.ufaprova.com.br/','https://api.ufaprova.com.br'),true);
  assert.equal(sameApi('https://ufaprova-api.onrender.com','http://localhost:8788'),false);
  assert.equal(sameApi('https://outra-api.example','https://api.ufaprova.com.br'),false);
  assert.equal(sameApi(undefined,'https://api.ufaprova.com.br'),false);
});
