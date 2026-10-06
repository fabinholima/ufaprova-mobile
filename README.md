# UFA Prova Mobile

Primeiro MVP do aplicativo de correção, separado do frontend web.

## Fases

1. Autenticação do professor e seleção da escola.
2. Lista de avaliações e turmas vindas da API.
3. Captura da folha de respostas com `expo-camera`.
4. Leitura OMR e envio do resultado para a API.
5. Correção manual de questões discursivas e sincronização offline.

## Desenvolvimento

```bash
cd mobile
npm install
npx expo start
```

O `App.tsx` atual é apenas a tela inicial navegável do MVP. A integração da câmera e dos endpoints será adicionada na próxima etapa.
