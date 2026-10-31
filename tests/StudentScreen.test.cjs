const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),React=require('react'),renderer=require('react-test-renderer'),load=require('./load-typescript.cjs');global.IS_REACT_ACT_ENVIRONMENT=true;
const text=node=>typeof node==='string'?node:(node.children||[]).map(text).join('');
test('student checks the class before requesting membership and sees pending then approved',async t=>{
 const previous=global.fetch;t.after(()=>global.fetch=previous);let status='pending',requested=0;
 global.fetch=async(url,options)=>{assert.equal(options.headers.authorization,'Bearer student-token');let data;if(url.endsWith('/api/auth/me'))data={role:'student',user:{id:'u',displayName:'Aluno',email:'a@example.test'}};else if(url.endsWith('/api/class-join-requests/me'))data=requested?[{id:'r',status,className:'6º A',schoolName:'Escola'}]:[];else if(url.endsWith('/api/student/activities'))data=[];else if(url.endsWith('/api/class-invites/inspect'))data={schoolName:'Escola',className:'6º A',teacherName:'Professor'};else if(url.endsWith('/api/class-invites/request')){requested++;data={status:'pending'};}else throw Error(url);return Response.json({data});};
 const {default:Screen}=load(path.join(__dirname,'../StudentScreen.tsx'),{'react-native':{ActivityIndicator:'ActivityIndicator',AppState:{currentState:'active'},Linking:{openURL:async()=>{}},Image:'Image',Pressable:'Pressable',SafeAreaView:'SafeAreaView',ScrollView:'ScrollView',StyleSheet:{create:x=>x},Text:'Text',TextInput:'TextInput',View:'View'},'expo-secure-store':{getItemAsync:async()=>JSON.stringify({apiUrl:'https://api.example',token:'student-token'}),setItemAsync:async()=>{},deleteItemAsync:async()=>{}},'./ui-styles':{ui:{}},'./StudentInviteScanner':()=>null,'./StudentPhotoScreen':()=>null,'./google-login':{startGoogleLogin:async()=>{},checkGoogleLogin:async()=>false}});
 let component;await renderer.act(async()=>{component=renderer.create(React.createElement(Screen,{apiUrl:'https://api.example',onBack:()=>{}}));});t.after(()=>renderer.act(()=>component.unmount()));
 const press=async label=>renderer.act(async()=>component.root.findAllByType('Pressable').find(n=>text(n)===label).props.onPress());
 await renderer.act(async()=>component.root.findAllByType('TextInput').find(n=>n.props.accessibilityLabel==='Código da turma').props.onChangeText('ABCD-EFGH'));await press('Conferir turma');assert(text(component.root).includes('Professor: Professor'));assert.equal(requested,0);await press('Solicitar participação');assert.equal(requested,1);assert(text(component.root).includes('Aguardando aprovação'));status='approved';await press('Atualizar solicitações');assert(text(component.root).includes('Vínculo aprovado'));assert(!text(component.root).includes('Digitalizações'));
});

function loadScreen(fetchImpl,PhotoScreen=()=>null){global.fetch=fetchImpl;return load(path.join(__dirname,'../StudentScreen.tsx'),{'react-native':{ActivityIndicator:'ActivityIndicator',AppState:{currentState:'active'},Image:'Image',Linking:{openURL:async()=>{}},Pressable:'Pressable',SafeAreaView:'SafeAreaView',ScrollView:'ScrollView',StyleSheet:{create:x=>x},Text:'Text',TextInput:'TextInput',View:'View'},'expo-secure-store':{getItemAsync:async()=>JSON.stringify({apiUrl:'https://api.example',token:'student-token'}),setItemAsync:async()=>{},deleteItemAsync:async()=>{}},'./ui-styles':{ui:{}},'./StudentInviteScanner':()=>null,'./StudentPhotoScreen':PhotoScreen,'./google-login':{startGoogleLogin:async()=>{},checkGoogleLogin:async()=>false}}).default;}
const base=(url,profile)=>url.endsWith('/api/auth/me')?{role:'student',user:{id:'u',displayName:'Aluno',email:'a@example.test'}}:url.endsWith('/api/student/profile')?profile():url.endsWith('/api/student/activities')?[{id:'x',title:'Prova 1',className:'6º A',schoolName:'Escola',score:'8',maxScore:'10',requiresManualReview:false}]:[];
test('approved student opens the photo screen for the linked record and sees the saved photo after refresh',async t=>{
 const previous=global.fetch;t.after(()=>global.fetch=previous);let photo=null,opened;
 const Screen=loadScreen(async url=>Response.json({data:base(url,()=>[{id:'s1',name:'Aluno Silva',registration:'123',selfieDataUrl:photo}])}),props=>{opened=props;return null;});
 let component;await renderer.act(async()=>{component=renderer.create(React.createElement(Screen,{apiUrl:'https://api.example',onBack:()=>{}}));});t.after(()=>renderer.act(()=>component.unmount()));
 assert(text(component.root).includes('Matrícula: 123'));assert.equal(component.root.findAllByType('Image').length,0);
 await renderer.act(async()=>component.root.findAllByType('Pressable').find(n=>text(n)==='Adicionar foto').props.onPress());
 assert.equal(opened.profile.id,'s1');assert.equal(opened.token,'student-token');
 photo='data:image/jpeg;base64,aGVsbG8=';await renderer.act(async()=>opened.onSaved());
 assert(text(component.root).includes('Foto salva no seu cadastro.'));assert.equal(component.root.findByType('Image').props.source.uri,photo);assert(text(component.root).includes('Trocar foto'));
});
test('students without an approved record are told when the photo becomes available and an older API keeps grades visible',async t=>{
 const previous=global.fetch;t.after(()=>global.fetch=previous);
 let Screen=loadScreen(async url=>Response.json({data:base(url,()=>[])}));let component;
 await renderer.act(async()=>{component=renderer.create(React.createElement(Screen,{apiUrl:'https://api.example',onBack:()=>{}}));});
 assert(text(component.root).includes('depois que o professor aprovar'));await renderer.act(()=>component.unmount());
 Screen=loadScreen(async url=>url.endsWith('/api/student/profile')?Response.json({error:'Não encontrado'},{status:404}):Response.json({data:base(url)}));
 await renderer.act(async()=>{component=renderer.create(React.createElement(Screen,{apiUrl:'https://api.example',onBack:()=>{}}));});t.after(()=>renderer.act(()=>component.unmount()));
 assert(text(component.root).includes('Resultado: 8 / 10'));assert(text(component.root).includes('Não foi possível carregar seu cadastro agora.'));
});
