# Registro de Pacientes - v2.0

<div align="center">

![Desktop Preview](src/assets/images/image.gif)

![Electron](https://img.shields.io/badge/Electron-47848F?style=for-the-badge&logo=electron&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)

[![rodrigodev.net](https://img.shields.io/badge/rodrigodev.net-green?style=for-the-badge)](https://www.rodrigodev.net/)
[![GitHub](https://img.shields.io/badge/GitHub-100000?style=for-the-badge&logo=github&logoColor=white)](https://github.com/Rodrigogfernandes)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/rodrigogfernandes/)
[![Instagram](https://img.shields.io/badge/Instagram-E4405F?style=for-the-badge&logo=instagram&logoColor=white)](https://www.instagram.com/rodrigogfernandes1/)

</div>

## Sobre o Projeto

Aplicacao desktop em Electron para gestao de:

- agendamento de exames
- registros de pacientes e exames
- livro de ocorrencias
- controle de ponto
- autenticacao por usuario e permissao por perfil

O sistema opera com MongoDB (Atlas ou local), possui modo offline com JSON local e recursos de apoio operacional como auditoria, backup automatico, dashboard administrativo, chat interno e portal do cliente.

## Funcionalidades

### Nucleo do sistema

- Cadastro e edicao de pacientes com CPF e prontuario.
- Geracao automatica de prontuario e numero de acesso.
- Validacao de duplicidade por CPF, prontuario e conflitos de identidade.
- Exportacao de dados em PDF, Excel, TXT e JSON.
- Importacao de backup e restauracao de dados.
- Modo offline com `data/*.json` quando o banco estiver indisponivel.
- Sincronizacao automatica do JSON local para MongoDB quando a conexao retorna.

### Autenticacao e perfis

- Login por usuario com perfis `admin`, `recepcao` e `tecnico`.
- Controle de acesso por modulo e por acao IPC.
- Gestao de usuarios pela tela inicial.
- Presenca de usuarios online.
- Politica de senha com bloqueio apos tentativas invalidas.

### Registros

- Auto preenchimento do paciente por CPF ou prontuario.
- Filtros avancados com salvamento de filtros personalizados.
- Paginacao responsiva com "carregar mais".
- Timeline/historico do paciente entre Agendamento e Registros.
- Grafico por modalidade e ano com exportacao em PDF.
- Exportacao dos registros filtrados em multiplos formatos.

### Ocorrencias

- Cadastro, edicao e exclusao de ocorrencias com prioridade e status.
- Calculo automatico de prazo e SLA.
- Indicacao de ocorrencias "No prazo", "Vence hoje" e "Atrasada".
- Filtro inicial por pendencia via URL.
- Ordenacao por colunas e pesquisa textual.
- Edicao rapida de observacoes por duplo clique.

### Ponto

- Cadastro de funcionarios com carga horaria, valor/hora e multiplicador de hora extra.
- Registro de ponto por turno, meio periodo, integral ou horario especial.
- Calculo automatico de horas trabalhadas, horas extras e valor diario.
- Exportacao de folha de ponto por funcionario ou em lote por mes.
- Controles diferentes para administrador e funcionario.

### Operacao e administracao

- Dashboard administrativo com resumo operacional e alertas.
- Backup automatico com preview e restauracao.
- Auditoria de acoes com filtros e exportacao CSV/JSON.
- Chat interno entre usuarios com anexos.
- Portal do cliente com acesso web para consultas e interacao.
- Melhorias de acessibilidade em modais: `focus trap`, fechamento com `ESC` e suporte a teclado.

## Tecnologias Utilizadas

### Aplicacao

- Electron
- Node.js
- JavaScript (ES6+)

### Banco e persistencia

- MongoDB Driver (`mongodb`)
- dotenv
- JSON local (`data/*.json`) como fallback offline

### Interface e utilitarios

- Chart.js
- jsPDF
- jsPDF AutoTable
- PDFKit
- xlsx
- xlsx-js-style
- electron-store
- Express

## Estrutura do Projeto

```text
Registro-de-Pacientes/
|
|-- main.js
|-- preload.js
|-- client-portal-standalone.js
|-- scripts/
|   |-- start-electron.js
|   `-- run-electron-builder.js
|-- src/
|   |-- pages/
|   |   |-- index.html
|   |   |-- auth/login.html
|   |   |-- agendamento/agendamento.html
|   |   |-- registros/registros.html
|   |   |-- ocorrencias/ocorrencias.html
|   |   `-- ponto/ponto.html
|   |-- scripts/
|   |   |-- index/index.js
|   |   |-- auth/login.js
|   |   |-- agendamento/agendamento.js
|   |   |-- registros/registros.js
|   |   |-- ocorrencias/ocorrencias.js
|   |   |-- ponto/ponto.js
|   |   |-- shared/modalAccessibility.js
|   |   `-- clientPortalServer.js
|   |-- styles/
|   |-- web-client/
|   `-- assets/images/
`-- data/
    |-- pacientes.json
    |-- registros.json
    |-- agendamentos.json
    |-- medicos_agenda.json
    |-- ocorrencias.json
    |-- ponto.json
    |-- chat_messages.json
    |-- config.json
    `-- backups/
```

## Como Usar

### Pre-requisitos

- Node.js 20+
- npm
- MongoDB Atlas ou MongoDB local

### Instalacao

1. Clone o repositorio

```bash
git clone https://github.com/Rodrigogfernandes/Registro-de-Pacientes.git
```

2. Entre na pasta

```bash
cd Registro-de-Pacientes
```

3. Instale as dependencias

```bash
npm install
```

4. Configure o `.env`

```env
MONGODB_URI=mongodb+srv://usuario:senha@cluster.mongodb.net/?appName=RegistroDePacientes
MONGODB_DB=RegistroDePacientes
CLIENT_PORTAL_HOST=0.0.0.0
CLIENT_PORTAL_PORT=3210
```

### Executar a aplicacao desktop

```bash
npm start
```

### Executar o portal do cliente

```bash
npm run client-portal
```

Portal padrao:

```text
http://127.0.0.1:3210/cliente/
```

### Build (Windows)

```bash
npm run build
```

## Perfis de acesso

- `admin`: acesso total, dashboard, auditoria, backups e gestao de usuarios.
- `recepcao`: acesso a agendamento, registros, ocorrencias e ponto.
- `tecnico`: acesso a registros, ocorrencias e ponto.

## Persistencia Online/Offline

- Online: le e grava no MongoDB.
- Offline: salva e le em `data/*.json`.
- Reconexao: sincroniza automaticamente dados pendentes do JSON local para o banco.
- Versionamento de dados: alguns modulos validam conflitos de edicao antes de salvar.

## Regras de duplicidade

- Pacientes: bloqueio por CPF ou prontuario duplicado.
- Registros: bloqueio de conflito de identidade:
  - mesmo prontuario com CPF diferente
  - mesmo CPF com prontuario diferente
- Validacao considera dados do MongoDB e do backup local.

## Troubleshooting

### Erro SSL/TLS no MongoDB Atlas

Se ocorrer `MongoServerSelectionError` com `TLSV1_ALERT_INTERNAL_ERROR`:

1. Libere seu IP em `Atlas > Network Access`.
2. Verifique credenciais em `Atlas > Database Access`.
3. Teste em outra rede (VPN/proxy/antivirus podem interferir).
4. Teste com `mongosh` para isolar problema de rede:

```bash
mongosh "mongodb+srv://<usuario>:<senha>@<cluster>.mongodb.net/<db>?appName=RegistroDePacientes"
```

### `mongosh` nao reconhecido

No PowerShell:

```powershell
mongosh --version
```

Se nao reconhecer, ajuste o `PATH` para a pasta de instalacao do `mongosh`.

### Push rejeitado pelo GitHub por arquivos grandes

Nao envie a pasta `dist/` para o repositorio. Os instaladores e arquivos gerados pelo Electron Builder podem ultrapassar o limite de 100 MB do GitHub.

Garanta que `dist/` esteja no `.gitignore` e publique apenas o codigo-fonte.

## Contribuindo

1. Faca um fork do projeto.
2. Crie uma branch para sua feature (`git checkout -b feature/minha-feature`).
3. Commit suas alteracoes (`git commit -m "feat: minha feature"`).
4. Push para a branch (`git push origin feature/minha-feature`).
5. Abra um Pull Request.

## Licenca

ISC

## Contato

**Rodrigo G Fernandes**

- Telefone: [+55 (83) 99925-1636](tel:+5583999251636)
- Email: [rodrigo.guedes.f@gmail.com](mailto:rodrigo.guedes.f@gmail.com)
- Localizacao: Joao Pessoa - PB, Brasil
- Site: [rodrigodev.net](https://www.rodrigodev.net/)
- LinkedIn: [rodrigogfernandes](https://www.linkedin.com/in/rodrigogfernandes/)
- GitHub: [Rodrigogfernandes](https://github.com/Rodrigogfernandes)
- Instagram: [@rodrigogfernandes1](https://www.instagram.com/rodrigogfernandes1/)

---

<div align="center">

Desenvolvido por Rodrigo G Fernandes

</div>
