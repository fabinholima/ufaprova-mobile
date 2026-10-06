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

Configure `EXPO_PUBLIC_API_URL` para usar outra API. O projeto usa Expo SDK 54. Use uma versão compatível do Expo Go ou uma compilação de desenvolvimento. Permissões alteradas em `app.json` exigem recompilar o aplicativo instalado.

Os testes de armazenamento usam `node:sqlite` (Node 22.13+). Na pasta `../caderno-bncc-atualizado/services/api`, execute `node --test` para os testes de API. Para a integração transacional, configure `MOBILE_SYNC_TEST_DATABASE_URL` apontando para um PostgreSQL de teste e execute `node --test mobile-sync.integration.test.mjs`; o teste cria e remove seu próprio schema.

As telas e módulos nativos são simulados; o contrato HTTP é exercitado com servidor local, e os testes do backend usam PostgreSQL isolado.

## Uso offline

Entre com internet pelo menos uma vez e carregue escolas, avaliações e turmas. O app mantém a última conta no SecureStore e as listas no [Expo SQLite](https://docs.expo.dev/versions/v54.0.0/sdk/sqlite/), separadas por URL da API, professor e instituição.

Ao tocar em **Usar esta foto**, a imagem é preparada e salva no SQLite com escola, avaliação e turma. O JPEG conserva a página inteira, limita o lado maior a 2600 pixels e usa qualidade de 90%. Ele não depende do arquivo temporário da câmera. O limite de envio continua sendo 8 milhões de caracteres no data URL, incluindo o prefixo.

As digitalizações aparecem na lista mesmo depois de fechar e abrir o aplicativo. Você pode capturar várias folhas sem internet. Quando houver conexão, a fila envia as fotos e busca os resultados do servidor. O acompanhamento pausa em segundo plano e retoma com o app aberto. Não há promessa de envio com o aplicativo encerrado.

Para revisar marcações offline, carregue primeiro o resultado da leitura. Confira aluno, versão e alternativas e use **Salvar revisão para sincronizar**. A identificação usa os IDs de avaliação e turma retornados pela API atualizada. Nomes iguais não misturam contextos. A escola é preservada localmente; a API ainda lista avaliações e turmas por instituição, sem filtro por escola.

Para corrigir discursivas offline, carregue primeiro a correção e as questões. Informe a nota de cada questão, entre zero e o valor máximo, com até duas casas decimais. Zero precisa ser informado explicitamente; um campo vazio permanece sem nota. Os comentários são opcionais. Consulte a resposta transcrita quando disponível ou a prova física/foto do aluno; o cartão de alternativas não contém as respostas discursivas. O enunciado e a orientação de correção são os do snapshot da avaliação, sem gerar uma resposta esperada artificialmente.

Notas e comentários são salvos como rascunho a cada alteração. Depois de conferir aluno e notas, use **Salvar correção para sincronizar**. O resultado continua marcado como parcial até a confirmação do servidor. A fila preserva as notas enquanto aguardam envio e desabilita alterações nessa operação já preparada.

## Sincronização e conflitos

A sincronização usa [NetInfo](https://docs.expo.dev/versions/v54.0.0/sdk/netinfo/) e o estado do aplicativo. Com conexão e app em primeiro plano, verifica os trabalhos pendentes a cada 10 segundos. Também pode ser acionada por **Sincronizar agora**. Falhas transitórias recebem novas tentativas com atraso crescente, de 5 segundos a 5 minutos. Consultas e operações da fila nunca usam o token de outra conta; identidade e token são lidos juntos do SecureStore. A conta é vinculada à instituição confirmada por `/api/auth/me`, e o servidor verifica a instituição esperada em cada envio.

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
- A validação óptica, da câmera e do uso offline em aparelho físico permanece pendente. Para Android, use [Expo Go compatível com SDK 54](https://expo.dev/go?sdkVersion=54&platform=android&device=true) e inicie `npx expo start --lan` com computador e celular na mesma rede. O QR da sessão é temporário e não substitui uma versão instalável de produção.
