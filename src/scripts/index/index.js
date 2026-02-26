try {
    const { ipcRenderer } = require('electron');

    const modal = document.getElementById('configModal');
    const configBtn = document.getElementById('configBtn');
    const closeBtn = document.querySelector('#configModal .close');

    const exportModal = document.getElementById('exportModal');
    const backupModal = document.getElementById('backupModal');
    const importModal = document.getElementById('importModal');

    function openModal() {
        if (modal) modal.classList.add('active');
    }

    function closeModal() {
        if (modal) modal.classList.remove('active');
    }

    window.closeExportModal = function() {
        if (exportModal) exportModal.classList.remove('active');
    };

    window.closeBackupModal = function() {
        if (backupModal) backupModal.classList.remove('active');
    };

    window.closeImportModal = function() {
        if (importModal) importModal.classList.remove('active');
    };

    if (configBtn) configBtn.addEventListener('click', openModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    window.addEventListener('click', (event) => {
        if (event.target === modal) closeModal();
        if (event.target === exportModal) window.closeExportModal();
        if (event.target === backupModal) window.closeBackupModal();
        if (event.target === importModal) window.closeImportModal();
    });

    window.changeTheme = function(theme) {
        document.body.classList.remove('dark-theme', 'theme-azul');
        if (theme === 'dark') {
            document.body.classList.add('dark-theme');
        } else if (theme === 'blue') {
            document.body.classList.add('theme-azul');
        }
        localStorage.setItem('theme', theme);
        closeModal();
    };

    window.handleExport = function() {
        if (exportModal) exportModal.classList.add('active');
        closeModal();
    };

    window.exportAs = async function(type) {
        try {
            const registros = await ipcRenderer.invoke('ler-registros');
            if (registros && registros.length > 0) {
                if (type === 'pdf') {
                    await ipcRenderer.invoke('exportar-pdf', registros);
                } else if (type === 'excel') {
                    await ipcRenderer.invoke('exportar-csv', registros);
                }
            } else {
                await ipcRenderer.invoke('mostrar-erro', 'Não há registros para exportar');
            }
        } catch (error) {
            console.error('Erro ao exportar:', error);
            await ipcRenderer.invoke('mostrar-erro', 'Erro ao exportar registros');
        }
        window.closeExportModal();
    };

    window.handleImport = function() {
        if (importModal) importModal.classList.add('active');
        closeModal();
    };

    window.importarArquivo = async function(tipo) {
        try {
            const resultado = await ipcRenderer.invoke('importar-arquivo', tipo);
            if (resultado) {
                window.location.reload();
            }
        } catch (error) {
            console.error('Erro ao importar:', error);
            await ipcRenderer.invoke('mostrar-erro', 'Erro ao importar arquivo');
        }
        window.closeImportModal();
    };

    window.handleBackup = function() {
        window.closeExportModal();
        if (backupModal) backupModal.classList.add('active');
    };

    window.exportBackup = async function(type) {
        try {
            if (type === 'registros') {
                await ipcRenderer.invoke('fazer-backup', 'registros');
            } else if (type === 'ocorrencias') {
                await ipcRenderer.invoke('fazer-backup', 'ocorrencias');
            }
        } catch (error) {
            console.error('Erro ao fazer backup:', error);
            await ipcRenderer.invoke('mostrar-erro', 'Erro ao fazer backup');
        }
        window.closeBackupModal();
    };

    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) window.changeTheme(savedTheme);

    ipcRenderer.on('apply-theme', (event, theme) => {
        window.changeTheme(theme);
    });
} catch (error) {
    console.error('Erro na inicialização:', error);
}
