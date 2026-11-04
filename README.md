# UFA Prova Mobile

MVP móvel de captura e correção, separado do frontend web.

## Fluxo implementado

1. Login do professor e seleção de escola.
2. Listas de avaliações e turmas da instituição autenticada, com cópia local para uso offline.
3. Captura com câmera traseira, permissão, prévia e opção de refazer a foto.
4. Envio e acompanhamento da leitura OMR no servidor, revisão das marcações e confirmação do resultado.
5. Correção manual de questões discursivas e respostas curtas, com notas, comentários, rascunhos e sincronização offline.

A validação com fotos reais e aparelhos Android/iOS continua necessária. A leitura OMR depende do worker do servidor; não acontece no celular sem conexão.

## Desenvolvimento

```bash
npm install
npm run typecheck
npm test
npx expo start
```

A API padrão é `https://api.ufaprova.com.br`. Configure `EXPO_PUBLIC_API_URL` para usar outra API. Contas, fotos na fila e listas salvas com o endereço anterior (`https://ufaprova-api.onrender.com`, a mesma API) passam para o novo endereço ao abrir o app, sem novo login. O projeto usa Expo SDK 58. Use uma versão compatível do Expo Go ou uma compilação de desenvolvimento. Permissões alteradas em `app.json` exigem recompilar o aplicativo instalado.

## Versão web (PWA)

O mesmo código é publicado como site estático em dois endereços:

- `https://professor.ufaprova.com.br` abre a entrada do professor;
- `https://aluno.ufaprova.com.br` abre direto a área do aluno.

O subdomínio só escolhe a tela inicial; as permissões são da API. Uma conta de aluno que entra pela entrada do professor recebe a opção **Abrir área do aluno**, já conectada.

```bash
cp .env.example .env.local   # endereços locais
npx expo start --web         # desenvolvimento: http://localhost:8081/?perfil=professor ou ?perfil=aluno
npx expo export --platform web   # build de produção em dist/
```

No navegador:

- A sessão fica no cookie HttpOnly da API. Nenhum token vai para localStorage, sessionStorage ou IndexedDB. Ao reabrir, a sessão é restaurada por `GET /api/auth/me`. A entrada Google troca o token pelo cookie em `POST /api/auth/session/cookie`.
- Nada da escola é gravado no aparelho. Fotos de cartões, listas e rascunhos ficam só na memória da aba (`memory-store.ts`, com as mesmas regras do SQLite do aplicativo). O navegador avisa antes de fechar a aba com fotos ainda não enviadas.
- O service worker (`public/sw.js`) guarda apenas os arquivos públicos do próprio site: página, scripts com hash e ícones. Ele não intercepta a API nem respostas `no-store`; notas e fotos nunca entram no cache.
- A câmera exige HTTPS e a permissão do navegador.

Os módulos com versão `.web.ts` (`platform-http`, `platform-store`, `host-profile`, `offline-runtime`) substituem os nativos só no build web. O aplicativo nativo continua usando SecureStore e SQLite.

Publicação: `render.yaml` descreve o site estático `ufaprova-pwa`, com os cabeçalhos de segurança (CSP, Permissions-Policy, HSTS) e o cache. O arquivo não cria o serviço; os passos, o DNS e o domínio recomendado para a API (`api.ufaprova.com.br`) estão em `docs/pwa-subdominios.md` no repositório da API.

## Entrada com Google e senha

O campo de senha oferece **Mostrar senha** e **Ocultar senha**. A senha começa oculta e volta a ficar oculta depois da entrada.

**Entrar com Google** abre o navegador do celular. Escolha a conta e retorne ao app; a confirmação acontece com o aplicativo aberto, ou pelo botão **Concluir entrada com Google**. O acesso exige uma conta Google já cadastrada no portal. Contas criadas com senha não são vinculadas automaticamente ao Google.

A API precisa publicar os endpoints móveis e aplicar `database/069_mobile_google_login.sql`. Configure no servidor `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` (callback HTTPS da API) e `AUTH_FRONTEND_URL`, como no acesso Google do portal. `GET /api/auth/config` deve informar `google: true` e `googleMobile: true`. Nenhum segredo Google deve ser colocado no app.

Endpoints: `POST /api/auth/google/mobile/start` recebe o hash de uma chave aleatória criada no aparelho e devolve o endereço do navegador; `GET /api/auth/google/mobile/browser` vincula o navegador à tentativa e inicia o OAuth existente com PKCE; `POST /api/auth/google/mobile/status` verifica a conclusão com a chave privada do aparelho. Tentativas expiram em dez minutos. O navegador não recebe a sessão do aplicativo. O app confirma a identidade em `/api/auth/me` antes de guardar a sessão no SecureStore.

Os testes de armazenamento usam `node:sqlite` (Node 22.13+). Na pasta `../caderno-bncc-atualizado/services/api`, execute `node --test` para os testes de API. Para a integração transacional, configure `MOBILE_SYNC_TEST_DATABASE_URL` apontando para um PostgreSQL de teste e execute `node --test mobile-sync.integration.test.mjs`; o teste cria e remove seu próprio schema.

As telas e módulos nativos são simulados; o contrato HTTP é exercitado com servidor local, e os testes do backend usam PostgreSQL isolado.

## Uso offline

Entre com internet pelo menos uma vez e carregue escolas, avaliações e turmas. O app mantém a última conta no SecureStore e as listas no [Expo SQLite](https://docs.expo.dev/versions/v58.0.0/sdk/sqlite/), separadas por URL da API, professor e instituição.

Ao tocar em **Usar esta foto**, a imagem é preparada e salva no SQLite com escola, avaliação e turma. O JPEG conserva a página inteira, limita o lado maior a 2600 pixels e usa qualidade de 90%. Ele não depende do arquivo temporário da câmera. O limite de envio continua sendo 8 milhões de caracteres no data URL, incluindo o prefixo.

As digitalizações aparecem na lista mesmo depois de fechar e abrir o aplicativo. Você pode capturar várias folhas sem internet. Quando houver conexão, a fila envia as fotos e busca os resultados do servidor. O acompanhamento pausa em segundo plano e retoma com o app aberto. Não há promessa de envio com o aplicativo encerrado.

Para revisar marcações offline, carregue primeiro o resultado da leitura. Confira aluno, versão e alternativas e use **Salvar revisão para sincronizar**. A identificação usa os IDs de avaliação e turma retornados pela API atualizada. Nomes iguais não misturam contextos. A escola é preservada localmente; a API ainda lista avaliações e turmas por instituição, sem filtro por escola.

Para corrigir discursivas offline, carregue primeiro a correção e as questões. Informe a nota de cada questão, entre zero e o valor máximo, com até duas casas decimais. Zero precisa ser informado explicitamente; um campo vazio permanece sem nota. Os comentários são opcionais. Consulte a resposta transcrita quando disponível ou a prova física/foto do aluno; o cartão de alternativas não contém as respostas discursivas. O enunciado e a orientação de correção são os do snapshot da avaliação, sem gerar uma resposta esperada artificialmente.

Notas e comentários são salvos como rascunho a cada alteração. Depois de conferir aluno e notas, use **Salvar correção para sincronizar**. O resultado continua marcado como parcial até a confirmação do servidor. A fila preserva as notas enquanto aguardam envio e desabilita alterações nessa operação já preparada.

## Sincronização e conflitos

A sincronização usa [NetInfo](https://docs.expo.dev/versions/v58.0.0/sdk/netinfo/) e o estado do aplicativo. Com conexão e app em primeiro plano, verifica os trabalhos pendentes a cada 10 segundos. Também pode ser acionada por **Sincronizar agora**. Falhas transitórias recebem novas tentativas com atraso crescente, de 5 segundos a 5 minutos. Consultas e operações da fila nunca usam o token de outra conta; identidade e token são lidos juntos do SecureStore. A conta é vinculada à instituição confirmada por `/api/auth/me`, e o servidor verifica a instituição esperada em cada envio.

Cada foto tem um UUID estável enviado como `clientScanId`. Correções usam um `clientMutationId` estável. A operação mantém também o ID original da correção: uma folha reassociada no servidor exige nova conferência, sem transferir notas para outro aluno automaticamente. O backend devolve o resultado original quando uma operação é repetida após perda de resposta ou reinício, sem criar outra digitalização nem reaplicar a nota.

A fila só remove uma operação depois de salvar a confirmação na mesma transação local. Operações interrompidas durante um reinício voltam à fila com os mesmos identificadores. Fotos, resultados e rascunhos permanecem no aparelho; sair da conta não apaga trabalhos pendentes, e eles reaparecem ao entrar na mesma conta. O app não oferece uma política automática de exclusão de digitalizações nesta versão.

Notas manuais incluem `expectedRevision`. Se outra pessoa alterar a correção no servidor, a API responde `409`: a operação fica bloqueada e o rascunho permanece intacto. Atualize o resultado, compare as notas do servidor, toque em **Conferi as alterações; usar versão atual**, confira novamente as notas e salve. Isso cria uma nova operação; o aplicativo não resolve o conflito sobrescrevendo notas automaticamente.

Se a sessão expirar, os dados continuam locais e a sincronização aguarda novo login. Um servidor antigo também não recebe envios offline: o app consulta `/api/mobile-sync` antes de consumir a fila e pede a atualização do servidor.

## Atualização necessária do backend

O código correspondente está no repositório local `../caderno-bncc-atualizado`. A API executa as migrações antes de iniciar, com trava transacional para evitar execuções simultâneas. O endpoint `/health` informa a revisão publicada e a versão da estrutura de sincronização.

1. Publique as alterações de API e worker OMR e aplique `database/066_mobile_sync_manual_review.sql` antes de liberar o novo aplicativo.
2. A migração adiciona a revisão das correções, o hash dos uploads e recibos de sincronização. Na pasta `services/api`, o comando habitual é `npm run migrate`, com `DATABASE_URL` configurado para o ambiente pretendido.
3. Confira `GET /api/mobile-sync` com a sessão do professor: deve retornar versão 1 e suporte a upload idempotente e correção manual.
4. Mantenha o worker OMR ativo. Use folhas de uma aplicação cadastrada, com QR e bolhas de respostas visíveis. O worker só identifica aplicações ativas da instituição que enviou a foto.

Os envios offline incluem `expectedInstitutionId`, validado contra a instituição autenticada antes de escrever dados.

Endpoints usados:

- `POST /api/card-scans`: `{ imageDataUrl, clientScanId }`.
- `GET /api/card-scans/:id`: estado, respostas, aluno, nota, ID da correção, revisão e candidatos com IDs da avaliação/turma.
- `POST /api/card-scans/:id/confirm`: `{ applicationStudentId, responses, clientMutationId }`.
- `GET /api/submissions/:id`: questões, respostas, notas e revisão da correção.
- `POST /api/submissions/:id/manual-review`: `{ expectedRevision, reviews: [{ questionNumber, awardedPoints, feedback }], clientMutationId }`.
- `POST /api/card-scans/:id/retry`: reprocessa a foto existente quando houver imagem disponível.

O servidor valida a instituição, os limites das notas e o tipo de questão, mantém os pontos objetivos, recalcula a nota total e registra o professor e a revisão no histórico. A revisão de discursivas pode ser parcial no contrato da API; a tela móvel exige preencher todas as discursivas antes de preparar sua operação.

## Verificação em aparelho físico

1. Carregue as listas, desligue a conexão, capture duas folhas e feche/reabra o app. Confira que ambas continuam na lista e conservam o contexto.
2. Religue a conexão. Confira no portal que cada folha criou um único registro e que os resultados chegam ao aplicativo.
3. Use uma folha com marcação em branco ou múltipla. Carregue a revisão, desligue a conexão, confira respostas, salve e religue para sincronizar.
4. Carregue uma avaliação com discursivas. Corrija offline, incluindo uma nota zero e um comentário, feche/reabra e confira rascunho/fila. Sincronize e compare a nota total com o portal.
5. Altere a mesma correção no servidor antes de sincronizar uma nota offline. Confira que o app bloqueia o envio e permite comparar e refazer a operação com a revisão atual.
6. Teste sessão expirada, segundo plano, perda de conexão durante envio e troca de conta. Nenhuma conta deve exibir ou enviar dados de outra.
7. Valide nitidez, reconhecimento do QR e precisão OMR com fotos reais em Android/iOS. Os testes automatizados não medem a precisão do reconhecimento óptico.


## Publicação verificada em 06/10/2026

- Backend e worker OMR publicados no Render a partir de `8b67af76a8e25d7f2849d380496ec3e1c71e8234`.
- `https://ufaprova-api.onrender.com/health` confirmou HTTP 200, a revisão publicada e `mobileSyncSchemaVersion: 1`; a migração 066 foi aplicada ao banco de produção.
- CI do backend passou. Os testes HTTP em produção confirmaram que o login móvel sem `Origin` chega à validação, uma origem de navegador não autorizada continua bloqueada e a sincronização continua exigindo autenticação. Não foram criados alunos nem atribuídas notas de teste em produção.
- A validação óptica, da câmera e do uso offline em aparelho físico permanece pendente. Para Android, use [Expo Go compatível com SDK 58](https://expo.dev/go?sdkVersion=58&platform=android&device=true) e inicie `npx expo start --lan` com computador e celular na mesma rede. O QR da sessão é temporário e não substitui uma versão instalável de produção.

## Contas de aluno e convites de turma

O acesso **Sou aluno** oferece cadastro com e-mail e senha, entrada pelo Google, conferência do código da turma e leitura do QR Code. Cadastros por e-mail precisam de confirmação pelo link recebido; depois o aluno entra no aplicativo.

No portal, o professor abre **Turmas e alunos → Convidar alunos**, seleciona a escola cadastrada e compartilha código/link/QR. A solicitação fica pendente até a confirmação explícita do cadastro pelo responsável. Nenhum cadastro existente é associado automaticamente por nome.

Quem recebeu do professor o código pessoal do aluno (`UFA-XXXXXXXX`) usa **Tenho o código do aluno**: o app mostra nome, escola e turmas do cadastro e, depois de **Sou eu, vincular minha conta**, a conta passa a valer na hora para as turmas desse cadastro, sem aprovação. O código vale para uma única conta; o professor pode desvincular no portal, o que gera um novo código. Rotas: `POST /api/student/access-code/inspect` e `POST /api/student/access-code/claim` (`{ code }`). Um servidor sem essas rotas responde 403 e o app orienta a usar o código da turma.

O aluno vê apenas seus próprios vínculos e atividades das turmas aprovadas. Notas que ainda exigem revisão do professor não são exibidas. A sessão de aluno fica separada do armazenamento offline de correção.

A tela de notas começa em **Minhas disciplinas**, com uma entrada por disciplina, o número de avaliações e a média de acertos. Com uma única disciplina, ela abre direto. Dentro da disciplina aparecem:

- a evolução e as notas por período;
- em cada avaliação, acertos, erros, questões em branco, inválidas e anuladas;
- os indicadores das habilidades da BNCC, com a quantidade de questões consideradas. Abaixo de 3 questões, o app avisa que ainda não há base para conclusões.

Avaliações publicadas abrem **Ver questões e orientações**, com:

- a marcação do aluno e o gabarito, conforme o que o professor liberou;
- a orientação publicada pelo professor.

O aluno só vê resultados autorizados pelo professor. Resultados em correção aparecem sem nota. Não há comparação com colegas. Rotas: `GET /api/student/results/:resultId` e `GET /api/student/skill-performance`; uma API sem elas mantém as notas visíveis.

As notas aparecem em **Notas por período**, agrupadas pela data da aplicação em períodos trimestrais do ano civil (1º período: jan–mar, 2º: abr–jun, 3º: jul–set, 4º: out–dez). Não há calendário escolar cadastrado; aplicações sem data ficam em **Sem data de aplicação**. Cada período mostra a média do percentual de acerto. **Minha evolução** mostra as últimas oito avaliações com nota e compara a média dos dois períodos mais recentes. Notas em revisão manual não entram nas médias. A lista vem de `GET /api/student/activities` e inclui somente resultados de cartões lidos pela câmera ou pelo scanner.

Depois da aprovação, a seção **Meu cadastro** mostra o cadastro vinculado e permite **Adicionar foto** ou **Trocar foto** com a câmera frontal. Ao entrar, se o cadastro ainda não tiver foto, a câmera abre sozinha ("Agora não" fica guardado no aparelho). O app recorta um quadrado em torno do rosto, reduz para JPEG de 320 px (cerca de 20 a 60 KB; a API aceita até 100 KB) e o envia para `POST /api/student/profile` (`{ studentId, selfieDataUrl }`). Antes da aprovação a foto não fica disponível. Se a API ainda não oferecer essa rota, notas e solicitações continuam visíveis.

A API requer as migrações `070_class_invites.sql` e `071_student_accounts_class_links.sql`. As rotas e restrições estão documentadas no portal em `docs/class-invites-api.md`. O leitor aceita convites de `https://ufaprova.com.br`, `https://www.ufaprova.com.br` e `https://ufaprova-frontend.onrender.com`. Para outros endereços, configure `EXPO_PUBLIC_PORTAL_URL` com a lista de origens separadas por vírgula; ela substitui a lista padrão.

## Cadastro de professor e coordenador no aplicativo

Na entrada, use **Criar conta de professor/coordenador**. Escolha o perfil, informe nome, e-mail, CPF, senha e a primeira escola. Professores informam disciplinas e séries; coordenadores selecionam as etapas de ensino. O servidor cria conta, perfil e escola na mesma transação. Confirme o e-mail pelo link recebido e entre no aplicativo. Escolher Coordenador define o perfil profissional; não concede permissões sobre outras escolas nem administração geral.

## Correção de cartões objetivos pelo celular

1. No portal, crie a avaliação e suas versões, matricule os alunos na turma e agende a aplicação em **Turmas e alunos**. Gere e imprima os cartões individuais com QR Code.
2. Entre no app como professor/coordenador, selecione a escola e toque em **Corrigir cartões de respostas**.
3. Escolha uma aplicação já criada. Fotografe o cartão inteiro, com QR e alternativas visíveis, e confirme a foto. A lanterna pode ajudar em locais pouco iluminados.
4. A foto fica salva no aparelho. Com internet, o app envia, acompanha a leitura e mostra a nota; fotos pendentes são retomadas quando a conexão volta.
5. Leituras incompletas, respostas em branco ou marcações duvidosas exigem revisão e confirmação do professor. O resultado definitivo vem do servidor. Depois, use **Capturar próxima folha** para continuar a mesma aplicação.

O envio guarda a aplicação escolhida; o servidor bloqueia QR de outra aplicação antes de gerar nota. A revisão também não pode trocar esse vínculo. Dados de versões anteriores do aplicativo permanecem no aparelho; novas capturas exigem aplicação válida e a atualização da API/worker com `072_mobile_scan_application.sql`.

## Conferência antes da captura

- A lista de aplicações mostra disciplina, turma, número de questões e versões do gabarito.
- Gabarito incompleto aparece em vermelho, com as questões, e desativa **Continuar para captura**. O servidor também recusa o envio (422).
- Além da câmera, **Escolher foto da galeria** aceita cartões já fotografados; a foto passa pela mesma conferência e fila.
- Foto desfocada ou escura não muda a leitura: o cartão vai para revisão, com a orientação de fotografar de novo.
- **Esqueci minha senha** (professor e aluno) envia o link de nova senha ao e-mail.

`expo-image-picker` é um módulo nativo novo: gere uma nova compilação do aplicativo antes de distribuir esta versão.

O relatório de entrega, com critérios de aceite, implantação e pendências, está em `docs/relatorio-entrega.md` no repositório da API.

## Revisão e autorização dos resultados

A correção gera apenas um resultado provisório. O aluno só vê a nota depois
que o professor autoriza o lançamento (API: `docs/resultados-publicacao.md`).

1. Em **Selecione a aplicação da prova**, escolha a aplicação e toque em **Revisar e autorizar resultados**. A tela exige conexão; os resultados não ficam guardados no aparelho.
2. A lista mostra cada aluno com:
   - o estado da leitura e da publicação;
   - acertos, erros, questões em branco, inválidas e anuladas, e o percentual;
   - pendências: leitura duvidosa, discursiva sem nota ou outro cartão do mesmo aluno aguardando decisão;
   - um aviso quando o resultado fica abaixo do mínimo esperado.
3. **Detalhes** mostra, por questão, o que foi lido e o gabarito, além da foto original (carregada com a sessão, sem link público), das alterações e das publicações. Cartões em revisão enviados por este aparelho abrem em **Revisar leitura deste cartão**; os demais devem ser revisados no portal.
4. Selecione os resultados prontos (um por um ou **Selecionar todos os prontos**) e toque em **Autorizar lançamento**. A tela de confirmação lista os alunos afetados. A publicação só acontece em **Confirmar e publicar**.
5. O servidor publica apenas a versão que você conferiu. Se a leitura mudou depois, o item volta como alterado e precisa ser conferido de novo. Repetir o envio após uma falha de conexão não gera outro lançamento.
6. Em **Regras da avaliação**, ajuste:
   - o mínimo esperado;
   - o que o aluno vê em cada questão;
   - as questões anuladas, com a forma de pontuação.

   Alterar anulações recalcula a aplicação inteira e pede confirmação. Os resultados já publicados continuam visíveis na versão anterior até uma nova autorização.
7. Baixo rendimento não impede a publicação. Depois de publicar, a tela informa quantos resultados ficaram abaixo do mínimo esperado, e a lista marca cada um como **justificativa pendente** até haver um registro com motivo.
8. Em **Detalhes** › **Registrar justificativa** (ou **Atualizar acompanhamento**), escolha:
   - os motivos observados, que começam todos desmarcados (**Outro motivo** exige descrição);
   - as ações pedagógicas;
   - uma observação interna, que o aluno nunca vê;
   - uma orientação ao aluno, que ele só vê se você marcar **Publicar orientação ao aluno**.

   Cada atualização cria uma nova entrada; o histórico anterior continua visível no detalhe.

Com a assinatura da instituição inativa, novos envios de fotos aguardam na fila (resposta 402), sem perder a captura.
