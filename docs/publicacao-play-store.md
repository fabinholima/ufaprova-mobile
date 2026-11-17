# Publicação na Play Store (Android)

O app é gerado na nuvem pelo EAS Build da Expo, que não exige Android SDK nem Java no computador. A configuração está em `eas.json`:

| Perfil | Gera | Uso |
|---|---|---|
| `preview` | APK | Instalar direto no celular pelo link do EAS (testes, sem loja) |
| `production` | AAB (`app-bundle`) | Enviar à Play Store; a loja só aceita AAB |

Os dois apontam para `https://api.ufaprova.com.br`. O número de versão do Android (`versionCode`) fica no EAS (`appVersionSource: remote`) e sobe sozinho a cada build de produção. A versão exibida na loja é `version` do `app.json`.

O pacote é `br.com.ufaprova.app`. Depois da primeira publicação ele não pode mais mudar.

## 1. Contas (feito por você)

- **Expo:** conta gratuita em expo.dev. O plano gratuito tem uma cota mensal de builds e fila mais lenta; confira os limites atuais na página de preços da Expo antes de contratar qualquer coisa.
- **Google Play Console:** o cadastro de desenvolvedor tem uma taxa única. Confira o valor no próprio Play Console. Conta **pessoal** criada recentemente precisa passar por um teste fechado com testadores durante um período antes de liberar a produção (confira a regra atual no Console). Conta de **organização** (com CNPJ e número D-U-N-S) não tem essa exigência.

## 2. Ligar o projeto ao EAS (uma vez)

```bash
npx eas-cli login
```

```bash
npx eas-cli init
```

O `init` grava o `projectId` em `app.json`. Faça commit dessa mudança.

## 3. APK de teste, com link para baixar

```bash
npx eas-cli build -p android --profile preview
```

No fim, o EAS mostra um link e um QR code para instalar o APK no celular (é preciso permitir "instalar apps desconhecidos").

## 4. Build para a Play Store

```bash
npx eas-cli build -p android --profile production
```

Na primeira vez, deixe o EAS gerar a chave de assinatura (keystore). Ela fica guardada na conta Expo; não apague. A Play Store usa o "Play App Signing": essa chave vira a chave de upload.

## 5. Play Console

1. Criar o app: nome "UFA Prova", idioma português (Brasil), app gratuito.
2. **Primeiro envio é manual:** em Testes > Teste interno, crie uma versão e envie o `.aab` baixado do EAS. A Google não aceita o primeiro envio pela API.
3. Ficha da loja:
   - Ícone 512×512: `assets/play-store-icon-512.png`.
   - Imagem de destaque 1024×500 e capturas de tela do celular (pelo menos 2).
   - Descrição curta e completa.
4. Política de privacidade: `https://ufaprova.com.br/privacidade`. Exclusão de conta (Segurança dos dados): `https://ufaprova.com.br/excluir-conta`; no app, "Excluir minha conta".
5. **Acesso ao app:** a revisão da Google precisa entrar no app. Informe uma conta de teste (professor e aluno) que não tenha dados reais.
6. Formulários: classificação de conteúdo, público-alvo, segurança dos dados (o app coleta nome, e-mail, fotos de folhas de resposta, foto do aluno e notas; usa a câmera; os dados vão para a API por HTTPS).
7. Teste interno ou fechado → produção, quando o Console liberar.

## Pontos que podem barrar a revisão

- **Público-alvo com menores de 13 anos:** se alunos dessa idade usam o app, a Google aplica a política para famílias, com exigências extras (dados de crianças, fotos, login). Responda o formulário de público-alvo de acordo com o uso real.

## Envios seguintes (opcional)

Com uma conta de serviço do Google Cloud ligada ao Play Console, o EAS envia direto para o teste interno (como rascunho):

```bash
npx eas-cli submit -p android --profile production --latest
```

A chave JSON da conta de serviço fica fora do repositório (configure no expo.dev ou informe o caminho na hora).
