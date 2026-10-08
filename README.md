# Acesso

Páginas de login e cadastro em React, Vite e CSS, conectadas à API existente em Express, Prisma e MongoDB.

## Executar

Use Node.js 22.12+ ou 24+. Na pasta `loginscreen`:

```sh
npm install
npx prisma generate
npm run dev
```

Abra **http://localhost:5173**. O comando inicia o React e a API juntos, com atualização automática.

O backend precisa de `DATABASE_URL` e `JWT_SECRET` no arquivo `.env`. Se ainda não tiver esse arquivo, copie `.env.example` para `.env` e preencha os valores. Preserve seu `.env` existente. O banco MongoDB deve estar acessível e preparado com o modelo de `prisma/schema.prisma`.

## Páginas e integração

- `/login`: e-mail e senha; mostra confirmação após autenticar e permite sair.
- `/cadastro`: nome, e-mail, senha e confirmação. Após cadastrar, redireciona ao login com o e-mail preenchido.
- O frontend envia `POST /api/login` e `POST /api/cadastro`. O proxy do Vite encaminha essas chamadas ao Express na porta `5000` (ou `PORT` do `.env`), sem necessidade de CORS.
- As rotas originais `POST /login`, `POST /cadastro` e `GET /listar-usuarios` continuam disponíveis. As mesmas rotas também podem ser acessadas sob `/api`.
- O login mantém o contrato da API: retorna o JWT como string JSON. O token fica apenas no estado do React enquanto a aplicação está aberta; sair ou recarregar encerra essa sessão local. Para adicionar chamadas protegidas, envie `Authorization: Bearer <token>` com o token recebido. A tela de sucesso não é uma área protegida com dados do usuário.
- O cadastro exige senha com no mínimo 6 caracteres e no máximo 72 bytes (limite do bcrypt). Verifica o e-mail, gera o hash e cria sempre `USER`, ignorando `role` recebido do cliente. Retorna HTTP 201 com `id`, `name`, `email`, `role` e `active`, sem senha/hash; e-mail duplicado retorna 409. O índice único também protege cadastros simultâneos.

`JWT_SECRET` e `DATABASE_URL` são exclusivos do servidor; nunca use o prefixo `VITE_` para essas variáveis.

## Versão compilada

```sh
npm run build
npm start
```

Abra **http://localhost:5000** (ou a porta definida em `PORT`). O Express serve o frontend compilado, inclusive ao abrir diretamente `/login` ou `/cadastro`.

## Verificação

```sh
npx playwright install chromium
npm test
```

Os testes de navegador cobrem cadastro, confirmação de senha, login, saída, mensagens de erro, bloqueio durante o envio e navegação em tela pequena. As respostas da API são simuladas nesses testes: eles não criam usuários nem validam a conexão com o MongoDB.

## Reinicialização da API no desenvolvimento

`npm run dev:server` observa somente `server.js`, `app.js`, `routes/`, `controllers/`, `services/`, `middlewares/`, `lib/` e `.env`. Assim, alterações nesses caminhos reiniciam a API; arquivos de dependências em `node_modules` ficam fora da observação. Depois de instalar dependências ou gerar novamente o Prisma Client, reinicie o comando manualmente.

O script usa [`--watch-path` do Node.js](https://nodejs.org/api/cli.html#--watch-path), que desativa a descoberta automática de módulos importados e é compatível com Windows e macOS. No Linux, execute `npm start` para a API e `npm run dev:client` em outro terminal; reinicie a API manualmente ao editar os arquivos. O frontend continua com a atualização automática do Vite.

## Diagnosticar a conexão com o MongoDB

```sh
npm run db:check
```

Esse comando executa uma consulta Prisma somente leitura à coleção `User`. Em caso de falha, mostra `code`, `message` e `meta` no terminal, ocultando a URI e segredos. Não altera usuários, índices ou coleções. Para o mesmo diagnóstico durante requisições à API, ative temporariamente `PRISMA_DEBUG_ERRORS=1` no `.env` e depois volte para `0`. Os detalhes não são enviados ao navegador e o log detalhado da API fica desabilitado em produção.

`P2010` por si só não identifica a causa. Se os detalhes contiverem `Server selection timeout`, `ReplicaSetNoPrimary` e `received fatal alert: InternalError`, a negociação TLS com os servidores falhou antes da consulta. Isso também pode acontecer com uma chamada normal como `user.findUnique`; a palavra "Raw" na mensagem não implica uma query raw escrita no serviço.

Confira no Atlas se o cluster está ativo e se o IP público atual da máquina está autorizado em **Network Access**, preferindo a entrada específica desse IP. Verifique também a saída da rede para os hosts do cluster na porta 27017. Essas verificações seguem a [documentação de conexão do Atlas](https://www.mongodb.com/docs/atlas/troubleshoot-connection/). Se o TLS continuar falhando com o IP autorizado, verifique a rede/firewall e o estado do cluster; essa mensagem isolada não comprova qual deles está bloqueando a conexão. Repita `npm run db:check` após corrigir o acesso.

`npm run test:backend` inclui testes HTTP de cadastro → usuário USER salvo com bcrypt → login → JWT → rotas de USER e bloqueio de rotas ADMIN, além dos testes de integridade de estoque. Eles usam uma réplica MongoDB local e descartável, sem acessar o banco do `.env`. Na primeira execução, o binário do MongoDB pode precisar ser baixado. Os testes locais não comprovam a conectividade com seu Atlas.
