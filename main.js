const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const { MongoClient } = require('mongodb');
const marked = require('marked');
const PDFDocument = require('pdfkit');
const XLSX = require('xlsx-js-style'); // Altere esta linha

let mainWindow;
let helpWindow;
let mongoClient;
let mongoDb;

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const MONGO_DB_NAME = process.env.MONGODB_DB || 'registro_pacientes';
const APP_DATA_COLLECTION = 'app_data';
const DATA_TYPES = ['registros', 'pacientes', 'agendamentos', 'medicos-agenda', 'ocorrencias', 'ponto', 'config'];
const MONGO_RECONNECT_INTERVAL_MS = 15000;

let mongoOnline = false;
let needsLocalSync = false;
let reconnectTimer = null;
let reconnectInProgress = false;

// Adicionar nova funÃƒÂ§ÃƒÂ£o para gerenciar caminhos de arquivos
function getDataFilePath(tipo) {
    const dataDir = path.join(__dirname, 'data');
    switch(tipo) {
        case 'registros':
            return path.join(dataDir, 'registros.json');
        case 'agendamentos':
            return path.join(dataDir, 'agendamentos.json');
        case 'medicos-agenda':
            return path.join(dataDir, 'medicos_agenda.json');
        case 'ocorrencias':
            return path.join(dataDir, 'ocorrencias.json');
        case 'ponto':
            return path.join(dataDir, 'ponto.json');
        case 'config':
            return path.join(dataDir, 'config.json');
        case 'pacientes':
            return path.join(dataDir, 'pacientes.json');
        default:
            return path.join(dataDir, 'registros.json');
    }
}

function getDefaultValue(tipo) {
    if (tipo === 'ponto') {
        return { funcionarios: [], registros: [] };
    }
    if (tipo === 'config') {
        return {};
    }
    return [];
}

function cloneDefaultValue(tipo) {
    const value = getDefaultValue(tipo);
    return JSON.parse(JSON.stringify(value));
}

function parseJsonSafe(raw, fallbackValue) {
    try {
        return JSON.parse((raw || '').replace(/^\uFEFF/, ''));
    } catch (error) {
        return fallbackValue;
    }
}

function lerDoArquivoLocal(tipo) {
    const filePath = getDataFilePath(tipo);
    const fallback = cloneDefaultValue(tipo);

    if (!fs.existsSync(filePath)) {
        return fallback;
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    return parseJsonSafe(raw, fallback);
}

function salvarNoArquivoLocal(tipo, payload) {
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    const filePath = getDataFilePath(tipo);
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

async function connectMongo() {
    if (mongoDb) {
        return mongoDb;
    }

    if (mongoClient) {
        try {
            await mongoClient.close();
        } catch (error) {
            console.warn('Falha ao fechar cliente MongoDB anterior:', error.message);
        }
    }

    mongoClient = new MongoClient(MONGO_URI, {
        serverSelectionTimeoutMS: 5000
    });

    await mongoClient.connect();
    mongoDb = mongoClient.db(MONGO_DB_NAME);
    mongoOnline = true;
    return mongoDb;
}

function getCollection() {
    if (!mongoDb) {
        throw new Error('MongoDB nao inicializado');
    }
    return mongoDb.collection(APP_DATA_COLLECTION);
}

async function lerDoBanco(tipo) {
    const collection = getCollection();
    const doc = await collection.findOne({ _id: tipo });
    if (!doc || doc.payload === undefined || doc.payload === null) {
        return cloneDefaultValue(tipo);
    }
    return doc.payload;
}

async function salvarNoBanco(tipo, payload) {
    const collection = getCollection();
    await collection.updateOne(
        { _id: tipo },
        {
            $set: {
                payload,
                updatedAt: new Date()
            },
            $setOnInsert: {
                createdAt: new Date()
            }
        },
        { upsert: true }
    );
}

function marcarMongoOffline(contexto, error) {
    if (mongoOnline) {
        console.warn(`MongoDB offline (${contexto}):`, error.message);
    }
    mongoOnline = false;
    mongoDb = null;
}

async function sincronizarLocalParaMongo() {
    for (const tipo of DATA_TYPES) {
        const payload = lerDoArquivoLocal(tipo);
        await salvarNoBanco(tipo, payload);
    }
    needsLocalSync = false;
}

async function migrarJsonLegadoParaMongo() {
    const collection = getCollection();

    for (const tipo of DATA_TYPES) {
        const existe = await collection.findOne({ _id: tipo }, { projection: { _id: 1 } });
        if (existe) {
            continue;
        }

        const payload = lerDoArquivoLocal(tipo);

        await salvarNoBanco(tipo, payload);
    }
}

async function lerDados(tipo) {
    if (mongoOnline) {
        try {
            const payload = await lerDoBanco(tipo);
            salvarNoArquivoLocal(tipo, payload);
            return payload;
        } catch (error) {
            marcarMongoOffline(`leitura de ${tipo}`, error);
        }
    }

    return lerDoArquivoLocal(tipo);
}

async function salvarDados(tipo, payload) {
    salvarNoArquivoLocal(tipo, payload);

    if (mongoOnline) {
        try {
            await salvarNoBanco(tipo, payload);
            return;
        } catch (error) {
            needsLocalSync = true;
            marcarMongoOffline(`gravacao de ${tipo}`, error);
            return;
        }
    }

    needsLocalSync = true;
}

async function manterConexaoMongo() {
    if (reconnectInProgress) {
        return;
    }

    reconnectInProgress = true;
    try {
        if (mongoOnline && mongoDb) {
            await mongoDb.command({ ping: 1 });
            return;
        }

        await connectMongo();
        console.log('MongoDB reconectado.');
        await migrarJsonLegadoParaMongo();

        if (needsLocalSync) {
            await sincronizarLocalParaMongo();
            console.log('Sincronizacao local -> MongoDB concluida.');
        }
    } catch (error) {
        marcarMongoOffline('reconexao automatica', error);
    } finally {
        reconnectInProgress = false;
    }
}

function iniciarLoopReconexaoMongo() {
    if (reconnectTimer) {
        return;
    }

    reconnectTimer = setInterval(() => {
        manterConexaoMongo().catch((error) => {
            console.error('Erro no loop de reconexao MongoDB:', error);
        });
    }, MONGO_RECONNECT_INTERVAL_MS);
}

async function inicializarPersistencia() {
    try {
        await connectMongo();
        await migrarJsonLegadoParaMongo();
        mongoOnline = true;
        return true;
    } catch (error) {
        marcarMongoOffline('inicializacao', error);
        needsLocalSync = true;
        return false;
    } finally {
        iniciarLoopReconexaoMongo();
    }
}

function cpfSomenteDigitos(valor) {
    return String(valor || '').replace(/\D/g, '');
}

function normalizarProntuario(valor) {
    return String(valor || '').trim().toUpperCase();
}

function extrairIdentificadoresPaciente(item) {
    const prontuario = normalizarProntuario(item?.prontuarioPaciente || item?.documentoPaciente || '');
    const cpf = cpfSomenteDigitos(item?.cpfPaciente || '');
    return { prontuario, cpf };
}

function extrairIdentificadoresRegistro(item) {
    const prontuario = normalizarProntuario(item?.prontuarioPaciente || item?.documentoPaciente || item?.pacienteDocumento || '');
    const cpf = cpfSomenteDigitos(item?.cpfPaciente || '');
    return { prontuario, cpf };
}

function identificarPaciente(item) {
    const { prontuario, cpf } = extrairIdentificadoresPaciente(item);
    if (prontuario) {
        return `prontuario:${prontuario}`;
    }
    if (cpf) {
        return `cpf:${cpf}`;
    }

    const id = item?.id !== undefined && item?.id !== null ? String(item.id) : '';
    if (id) {
        return `id:${id}`;
    }
    return '';
}

function validarDuplicidadePacientes(pacientes) {
    if (!Array.isArray(pacientes)) {
        throw new Error('Dados de pacientes invalidos.');
    }

    const porProntuario = new Map();
    const porCpf = new Map();

    for (let i = 0; i < pacientes.length; i += 1) {
        const paciente = pacientes[i];
        const { prontuario, cpf } = extrairIdentificadoresPaciente(paciente);
        const chavePaciente = identificarPaciente(paciente) || `anon:${i}`;

        if (prontuario) {
            const dono = porProntuario.get(prontuario);
            if (dono && dono !== chavePaciente) {
                throw new Error(`Duplicidade de paciente: prontuario ${prontuario} ja cadastrado.`);
            }
            porProntuario.set(prontuario, chavePaciente);
        }

        if (cpf) {
            const dono = porCpf.get(cpf);
            if (dono && dono !== chavePaciente) {
                throw new Error(`Duplicidade de paciente: CPF ${cpf} ja cadastrado.`);
            }
            porCpf.set(cpf, chavePaciente);
        }
    }
}

function validarDuplicidadeRegistros(registros) {
    if (!Array.isArray(registros)) {
        throw new Error('Dados de registros invalidos.');
    }

    const cpfPorProntuario = new Map();
    const prontuarioPorCpf = new Map();

    for (const registro of registros) {
        const { prontuario, cpf } = extrairIdentificadoresRegistro(registro);

        if (prontuario && cpf) {
            const cpfConhecido = cpfPorProntuario.get(prontuario);
            if (cpfConhecido && cpfConhecido !== cpf) {
                throw new Error(`Conflito de dados: prontuario ${prontuario} vinculado a CPF diferente.`);
            }
            cpfPorProntuario.set(prontuario, cpf);

            const prontuarioConhecido = prontuarioPorCpf.get(cpf);
            if (prontuarioConhecido && prontuarioConhecido !== prontuario) {
                throw new Error(`Conflito de dados: CPF ${cpf} vinculado a prontuario diferente.`);
            }
            prontuarioPorCpf.set(cpf, prontuario);
        }
    }
}

async function obterPacientesMongoOuVazio() {
    if (!mongoOnline) {
        return [];
    }

    try {
        const pacientes = await lerDoBanco('pacientes');
        return Array.isArray(pacientes) ? pacientes : [];
    } catch (error) {
        marcarMongoOffline('validacao de duplicidade', error);
        return [];
    }
}

async function validarDuplicidadeGlobalPacientes(pacientesEntrada, registrosEntrada = null) {
    const pacientesLocal = lerDoArquivoLocal('pacientes');
    const pacientesMongo = await obterPacientesMongoOuVazio();
    const pacientesBase = [
        ...pacientesLocal,
        ...pacientesMongo,
        ...(Array.isArray(pacientesEntrada) ? pacientesEntrada : [])
    ];

    if (Array.isArray(registrosEntrada)) {
        for (const registro of registrosEntrada) {
            const { prontuario, cpf } = extrairIdentificadoresRegistro(registro);
            if (!prontuario && !cpf) {
                continue;
            }

            pacientesBase.push({
                id: '',
                prontuarioPaciente: prontuario,
                cpfPaciente: cpf,
                documentoPaciente: prontuario
            });
        }
    }

    validarDuplicidadePacientes(pacientesBase);
}

function setupIpcHandlers() {
    ipcMain.handle('ler-registros', async () => {
        try {
            return await lerDados('registros');
        } catch (error) {
            console.error('Erro ao ler registros:', error);
            dialog.showErrorBox('Erro', 'Nao foi possivel ler os registros: ' + error.message);
            return [];
        }
    });
    ipcMain.handle('salvar-registros', async (event, registros) => {
        try {
            validarDuplicidadeRegistros(registros);
            await validarDuplicidadeGlobalPacientes(null, registros);
            await salvarDados('registros', registros);
            return true;
        } catch (error) {
            console.error('Erro ao salvar registros:', error);
            dialog.showErrorBox('Erro', 'Nao foi possivel salvar os registros: ' + error.message);
            return false;
        }
    });
    ipcMain.handle('ler-pacientes', async () => {
        try {
            return await lerDados('pacientes');
        } catch (error) {
            console.error('Erro ao ler pacientes:', error);
            dialog.showErrorBox('Erro', 'Nao foi possivel ler os pacientes: ' + error.message);
            return [];
        }
    });
    ipcMain.handle('salvar-pacientes', async (event, pacientes) => {
        try {
            await validarDuplicidadeGlobalPacientes(pacientes);
            await salvarDados('pacientes', pacientes);
            return true;
        } catch (error) {
            console.error('Erro ao salvar pacientes:', error);
            dialog.showErrorBox('Erro', 'Nao foi possivel salvar os pacientes: ' + error.message);
            return false;
        }
    });
    ipcMain.handle('ler-agendamentos', async () => {
        try {
            return await lerDados('agendamentos');
        } catch (error) {
            console.error('Erro ao ler agendamentos:', error);
            dialog.showErrorBox('Erro', 'Nao foi possivel ler os agendamentos: ' + error.message);
            return [];
        }
    });
    ipcMain.handle('salvar-agendamentos', async (event, agendamentos) => {
        try {
            await salvarDados('agendamentos', agendamentos);
            return true;
        } catch (error) {
            console.error('Erro ao salvar agendamentos:', error);
            dialog.showErrorBox('Erro', 'Nao foi possivel salvar os agendamentos: ' + error.message);
            return false;
        }
    });
    ipcMain.handle('ler-medicos-agenda', async () => {
        try {
            return await lerDados('medicos-agenda');
        } catch (error) {
            console.error('Erro ao ler agendas medicas:', error);
            dialog.showErrorBox('Erro', 'Nao foi possivel ler as agendas medicas: ' + error.message);
            return [];
        }
    });
    ipcMain.handle('salvar-medicos-agenda', async (event, medicosAgenda) => {
        try {
            await salvarDados('medicos-agenda', medicosAgenda);
            return true;
        } catch (error) {
            console.error('Erro ao salvar agendas medicas:', error);
            dialog.showErrorBox('Erro', 'Nao foi possivel salvar as agendas medicas: ' + error.message);
            return false;
        }
    });
    ipcMain.handle('salvar-arquivo', async (event, {conteudo, tipo}) => {
        const options = {
            defaultPath: app.getPath('documents') + `/registros_${new Date().toISOString().slice(0,10)}.${tipo}`,
            filters: [
                { name: tipo.toUpperCase(), extensions: [tipo] }
            ]
        }
      
        const { filePath } = await dialog.showSaveDialog(options)
        if (filePath) {
          fs.writeFileSync(filePath, conteudo)
          return true
        }
        return false
    });

    ipcMain.handle('exportar-pdf', async (event, registros) => {
        try {
            const options = {
                title: 'Salvar PDF',
                defaultPath: app.getPath('documents') + `/registros_${new Date().toISOString().slice(0,10)}.pdf`,
                filters: [{ name: 'PDF', extensions: ['pdf'] }]
            };

            const { filePath } = await dialog.showSaveDialog(options);
            if (!filePath) return false;

            const doc = new PDFDocument({
                margins: { top: 30, bottom: 30, left: 20, right: 20 },
                size: 'A4'
            });
            const stream = fs.createWriteStream(filePath);

            doc.pipe(stream);

            // CabeÃƒÂ§alho
            doc.fontSize(24)
               .font('Helvetica-Bold')
               .text('Registro de Pacientes', {align: 'center'});
            doc.moveDown();

            // Data do relatÃƒÂ³rio
            doc.fontSize(8)
               .font('Helvetica')
               .text(`RelatÃƒÂ³rio gerado em: ${new Date().toLocaleString('pt-BR')}`, {align: 'right'});
            doc.moveDown(2);

            // Define larguras das colunas
            const colWidths = {
                nome: 160,
                modalidade: 80,
                exame: 80,
                acesso: 70,
                dataHora: 100,
                tecnico: 70
            };

            // CabeÃƒÂ§alho da tabela com fundo azul claro
            doc.font('Helvetica-Bold')
               .fontSize(10);

            const tableWidth = 560; // Largura total da tabela
            const tableX = 20; // PosiÃƒÂ§ÃƒÂ£o X inicial da tabela
            const headerY = doc.y;

            // CabeÃƒÂ§alho com fundo azul claro
            doc.fillColor('#e8eef7')
               .rect(tableX, headerY, tableWidth, 20)
               .fill()
               .fillColor('#000');

            // Textos do cabeÃƒÂ§alho
            let currentX = tableX;
            doc.text('Nome', currentX, headerY + 5, {width: colWidths.nome});
            currentX += colWidths.nome;
            doc.text('Modalidade', currentX, headerY + 5, {width: colWidths.modalidade});
            currentX += colWidths.modalidade;
            doc.text('Exame', currentX, headerY + 5, {width: colWidths.exame});
            currentX += colWidths.exame;
            doc.text('Acesso', currentX, headerY + 5, {width: colWidths.acesso});
            currentX += colWidths.acesso;
            doc.text('Data/Hora', currentX, headerY + 5, {width: colWidths.dataHora});
            currentX += colWidths.dataHora;
            doc.text('TÃƒÂ©cnico', currentX, headerY + 5, {width: colWidths.tecnico});

            doc.moveDown();

            // Registros com cores alternadas
            doc.font('Helvetica')
               .fontSize(7);

            registros.forEach((r, index) => {
                const rowY = doc.y;
                
                // Alternar cores das linhas (branco e azul mais claro)
                if (index % 2 === 1) {
                    doc.fillColor('#f5f8fd')
                       .rect(tableX, rowY, tableWidth, 20)
                       .fill()
                       .fillColor('#000');
                }
                
                // Dados do registro
                currentX = tableX;
                doc.text(r.nomePaciente || '', currentX, rowY + 5, {width: colWidths.nome});
                currentX += colWidths.nome;
                doc.text(r.modalidade || '', currentX, rowY + 5, {width: colWidths.modalidade});
                currentX += colWidths.modalidade;
                doc.text(r.observacoes || '', currentX, rowY + 5, {width: colWidths.exame});
                currentX += colWidths.exame;
                doc.text(r.numeroAcesso || '', currentX, rowY + 5, {width: colWidths.acesso});
                currentX += colWidths.acesso;
                doc.text(new Date(r.dataHoraExame).toLocaleString('pt-BR'), currentX, rowY + 5, {width: colWidths.dataHora});
                currentX += colWidths.dataHora;
                doc.text(r.nomeTecnico || '', currentX, rowY + 5, {width: colWidths.tecnico});

                // ObservaÃƒÂ§ÃƒÂµes adicionais
                if (r.observacoesAdicionais) {
                    doc.moveDown(0.7);
                    doc.fillColor('#666666')
                       .text(`Obs: ${r.observacoesAdicionais}`, tableX + 20, doc.y, {
                           width: tableWidth - 40,
                           align: 'left'
                       })
                       .fillColor('#000');
                }

                doc.moveDown();

                // Adiciona nova pÃƒÂ¡gina se necessÃƒÂ¡rio
                if (doc.y > 750) {
                    doc.addPage();
                    doc.fontSize(8);
                }
            });

            // RodapÃƒÂ©
            doc.fontSize(8)
               .text(`Documento gerado automaticamente em ${new Date().toLocaleString('pt-BR')}`, 50, doc.page.height - 50, {
                   align: 'center'
               });

            // Finaliza o documento
            doc.end();

            return new Promise((resolve) => {
                stream.on('finish', () => {
                    dialog.showMessageBox({
                        type: 'info',
                        message: 'PDF gerado com sucesso!'
                    });
                    resolve(true);
                });

                stream.on('error', (error) => {
                    dialog.showErrorBox('Erro', 'Falha ao gerar PDF: ' + error.message);
                    resolve(false);
                });
            });

        } catch (error) {
            dialog.showErrorBox('Erro', 'Falha ao gerar PDF: ' + error.message);
            return false;
        }
    });

    ipcMain.handle('exportar-csv', async (event, registros) => {
        try {
            const options = {
                title: 'Salvar Excel',
                defaultPath: app.getPath('documents') + `/registros_${new Date().toISOString().slice(0,10)}.xlsx`,
                filters: [{ name: 'Excel', extensions: ['xlsx'] }]
            };

            const { filePath } = await dialog.showSaveDialog(options);
            if (!filePath) return false;

            // Cria uma nova planilha
            const wb = XLSX.utils.book_new();

            // Define estilos
            const styles = {
                titulo: {
                    font: { bold: true, sz: 18, color: { rgb: '000000' } },
                    alignment: { horizontal: 'center', vertical: 'center' },
                    fill: { fgColor: { rgb: 'FFFFFF' } }
                },
                cabecalho: {
                    font: { bold: true, sz: 12, color: { rgb: 'FFFFFF' } },
                    fill: { fgColor: { rgb: '4F81BD' } },
                    alignment: { horizontal: 'center', vertical: 'center' },
                    border: {
                        top: { style: 'thin', color: { rgb: '000000' } },
                        bottom: { style: 'thin', color: { rgb: '000000' } },
                        left: { style: 'thin', color: { rgb: '000000' } },
                        right: { style: 'thin', color: { rgb: '000000' } }
                    }
                },
                celula: {
                    font: { sz: 11 },
                    alignment: { vertical: 'center', wrapText: true },
                    border: {
                        top: { style: 'thin', color: { rgb: '000000' } },
                        bottom: { style: 'thin', color: { rgb: '000000' } },
                        left: { style: 'thin', color: { rgb: '000000' } },
                        right: { style: 'thin', color: { rgb: '000000' } }
                    }
                },
                celulaAlternada: {
                    font: { sz: 11 },
                    fill: { fgColor: { rgb: 'F2F2F2' } },
                    alignment: { vertical: 'center', wrapText: true },
                    border: {
                        top: { style: 'thin', color: { rgb: '000000' } },
                        bottom: { style: 'thin', color: { rgb: '000000' } },
                        left: { style: 'thin', color: { rgb: '000000' } },
                        right: { style: 'thin', color: { rgb: '000000' } }
                    }
                }
            };

            // Prepara os dados com estilos
            const dados = registros.map((r, index) => ([
                { v: r.nomePaciente || '', s: index % 2 ? styles.celulaAlternada : styles.celula },
                { v: r.modalidade || '', s: index % 2 ? styles.celulaAlternada : styles.celula },
                { v: r.observacoes || '', s: index % 2 ? styles.celulaAlternada : styles.celula },
                { v: r.numeroAcesso || '', s: index % 2 ? styles.celulaAlternada : styles.celula },
                { v: new Date(r.dataHoraExame).toLocaleString('pt-BR'), s: index % 2 ? styles.celulaAlternada : styles.celula },
                { v: r.nomeTecnico || '', s: index % 2 ? styles.celulaAlternada : styles.celula },
                { v: r.observacoesAdicionais || '', s: index % 2 ? styles.celulaAlternada : styles.celula }
            ]));

            // Adiciona cabeÃƒÂ§alho
            dados.unshift([
                { v: 'Nome do Paciente', s: styles.cabecalho },
                { v: 'Modalidade', s: styles.cabecalho },
                { v: 'Exame', s: styles.cabecalho },
                { v: 'NÃƒÂºmero de Acesso', s: styles.cabecalho },
                { v: 'Data/Hora', s: styles.cabecalho },
                { v: 'TÃƒÂ©cnico', s: styles.cabecalho },
                { v: 'ObservaÃƒÂ§ÃƒÂµes', s: styles.cabecalho }
            ]);

            // Adiciona tÃƒÂ­tulo
            dados.unshift([{ v: 'Registro de Pacientes', s: styles.titulo }], 
                         [{ v: `RelatÃƒÂ³rio gerado em: ${new Date().toLocaleString('pt-BR')}`, s: styles.celula }],
                         []);

            // Cria a planilha
            const ws = XLSX.utils.aoa_to_sheet(dados);

            // Configura mesclagem de cÃƒÂ©lulas
            ws['!merges'] = [
                { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
                { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } }
            ];

            // Define larguras das colunas
            ws['!cols'] = [
                { wch: 60 }, // Nome do Paciente
                { wch: 15 }, // Modalidade
                { wch: 30 }, // Exame
                { wch: 20 }, // NÃƒÂºmero de Acesso
                { wch: 20 }, // Data/Hora
                { wch: 20 }, // TÃƒÂ©cnico
                { wch: 80 }  // ObservaÃƒÂ§ÃƒÂµes
            ];

            // Adiciona a planilha ao workbook
            XLSX.utils.book_append_sheet(wb, ws, 'Registros');

            // Salva o arquivo
            XLSX.writeFile(wb, filePath);
            
            dialog.showMessageBox({
                type: 'info',
                message: 'Excel exportado com sucesso!'
            });
            
            return true;
        } catch (error) {
            dialog.showErrorBox('Erro', 'Falha ao exportar Excel: ' + error.message);
            return false;
        }
    });

    ipcMain.handle('importar-arquivo', async (event) => {
        try {
          const result = await dialog.showOpenDialog({
            properties: ['openFile'],
            filters: [
              { name: 'JSON', extensions: ['json'] }
            ]
          });
      
          if (!result.canceled && result.filePaths.length > 0) {
            const conteudo = await fs.promises.readFile(result.filePaths[0], 'utf8');
            // Envia os dados para o renderer
            event.sender.send('arquivo-importado', conteudo);
            return true;
          }
          return false;
        } catch (error) {
          console.error('Erro ao importar arquivo:', error);
          return false;
        }
      });

    // Adicionar handlers para ocorrÃƒÂªncias
    ipcMain.handle('ler-ocorrencias', async () => {
        try {
            return await lerDados('ocorrencias');
        } catch (error) {
            console.error('Erro ao ler ocorrencias:', error);
            dialog.showErrorBox('Erro', 'Nao foi possivel ler as ocorrencias: ' + error.message);
            return [];
        }
    });
    ipcMain.handle('salvar-ocorrencias', async (event, ocorrencias) => {
        try {
            await salvarDados('ocorrencias', ocorrencias);
            return true;
        } catch (error) {
            console.error('Erro ao salvar ocorrencias:', error);
            dialog.showErrorBox('Erro', 'Nao foi possivel salvar as ocorrencias: ' + error.message);
            return false;
        }
    });
    // Adicionar handlers para ponto
    ipcMain.handle('ler-ponto', async () => {
        try {
            return await lerDados('ponto');
        } catch (error) {
            console.error('Erro ao ler ponto:', error);
            dialog.showErrorBox('Erro', 'Nao foi possivel ler os dados de ponto: ' + error.message);
            return { funcionarios: [], registros: [] };
        }
    });
    ipcMain.handle('salvar-ponto', async (event, dados) => {
        try {
            await salvarDados('ponto', dados);
            return true;
        } catch (error) {
            console.error('Erro ao salvar ponto:', error);
            dialog.showErrorBox('Erro', 'Nao foi possivel salvar os dados de ponto: ' + error.message);
            return false;
        }
    });
    // Handler para ler configuraÃƒÂ§ÃƒÂ£o
    ipcMain.handle('ler-config', async () => {
        try {
            return await lerDados('config');
        } catch (error) {
            console.error('Erro ao ler config:', error);
            return {};
        }
    });
    // Handler para salvar configuraÃƒÂ§ÃƒÂ£o
    ipcMain.handle('salvar-config', async (event, config) => {
        try {
            await salvarDados('config', config);
            return true;
        } catch (error) {
            console.error('Erro ao salvar config:', error);
            dialog.showErrorBox('Erro', 'Nao foi possivel salvar a configuracao: ' + error.message);
            return false;
        }
    });
}


// FunÃƒÂ§ÃƒÂ£o auxiliar para formatar campos do CSV
function formatCsvField(value, maxWidth) {
    if (value === null || value === undefined) {
        value = '';
    }
    value = value.toString();
    
    // Remove quebras de linha e vÃƒÂ­rgulas
    value = value.replace(/[\r\n]+/g, ' ').replace(/,/g, ';');
    
    // Trunca o texto se exceder a largura mÃƒÂ¡xima
    if (value.length > maxWidth) {
        value = value.substring(0, maxWidth - 3) + '...';
    }
    
    // Escapa aspas duplas e envolve o campo em aspas
    value = value.replace(/"/g, '""');
    return `"${value}"`;
}

async function fazerBackup() {
    try {
        const registros = await lerDados('registros');
        const data = JSON.stringify(registros, null, 2);
        
        const hoje = new Date().toISOString().slice(0,10);
        const options = {
            title: 'Salvar Backup',
            defaultPath: app.getPath('documents') + `/backup_registros_${hoje}.json`,
            filters: [{ name: 'JSON', extensions: ['json'] }]
        };

        const { filePath } = await dialog.showSaveDialog(mainWindow, options);
        if (filePath) {
            fs.writeFileSync(filePath, data, 'utf8');
            dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'Sucesso',
                message: 'Backup realizado com sucesso!'
            });
        }
    } catch (error) {
        dialog.showErrorBox('Erro', 'Falha ao fazer backup: ' + error.message);
    }
}

async function importarBackup() {
    try {
        const options = {
            title: 'Importar Backup',
            filters: [{ name: 'JSON', extensions: ['json'] }],
            properties: ['openFile']
        };

        const { filePaths } = await dialog.showOpenDialog(mainWindow, options);
        if (filePaths.length > 0) {
            // LÃƒÂª o arquivo de backup
            const backupData = fs.readFileSync(filePaths[0], 'utf8');
            
            // Tenta fazer o parse para garantir que ÃƒÂ© um JSON vÃƒÂ¡lido
            const parsedData = JSON.parse(backupData);
            if (!Array.isArray(parsedData)) {
                throw new Error('Formato de backup invalido. Esperado: array de registros.');
            }

            // Confirma com o usuÃƒÂ¡rio
            const { response } = await dialog.showMessageBox(mainWindow, {
                type: 'warning',
                buttons: ['Sim', 'NÃƒÂ£o'],
                title: 'ConfirmaÃƒÂ§ÃƒÂ£o',
                message: 'Isso substituirÃƒÂ¡ todos os registros atuais. Deseja continuar?'
            });

            if (response === 0) { // Se clicou em 'Sim'
                await salvarDados('registros', parsedData);
                
                dialog.showMessageBox(mainWindow, {
                    type: 'info',
                    title: 'Sucesso',
                    message: 'Backup importado com sucesso! A aplicaÃƒÂ§ÃƒÂ£o serÃƒÂ¡ reiniciada.',
                    buttons: ['OK']
                }).then(() => {
                    app.relaunch();
                    app.exit();
                });
            }
        }
    } catch (error) {
        dialog.showErrorBox('Erro', 'Falha ao importar backup: ' + error.message);
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 1000,
        show: false,
        title: 'Registro de Pacientes v2.0', // Adicionado tÃƒÂ­tulo com versÃƒÂ£o
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'src', 'pages', 'index.html'));
    mainWindow.maximize();
    mainWindow.show();

    const menu = Menu.buildFromTemplate([
        {
            label: 'Arquivo',
            submenu: [
                {
                    label: 'Exportar',    
                    click: () => mainWindow.webContents.send('show-export-modal')                    
                },
                { type: 'separator' },
                {
                    label: 'Importar',
                    click: () => mainWindow.webContents.send('start-import')
                },                                
                { type: 'separator' },
                {
                    label: 'Sair',
                    click: () => app.quit()
                }
               
            ]
        },
        {
            label: 'Temas',
            submenu: [
                {
                    label: 'Claro',
                    click: () => mainWindow.webContents.send('change-theme', 'light')
                },
                {
                    label: 'Escuro',
                    click: () => mainWindow.webContents.send('change-theme', 'dark')
                },
                {
                    label: 'Azul',
                    click: () => mainWindow.webContents.send('change-theme', 'blue')
                }
            ]
        },
        {
            label: 'Ajuda',
            submenu: [
                {
                    label: 'Manual',
                    click: createHelpWindow
                }
            ]
        }
    ]);

    Menu.setApplicationMenu(menu);

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    if (process.env.NODE_ENV === 'development') {
        mainWindow.webContents.openDevTools();
    }
}

function createHelpWindow() {
    if (helpWindow) {
        helpWindow.focus();
        return;
    }

    helpWindow = new BrowserWindow({
        width: 1000,
        height: 800,
        title: 'Manual do Sistema',
        autoHideMenuBar: true,
        parent: mainWindow,
        modal: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    const manualPath = path.join(__dirname, 'MANUAL.md');
    try {
        const content = fs.readFileSync(manualPath, 'utf8');
        // Configurar o marked antes de usar
        marked.use({
            mangle: false,
            headerIds: false
        });
        
        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    body {
                        font-family: 'Segoe UI', Arial, sans-serif;
                        line-height: 1.6;
                        padding: 20px;
                        max-width: 800px;
                        margin: 0 auto;
                        background: #ffffff;
                        color: #333;
                    }
                    h1, h2, h3 { 
                        color: #2c3e50; 
                        margin-top: 1.5em;
                    }
                    code { 
                        background: #f8f9fa; 
                        padding: 2px 4px; 
                        border-radius: 3px; 
                    }
                    pre { 
                        background: #f8f9fa; 
                        padding: 15px; 
                        border-radius: 5px; 
                    }
                    ul, ol {
                        padding-left: 20px;
                    }
                    li {
                        margin: 5px 0;
                    }
                </style>
            </head>
            <body>
                ${marked.parse(content)}
            </body>
            </html>
        `;

        helpWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
        
        // Adiciona manipulador de erro
        helpWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
            console.error('Erro ao carregar conteÃƒÂºdo:', errorDescription);
            dialog.showErrorBox('Erro', 'Falha ao carregar o manual: ' + errorDescription);
        });
    } catch (error) {
        console.error('Erro ao carregar o manual:', error);
        dialog.showErrorBox('Erro', 'NÃƒÂ£o foi possÃƒÂ­vel carregar o manual: ' + error.message);
    }

    helpWindow.on('closed', () => {
        helpWindow = null;
    });
}

app.whenReady().then(async () => {
    try {
        const onlineNoInicio = await inicializarPersistencia();
        setupIpcHandlers();
        createWindow();

        if (!onlineNoInicio) {
            dialog.showMessageBox(mainWindow, {
                type: 'warning',
                title: 'Modo Offline',
                message: 'Sem conexao com MongoDB. Os dados serao salvos localmente e sincronizados quando a conexao voltar.'
            });
        }

        // Copiar o manual para o diretÃƒÂ³rio de instalaÃƒÂ§ÃƒÂ£o
        const manualSourcePath = path.join(__dirname, 'MANUAL.md');
        const manualDestPath = path.join(__dirname, 'MANUAL.md');
        fs.copyFileSync(manualSourcePath, manualDestPath);
    } catch (error) {
        console.error('Falha ao iniciar a aplicacao:', error);
        dialog.showErrorBox('Erro de Inicializacao', 'Nao foi possivel iniciar a aplicacao: ' + error.message);
        app.quit();
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

app.on('before-quit', () => {
    if (reconnectTimer) {
        clearInterval(reconnectTimer);
        reconnectTimer = null;
    }

    if (mongoClient) {
        mongoClient.close().catch((error) => {
            console.error('Erro ao fechar conexao com MongoDB:', error);
        });
    }
});

