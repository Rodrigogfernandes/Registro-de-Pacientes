const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const marked = require('marked');
const PDFDocument = require('pdfkit');
const XLSX = require('xlsx-js-style'); // Altere esta linha

let mainWindow;
let helpWindow;

// Adicionar nova função para gerenciar caminhos de arquivos
function getDataFilePath(tipo) {
    const dataDir = path.join(__dirname, 'data');
    switch(tipo) {
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

function ensureDataDir() {
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
}

function setupIpcHandlers() {
    const parseJsonSafe = (raw) => JSON.parse((raw || '').replace(/^\uFEFF/, ''));

    ipcMain.handle('ler-registros', () => {
        try {
            const filePath = getDataFilePath();
            if (fs.existsSync(filePath)) {
                const data = fs.readFileSync(filePath, 'utf8');
                return parseJsonSafe(data);
            }
            return [];
        } catch (error) {
            console.error('Erro ao ler registros:', error);
            dialog.showErrorBox('Erro', 'Não foi possível ler os registros: ' + error.message);
            return [];
        }
    });

    ipcMain.handle('salvar-registros', (event, registros) => {
        try {
            ensureDataDir();
            const filePath = getDataFilePath();
            fs.writeFileSync(filePath, JSON.stringify(registros, null, 2), 'utf8');
            return true;
        } catch (error) {
            console.error('Erro ao salvar registros:', error);
            dialog.showErrorBox('Erro', 'Não foi possível salvar os registros: ' + error.message);
            return false;
        }
    });

    ipcMain.handle('ler-pacientes', () => {
        try {
            const filePath = getDataFilePath('pacientes');
            if (fs.existsSync(filePath)) {
                const data = fs.readFileSync(filePath, 'utf8');
                return parseJsonSafe(data);
            }
            return [];
        } catch (error) {
            console.error('Erro ao ler pacientes:', error);
            dialog.showErrorBox('Erro', 'Não foi possível ler os pacientes: ' + error.message);
            return [];
        }
    });

    ipcMain.handle('salvar-pacientes', (event, pacientes) => {
        try {
            ensureDataDir();
            const filePath = getDataFilePath('pacientes');
            fs.writeFileSync(filePath, JSON.stringify(pacientes, null, 2), 'utf8');
            return true;
        } catch (error) {
            console.error('Erro ao salvar pacientes:', error);
            dialog.showErrorBox('Erro', 'Não foi possível salvar os pacientes: ' + error.message);
            return false;
        }
    });

    ipcMain.handle('ler-agendamentos', () => {
        try {
            const filePath = getDataFilePath('agendamentos');
            if (fs.existsSync(filePath)) {
                const data = fs.readFileSync(filePath, 'utf8');
                return parseJsonSafe(data);
            }
            return [];
        } catch (error) {
            console.error('Erro ao ler agendamentos:', error);
            dialog.showErrorBox('Erro', 'Não foi possível ler os agendamentos: ' + error.message);
            return [];
        }
    });

    ipcMain.handle('salvar-agendamentos', (event, agendamentos) => {
        try {
            ensureDataDir();
            const filePath = getDataFilePath('agendamentos');
            fs.writeFileSync(filePath, JSON.stringify(agendamentos, null, 2), 'utf8');
            return true;
        } catch (error) {
            console.error('Erro ao salvar agendamentos:', error);
            dialog.showErrorBox('Erro', 'Não foi possível salvar os agendamentos: ' + error.message);
            return false;
        }
    });

    ipcMain.handle('ler-medicos-agenda', () => {
        try {
            const filePath = getDataFilePath('medicos-agenda');
            if (fs.existsSync(filePath)) {
                const data = fs.readFileSync(filePath, 'utf8');
                return parseJsonSafe(data);
            }
            return [];
        } catch (error) {
            console.error('Erro ao ler agendas mÃ©dicas:', error);
            dialog.showErrorBox('Erro', 'NÃ£o foi possÃ­vel ler as agendas mÃ©dicas: ' + error.message);
            return [];
        }
    });

    ipcMain.handle('salvar-medicos-agenda', (event, medicosAgenda) => {
        try {
            ensureDataDir();
            const filePath = getDataFilePath('medicos-agenda');
            fs.writeFileSync(filePath, JSON.stringify(medicosAgenda, null, 2), 'utf8');
            return true;
        } catch (error) {
            console.error('Erro ao salvar agendas mÃ©dicas:', error);
            dialog.showErrorBox('Erro', 'NÃ£o foi possÃ­vel salvar as agendas mÃ©dicas: ' + error.message);
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

            // Cabeçalho
            doc.fontSize(24)
               .font('Helvetica-Bold')
               .text('Registro de Pacientes', {align: 'center'});
            doc.moveDown();

            // Data do relatório
            doc.fontSize(8)
               .font('Helvetica')
               .text(`Relatório gerado em: ${new Date().toLocaleString('pt-BR')}`, {align: 'right'});
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

            // Cabeçalho da tabela com fundo azul claro
            doc.font('Helvetica-Bold')
               .fontSize(10);

            const tableWidth = 560; // Largura total da tabela
            const tableX = 20; // Posição X inicial da tabela
            const headerY = doc.y;

            // Cabeçalho com fundo azul claro
            doc.fillColor('#e8eef7')
               .rect(tableX, headerY, tableWidth, 20)
               .fill()
               .fillColor('#000');

            // Textos do cabeçalho
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
            doc.text('Técnico', currentX, headerY + 5, {width: colWidths.tecnico});

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

                // Observações adicionais
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

                // Adiciona nova página se necessário
                if (doc.y > 750) {
                    doc.addPage();
                    doc.fontSize(8);
                }
            });

            // Rodapé
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

            // Adiciona cabeçalho
            dados.unshift([
                { v: 'Nome do Paciente', s: styles.cabecalho },
                { v: 'Modalidade', s: styles.cabecalho },
                { v: 'Exame', s: styles.cabecalho },
                { v: 'Número de Acesso', s: styles.cabecalho },
                { v: 'Data/Hora', s: styles.cabecalho },
                { v: 'Técnico', s: styles.cabecalho },
                { v: 'Observações', s: styles.cabecalho }
            ]);

            // Adiciona título
            dados.unshift([{ v: 'Registro de Pacientes', s: styles.titulo }], 
                         [{ v: `Relatório gerado em: ${new Date().toLocaleString('pt-BR')}`, s: styles.celula }],
                         []);

            // Cria a planilha
            const ws = XLSX.utils.aoa_to_sheet(dados);

            // Configura mesclagem de células
            ws['!merges'] = [
                { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
                { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } }
            ];

            // Define larguras das colunas
            ws['!cols'] = [
                { wch: 60 }, // Nome do Paciente
                { wch: 15 }, // Modalidade
                { wch: 30 }, // Exame
                { wch: 20 }, // Número de Acesso
                { wch: 20 }, // Data/Hora
                { wch: 20 }, // Técnico
                { wch: 80 }  // Observações
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

    // Adicionar handlers para ocorrências
    ipcMain.handle('ler-ocorrencias', () => {
        try {
            const filePath = getDataFilePath('ocorrencias');
            if (fs.existsSync(filePath)) {
                const data = fs.readFileSync(filePath, 'utf8');
                return JSON.parse(data);
            }
            return [];
        } catch (error) {
            console.error('Erro ao ler ocorrências:', error);
            dialog.showErrorBox('Erro', 'Não foi possível ler as ocorrências: ' + error.message);
            return [];
        }
    });

    ipcMain.handle('salvar-ocorrencias', (event, ocorrencias) => {
        try {
            const filePath = getDataFilePath('ocorrencias');
            fs.writeFileSync(filePath, JSON.stringify(ocorrencias, null, 2), 'utf8');
            return true;
        } catch (error) {
            console.error('Erro ao salvar ocorrências:', error);
            dialog.showErrorBox('Erro', 'Não foi possível salvar as ocorrências: ' + error.message);
            return false;
        }
    });

    // Adicionar handlers para ponto
    ipcMain.handle('ler-ponto', () => {
        try {
            const filePath = getDataFilePath('ponto');
            if (fs.existsSync(filePath)) {
                const data = fs.readFileSync(filePath, 'utf8');
                return JSON.parse(data);
            }
            // Retornar estrutura vazia se o arquivo não existir
            return { funcionarios: [], registros: [] };
        } catch (error) {
            console.error('Erro ao ler ponto:', error);
            dialog.showErrorBox('Erro', 'Não foi possível ler os dados de ponto: ' + error.message);
            return { funcionarios: [], registros: [] };
        }
    });

    ipcMain.handle('salvar-ponto', (event, dados) => {
        try {
            const filePath = getDataFilePath('ponto');
            // Garantir que o diretório existe
            const dataDir = path.dirname(filePath);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }
            fs.writeFileSync(filePath, JSON.stringify(dados, null, 2), 'utf8');
            return true;
        } catch (error) {
            console.error('Erro ao salvar ponto:', error);
            dialog.showErrorBox('Erro', 'Não foi possível salvar os dados de ponto: ' + error.message);
            return false;
        }
    });

    // Handler para ler configuração
    ipcMain.handle('ler-config', () => {
        try {
            const filePath = getDataFilePath('config');
            if (fs.existsSync(filePath)) {
                const data = fs.readFileSync(filePath, 'utf8');
                return JSON.parse(data);
            }
            return {};
        } catch (error) {
            console.error('Erro ao ler config:', error);
            return {};
        }
    });

    // Handler para salvar configuração
    ipcMain.handle('salvar-config', (event, config) => {
        try {
            const filePath = getDataFilePath('config');
            // Garantir que o diretório existe
            const dataDir = path.dirname(filePath);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }
            fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf8');
            return true;
        } catch (error) {
            console.error('Erro ao salvar config:', error);
            dialog.showErrorBox('Erro', 'Não foi possível salvar a configuração: ' + error.message);
            return false;
        }
    });

}


// Função auxiliar para formatar campos do CSV
function formatCsvField(value, maxWidth) {
    if (value === null || value === undefined) {
        value = '';
    }
    value = value.toString();
    
    // Remove quebras de linha e vírgulas
    value = value.replace(/[\r\n]+/g, ' ').replace(/,/g, ';');
    
    // Trunca o texto se exceder a largura máxima
    if (value.length > maxWidth) {
        value = value.substring(0, maxWidth - 3) + '...';
    }
    
    // Escapa aspas duplas e envolve o campo em aspas
    value = value.replace(/"/g, '""');
    return `"${value}"`;
}

async function fazerBackup() {
    try {
        const sourceFile = getDataFilePath();
        if (!fs.existsSync(sourceFile)) {
            throw new Error('Arquivo de registros não encontrado');
        }

        const data = fs.readFileSync(sourceFile);
        
        const hoje = new Date().toISOString().slice(0,10);
        const options = {
            title: 'Salvar Backup',
            defaultPath: app.getPath('documents') + `/backup_registros_${hoje}.json`,
            filters: [{ name: 'JSON', extensions: ['json'] }]
        };

        const { filePath } = await dialog.showSaveDialog(mainWindow, options);
        if (filePath) {
            fs.writeFileSync(filePath, data);
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
            // Lê o arquivo de backup
            const backupData = fs.readFileSync(filePaths[0], 'utf8');
            
            // Tenta fazer o parse para garantir que é um JSON válido
            JSON.parse(backupData);

            // Confirma com o usuário
            const { response } = await dialog.showMessageBox(mainWindow, {
                type: 'warning',
                buttons: ['Sim', 'Não'],
                title: 'Confirmação',
                message: 'Isso substituirá todos os registros atuais. Deseja continuar?'
            });

            if (response === 0) { // Se clicou em 'Sim'
                const destFile = getDataFilePath();
                fs.writeFileSync(destFile, backupData);
                
                dialog.showMessageBox(mainWindow, {
                    type: 'info',
                    title: 'Sucesso',
                    message: 'Backup importado com sucesso! A aplicação será reiniciada.',
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
        title: 'Registro de Pacientes v2.0', // Adicionado título com versão
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
            console.error('Erro ao carregar conteúdo:', errorDescription);
            dialog.showErrorBox('Erro', 'Falha ao carregar o manual: ' + errorDescription);
        });
    } catch (error) {
        console.error('Erro ao carregar o manual:', error);
        dialog.showErrorBox('Erro', 'Não foi possível carregar o manual: ' + error.message);
    }

    helpWindow.on('closed', () => {
        helpWindow = null;
    });
}

app.whenReady().then(() => {
    setupIpcHandlers();
    createWindow();
    // Copiar o manual para o diretório de instalação
    const manualSourcePath = path.join(__dirname, 'MANUAL.md');
    const manualDestPath = path.join(__dirname, 'MANUAL.md');
    fs.copyFileSync(manualSourcePath, manualDestPath);
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
