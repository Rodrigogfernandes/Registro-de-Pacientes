# Registro de Pacientes v2.0

Aplicacao desktop em Electron para gestao de:
- Agendamento de exames
- Registros de pacientes/exames
- Livro de ocorrencias
- Controle de ponto

## Tecnologias
- Electron
- Node.js
- JavaScript (ES6+)
- HTML5 + CSS3
- Chart.js
- jsPDF
- xlsx

## Modulos

### 1. Agendamento (`src/pages/agendamento/agendamento.html`)
- Cadastro e edicao de agendamentos.
- Busca de paciente por CPF ou prontuario.
- Ao selecionar paciente na busca, abrir "Novo Agendamento" preenche dados pessoais automaticamente.
- Geracao automatica e sequencial de:
  - `prontuarioPaciente` (nao repete)
  - `numeroAcesso` (nao repete)
- Separacao de CPF e prontuario (campos e validacoes independentes).
- Validacao de duplicidade ao criar novo paciente:
  - bloqueia duplicidade por CPF, prontuario ou numero de acesso.
- Alteracao de status diretamente na coluna de status da tabela.
- Correcao de duplicidade ao mudar status de Agendado para Realizado.
- Integracao com registros:
  - itens vindos de `Registros` podem ser vistos, editados, excluidos e ter status alterado no Agendamento.
- Historico do paciente (modal) combinando dados de Agendamento e Registros.
- Impressao de espelho:
  - coluna final com icone de impressora (`🖨️`)
  - selecao de exames pendentes por paciente
  - impressao com dados do paciente + exames selecionados.
- Confirmacoes e avisos por modal (sem `alert`/`confirm` nativo nas acoes principais).

### 2. Registros (`src/pages/registros/registros.html`)
- Cadastro/edicao de exames realizados.
- Cadastro de paciente com CPF e prontuario separados.
- Geracao automatica de prontuario e numero de acesso para novos registros.
- Modal de confirmacao de exclusao (substituindo fluxo antigo).
- Historico do paciente por modal.
- Layout do historico alinhado ao padrao da pagina de Agendamento.
- Ajustes de contraste e legibilidade no tema escuro.
- Exportacao (TXT, PDF, Excel, backup) e importacao com opcoes de substituicao/adicao.

### 3. Ocorrencias (`src/pages/ocorrencias/ocorrencias.html`)
- Registro, busca, filtros e ordenacao de ocorrencias.
- Exportacao/importacao.

### 4. Ponto (`src/pages/ponto/ponto.html`)
- Cadastro de funcionarios.
- Registro de ponto por turno.
- Relatorios e folha de ponto.

### 5. Pagina inicial (`src/pages/index.html`)
- Navegacao para todos os modulos.
- Configuracoes de tema.
- Exportacao/importacao centralizadas.
- Estrutura separada em HTML/CSS/JS seguindo o padrao das outras paginas.

## Temas
- Claro
- Escuro
- Azul

O tema e aplicado globalmente via variaveis CSS em `src/styles/common.css`.

## Estrutura principal
```txt
src/
  pages/
    index.html
    agendamento/agendamento.html
    registros/registros.html
    ocorrencias/ocorrencias.html
    ponto/ponto.html
  scripts/
    index/index.js
    agendamento/agendamento.js
    registros/registros.js
    ocorrencias/ocorrencias.js
    ponto/ponto.js
  styles/
    common.css
    index.css
    agendamento.css
    registros.css
    ocorrencias.css
    ponto.css
```

## Como executar

### Requisitos
- Node.js 18+
- npm

### Instalacao
```bash
npm install
```

### Desenvolvimento
```bash
npm start
```

### Build
```bash
npm run build
```

### Outros comandos
```bash
npm run clean
npm run pack
```

## Dados e persistencia
- Persistencia local via IPC/Electron.
- Entidades principais:
  - Pacientes
  - Agendamentos
  - Registros
  - Ocorrencias
  - Ponto

## Licenca
ISC
