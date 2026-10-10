# Gerenciador de Estoque

Aplicação fullstack para gerenciamento de produtos e controle de estoque, desenvolvida com React, Node.js, Express e MongoDB.

O projeto foi criado para aplicar conceitos de desenvolvimento web, APIs REST, autenticação e persistência de dados.

**Acesse o projeto:** [Gerenciador de Estoque — Site Online](https://gerenciador-de-estoque-frontend-kbz.vercel.app/login)

## Tecnologias

**Frontend**
- React
- JavaScript
- Vite
- CSS

**Backend**
- Node.js
- Express
- Prisma ORM
- MongoDB
- JWT
- bcrypt

**Hospedagem**
- Vercel — Frontend
- Render — Backend
- MongoDB Atlas — Banco de dados

## Funcionalidades

- Cadastro e login de usuários
- Autenticação com JWT
- Proteção de rotas
- Cadastro e gerenciamento de produtos
- Operações CRUD
- Controle de estoque
- Integração entre frontend e backend

## Banco de dados

O projeto utiliza MongoDB como banco de dados NoSQL, com Prisma ORM para realizar a comunicação entre a aplicação e o banco.

Os dados são armazenados em coleções, permitindo a persistência de usuários, produtos e demais informações do sistema.

### Configuração do MongoDB

Para executar o projeto localmente, é necessário configurar uma conexão com o MongoDB.

1. Crie uma conta no [MongoDB Atlas](https://www.mongodb.com/atlas).
2. Crie um cluster gratuito.
3. Em **Database Access**, crie um usuário com senha e permissões de acesso ao banco.
4. Em **Network Access**, configure os endereços IP autorizados.
5. Copie a string de conexão fornecida pelo Atlas.
6. Crie um arquivo `.env` na raiz do projeto, utilizando o `.env.example` como referência.

### Configuração de IP

O MongoDB Atlas utiliza uma lista de endereços IP autorizados para controlar quais dispositivos e servidores podem estabelecer conexões com o banco.

Para configurar o acesso:

1. Acesse o painel do MongoDB Atlas.
2. No menu lateral, selecione **Network Access**.
3. Clique em **Add IP Address**.
4. Selecione **Add Current IP Address** para permitir conexões do seu computador.
5. Confirme e aguarde a aplicação da configuração.

Caso utilize uma hospedagem com IP de saída dinâmico, é possível configurar:

```text
0.0.0.0/0
```

Essa configuração permite tentativas de conexão a partir de qualquer endereço IPv4. Utilize-a somente quando necessário, pois amplia a exposição do banco à internet. Prefira autorizar apenas os IPs dos servidores que precisam de acesso.

Mesmo com o IP autorizado, o MongoDB continua exigindo autenticação por meio das credenciais configuradas em **Database Access**.

### String de conexão

No arquivo `.env`, configure a variável `DATABASE_URL`:

```env
DATABASE_URL="mongodb+srv://usuario:senha@cluster.mongodb.net/gerenciador?retryWrites=true&w=majority"
```

Substitua os valores de exemplo pelas credenciais e pelo endereço do seu cluster.

Após configurar a conexão, gere o Prisma Client na raiz do projeto:

```bash
npm run db:generate
```

Esse comando executa o script de geração do Prisma Client definido no `package.json`, preparando o cliente utilizado pelo backend para acessar o banco de dados.

O arquivo `.env` contém informações sensíveis e não deve ser enviado ao GitHub.

## Estrutura do projeto

```text
├── frontend/
├── controllers/
├── routes/
├── middlewares/
├── services/
├── prisma/
├── lib/
├── scripts/
├── tests/
├── .env.example
└── README.md
```

## Instalação

Clone o repositório:

```bash
git clone https://github.com/fillipecostaa/gerenciador-de-estoque.git
cd gerenciador-de-estoque
```

Instale as dependências do backend:

```bash
npm install
```

Instale as dependências do frontend:

```bash
cd frontend
npm install
cd ..
```

Configure as variáveis de ambiente utilizando o `.env.example` como referência e seguindo as instruções da seção de banco de dados.

Gere o Prisma Client:

```bash
npm run db:generate
```

Para iniciar o frontend:

```bash
cd frontend
npm run dev
```

O backend deve ser iniciado conforme os scripts definidos no `package.json` da raiz.

## Autor

[Fillipe Costa](https://github.com/fillipecostaa)
