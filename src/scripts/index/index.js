try {
    const { ipcRenderer } = require('electron');

    const modal = document.getElementById('configModal');
    const configBtn = document.getElementById('configBtn');
    const closeBtn = document.querySelector('#configModal .close');

    const exportModal = document.getElementById('exportModal');
    const backupModal = document.getElementById('backupModal');
    const autoBackupModal = document.getElementById('autoBackupModal');
    const autoBackupStatus = document.getElementById('autoBackupStatus');
    const autoBackupList = document.getElementById('autoBackupList');
    const autoBackupPreviewContent = document.getElementById('autoBackupPreviewContent');
    const autoBackupRestoreBtn = document.getElementById('autoBackupRestoreBtn');
    const importModal = document.getElementById('importModal');
    const searchModal = document.getElementById('searchModal');
    const globalSearchInput = document.getElementById('globalSearchInput');
    const globalSearchResults = document.getElementById('globalSearchResults');
    const globalSearchStatus = document.getElementById('globalSearchStatus');
    const usersModal = document.getElementById('usersModal');
    const usersStatus = document.getElementById('usersStatus');
    const usersList = document.getElementById('usersList');
    const activeUsersStatus = document.getElementById('activeUsersStatus');
    const activeUsersList = document.getElementById('activeUsersList');
    const auditStatus = document.getElementById('auditStatus');
    const auditList = document.getElementById('auditList');
    const auditFilterUser = document.getElementById('auditFilterUser');
    const auditFilterAction = document.getElementById('auditFilterAction');
    const auditFilterType = document.getElementById('auditFilterType');
    const auditFilterDateFrom = document.getElementById('auditFilterDateFrom');
    const auditFilterDateTo = document.getElementById('auditFilterDateTo');
    const auditFilterSearch = document.getElementById('auditFilterSearch');
    const applyAuditFilterBtn = document.getElementById('applyAuditFilterBtn');
    const clearAuditFilterBtn = document.getElementById('clearAuditFilterBtn');
    const exportUserAuditBtn = document.getElementById('exportUserAuditBtn');
    const exportAuditCsvBtn = document.getElementById('exportAuditCsvBtn');
    const auditPrevPageBtn = document.getElementById('auditPrevPageBtn');
    const auditNextPageBtn = document.getElementById('auditNextPageBtn');
    const auditPageInfo = document.getElementById('auditPageInfo');
    const userForm = document.getElementById('userForm');
    const userIdInput = document.getElementById('userId');
    const userUsernameInput = document.getElementById('userUsername');
    const userNomeInput = document.getElementById('userNome');
    const userRoleInput = document.getElementById('userRole');
    const userPasswordInput = document.getElementById('userPassword');
    const userActiveInput = document.getElementById('userActive');
    const deleteUserBtn = document.getElementById('deleteUserBtn');
    const manageUsersBtn = document.getElementById('manageUsersBtn');
    const manageAutoBackupBtn = document.getElementById('manageAutoBackupBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const sessionInfo = document.getElementById('sessionInfo');
    const dashRegistrosHoje = document.getElementById('dashRegistrosHoje');
    const dashAgendamentosHoje = document.getElementById('dashAgendamentosHoje');
    const dashPendencias = document.getElementById('dashPendencias');
    const dashUsuariosAtivos = document.getElementById('dashUsuariosAtivos');
    const homeAlertsList = document.getElementById('homeAlertsList');
    const homeDashboardSection = document.querySelector('.home-dashboard');
    const homeAlertsSection = document.querySelector('.home-alerts');
    const moduleCards = Array.from(document.querySelectorAll('.button-group1[data-module]'));
    const chatFab = document.getElementById('chatFab');
    const chatUnreadBadge = document.getElementById('chatUnreadBadge');
    const chatPanel = document.getElementById('chatPanel');
    const chatCloseBtn = document.getElementById('chatCloseBtn');
    const chatMessages = document.getElementById('chatMessages');
    const chatForm = document.getElementById('chatForm');
    const chatInput = document.getElementById('chatInput');
    const chatTargetSelect = document.getElementById('chatTargetSelect');
    const chatTargetLabel = document.getElementById('chatTargetLabel');

    const PERMISSOES = {
        admin: ['agendamento', 'registros', 'ocorrencias', 'ponto'],
        recepcao: ['agendamento', 'registros', 'ocorrencias', 'ponto'],
        tecnico: ['registros', 'ocorrencias', 'ponto']
    };

    let sessaoAtual = null;
    let usersState = [];
    let activeUsersState = [];
    let activeUsersPollTimer = null;
    let dashboardPollTimer = null;
    let chatPollTimer = null;
    let selectedAutoBackupName = '';
    let selectedAuditUsername = '';
    let chatState = [];
    let chatUsersState = [];
    let chatUnreadState = 0;
    let chatOnlineUsersSet = new Set();
    let auditFilterState = {
        username: '',
        acao: '',
        tipo: '',
        dateFrom: '',
        dateTo: '',
        search: '',
        limit: 5000
    };
    let auditPaginationState = {
        page: 1,
        pageSize: 20,
        total: 0,
        totalPages: 1
    };

    function getModulesPermitidos() {
        const role = String(sessaoAtual?.role || '').toLowerCase();
        return PERMISSOES[role] || [];
    }

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

    window.closeAutoBackupModal = function() {
        if (autoBackupModal) autoBackupModal.classList.remove('active');
        selectedAutoBackupName = '';
        if (autoBackupRestoreBtn) autoBackupRestoreBtn.disabled = true;
        if (autoBackupPreviewContent) {
            autoBackupPreviewContent.innerHTML = '<div class="search-status">Selecione um backup para visualizar detalhes.</div>';
        }
    };

    window.closeImportModal = function() {
        if (importModal) importModal.classList.remove('active');
    };

    window.closeSearchModal = function() {
        if (searchModal) searchModal.classList.remove('active');
    };

    window.closeUsersModal = function() {
        if (usersModal) usersModal.classList.remove('active');
        if (activeUsersPollTimer) {
            clearInterval(activeUsersPollTimer);
            activeUsersPollTimer = null;
        }
    };

    window.openSearchModal = function() {
        if (!sessaoAtual) return;
        if (searchModal) searchModal.classList.add('active');
        setTimeout(() => {
            if (globalSearchInput) globalSearchInput.focus();
        }, 0);
    };

    if (configBtn) configBtn.addEventListener('click', openModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    window.addEventListener('click', (event) => {
        if (event.target === modal) closeModal();
        if (event.target === exportModal) window.closeExportModal();
        if (event.target === backupModal) window.closeBackupModal();
        if (event.target === autoBackupModal) window.closeAutoBackupModal();
        if (event.target === importModal) window.closeImportModal();
        if (event.target === searchModal) window.closeSearchModal();
        if (event.target === usersModal) window.closeUsersModal();
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
        if (String(sessaoAtual?.role || '') === 'tecnico') return;
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
        if (String(sessaoAtual?.role || '') === 'tecnico') return;
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
        if (String(sessaoAtual?.role || '') === 'tecnico') return;
        window.closeExportModal();
        if (backupModal) backupModal.classList.add('active');
    };

    async function carregarBackupsAutomaticos() {
        if (autoBackupStatus) autoBackupStatus.textContent = 'Carregando backups...';
        if (autoBackupList) autoBackupList.innerHTML = '';
        if (autoBackupPreviewContent) autoBackupPreviewContent.innerHTML = '<div class="search-status">Selecione um backup para visualizar detalhes.</div>';
        selectedAutoBackupName = '';
        if (autoBackupRestoreBtn) autoBackupRestoreBtn.disabled = true;
        const result = await ipcRenderer.invoke('backup-list-auto');
        if (!result?.ok) {
            if (autoBackupStatus) autoBackupStatus.textContent = result?.message || 'Erro ao listar backups.';
            return;
        }
        const backups = Array.isArray(result.backups) ? result.backups : [];
        if (backups.length === 0) {
            if (autoBackupStatus) autoBackupStatus.textContent = 'Nenhum backup automático disponível.';
            return;
        }
        if (autoBackupStatus) autoBackupStatus.textContent = `${backups.length} backup(s) automático(s).`;
        if (autoBackupList) {
            autoBackupList.innerHTML = backups.map((item) => `
                <div class="auto-backup-item" data-backup-item="${escapeHtml(item.nome || '')}">
                    <div>
                        <div><strong>${escapeHtml(item.nome || '')}</strong></div>
                        <div class="users-item-meta">Criado em: ${escapeHtml(formatDateTime(item.criadoEm))}</div>
                    </div>
                    <button type="button" class="users-item-edit" data-backup-name="${escapeHtml(item.nome || '')}">Ver Preview</button>
                </div>
            `).join('');

            autoBackupList.querySelectorAll('[data-backup-name]').forEach((button) => {
                button.addEventListener('click', async () => {
                    const nome = String(button.getAttribute('data-backup-name') || '');
                    if (!nome) return;
                    selectedAutoBackupName = nome;
                    autoBackupList.querySelectorAll('[data-backup-item]').forEach((el) => {
                        el.classList.toggle('is-selected', el.getAttribute('data-backup-item') === nome);
                    });
                    if (autoBackupStatus) autoBackupStatus.textContent = `Carregando preview de ${nome}...`;
                    const previewResult = await ipcRenderer.invoke('backup-preview-auto', nome);
                    if (!previewResult?.ok) {
                        if (autoBackupStatus) autoBackupStatus.textContent = previewResult?.message || 'Erro ao carregar preview.';
                        if (autoBackupRestoreBtn) autoBackupRestoreBtn.disabled = true;
                        return;
                    }
                    const preview = previewResult.preview || {};
                    if (autoBackupStatus) autoBackupStatus.textContent = `Preview carregado para ${nome}.`;
                    if (autoBackupRestoreBtn) autoBackupRestoreBtn.disabled = false;
                    if (autoBackupPreviewContent) {
                        const c = preview.colecoes || {};
                        autoBackupPreviewContent.innerHTML = `
                            <div class="active-users-item">
                                <div><strong>Arquivo</strong>: ${escapeHtml(preview.nome || nome)}</div>
                                <div class="users-item-meta">Gerado em: ${escapeHtml(formatDateTime(preview.geradoEm || preview.criadoEm || ''))}</div>
                            </div>
                            <div class="active-users-item">
                                <div><strong>Registros</strong>: ${escapeHtml(c.registros?.total ?? 0)}</div>
                                <div class="users-item-meta">Faixa: ${escapeHtml(formatDateTime(c.registros?.primeiraData || ''))} até ${escapeHtml(formatDateTime(c.registros?.ultimaData || ''))}</div>
                            </div>
                            <div class="active-users-item">
                                <div><strong>Agendamentos</strong>: ${escapeHtml(c.agendamentos?.total ?? 0)}</div>
                                <div class="users-item-meta">Faixa: ${escapeHtml(formatDateTime(c.agendamentos?.primeiraData || ''))} até ${escapeHtml(formatDateTime(c.agendamentos?.ultimaData || ''))}</div>
                            </div>
                            <div class="active-users-item">
                                <div><strong>Pacientes</strong>: ${escapeHtml(c.pacientes?.total ?? 0)}</div>
                            </div>
                            <div class="active-users-item">
                                <div><strong>Ocorrências</strong>: ${escapeHtml(c.ocorrencias?.total ?? 0)}</div>
                                <div class="users-item-meta">Faixa: ${escapeHtml(formatDateTime(c.ocorrencias?.primeiraData || ''))} até ${escapeHtml(formatDateTime(c.ocorrencias?.ultimaData || ''))}</div>
                            </div>
                            <div class="active-users-item">
                                <div><strong>Ponto</strong>: ${escapeHtml(c.ponto?.totalRegistros ?? 0)} registros | ${escapeHtml(c.ponto?.totalFuncionarios ?? 0)} funcionários</div>
                            </div>
                        `;
                    }
                });
            });
        }
    }

    window.openAutoBackupModal = async function() {
        if (String(sessaoAtual?.role || '') !== 'admin') return;
        if (autoBackupModal) autoBackupModal.classList.add('active');
        await carregarBackupsAutomaticos();
    };

    if (autoBackupRestoreBtn) {
        autoBackupRestoreBtn.addEventListener('click', async () => {
            if (!selectedAutoBackupName) return;
            const confirmou = window.confirm(`Restaurar backup ${selectedAutoBackupName}? A base atual será substituída.`);
            if (!confirmou) return;
            const restore = await ipcRenderer.invoke('backup-restore-auto', selectedAutoBackupName);
            if (!restore?.ok) {
                if (autoBackupStatus) autoBackupStatus.textContent = restore?.message || 'Erro ao restaurar backup.';
                return;
            }
            if (autoBackupStatus) autoBackupStatus.textContent = 'Backup restaurado com sucesso. Recarregando...';
            setTimeout(() => window.location.reload(), 800);
        });
    }

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

    function escapeHtml(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function renderChatUnread(unread) {
        if (!chatUnreadBadge) return;
        const total = Math.max(0, Number(unread) || 0);
        chatUnreadState = total;
        if (total <= 0) {
            chatUnreadBadge.style.display = 'none';
            chatUnreadBadge.textContent = '0';
            if (chatFab) chatFab.classList.remove('has-alert');
            return;
        }
        chatUnreadBadge.style.display = 'inline-flex';
        chatUnreadBadge.textContent = String(total > 99 ? '99+' : total);
        if (chatFab && !chatPanel?.classList.contains('active')) {
            chatFab.classList.add('has-alert');
        }
    }

    function tocarSomNovaMensagem() {
        try {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return;
            const ctx = new Ctx();
            const oscillator = ctx.createOscillator();
            const gain = ctx.createGain();
            oscillator.type = 'sine';
            oscillator.frequency.value = 880;
            gain.gain.value = 0.05;
            oscillator.connect(gain);
            gain.connect(ctx.destination);
            oscillator.start();
            setTimeout(() => {
                oscillator.stop();
                ctx.close().catch(() => {});
            }, 120);
        } catch (error) {
            console.warn('Falha ao tocar alerta de chat:', error);
        }
    }

    function renderChatUsers() {
        if (!chatTargetSelect) return;
        const valorAtual = String(chatTargetSelect.value || '').toLowerCase();
        const meuUser = String(sessaoAtual?.username || '').toLowerCase();
        const options = ['<option value="">Todos</option>'];
        const usernamesDisponiveis = new Set();
        chatUsersState
            .filter((item) => String(item?.username || '').toLowerCase() !== meuUser)
            .forEach((item) => {
                const username = escapeHtml(item?.username || '');
                const nome = escapeHtml(item?.nome || item?.username || 'Usuário');
                usernamesDisponiveis.add(String(item?.username || '').toLowerCase());
                options.push(`<option value="${username}">${nome} (@${username})</option>`);
            });
        chatTargetSelect.innerHTML = options.join('');
        if (valorAtual && usernamesDisponiveis.has(valorAtual)) {
            chatTargetSelect.value = valorAtual;
        }
        atualizarRotuloDestinoChat();
    }

    function atualizarRotuloDestinoChat() {
        if (!chatTargetLabel) return;
        const targetUser = String(chatTargetSelect?.value || '').trim().toLowerCase();
        if (!targetUser) {
            chatTargetLabel.textContent = '(Todos)';
            return;
        }
        const alvo = chatUsersState.find((item) => String(item?.username || '').toLowerCase() === targetUser);
        const nome = String(alvo?.nome || alvo?.username || targetUser);
        chatTargetLabel.textContent = `(Para: ${nome})`;
    }

    async function carregarUsuariosChat() {
        const result = await ipcRenderer.invoke('chat-users');
        if (!result?.ok) {
            chatUsersState = [];
            renderChatUsers();
            return;
        }
        chatUsersState = Array.isArray(result.users) ? result.users : [];
        renderChatUsers();
    }

    async function carregarUsuariosOnlineChat() {
        const meuUser = String(sessaoAtual?.username || '').toLowerCase();
        const result = await ipcRenderer.invoke('auth-list-online-users');
        if (!result?.ok) {
            chatOnlineUsersSet = new Set(meuUser ? [meuUser] : []);
            return;
        }
        const usernames = Array.isArray(result.usernames) ? result.usernames : [];
        const base = usernames.map((u) => String(u || '').toLowerCase()).filter(Boolean);
        if (meuUser) base.push(meuUser);
        chatOnlineUsersSet = new Set(base);
    }

    function renderChatMessages(messages) {
        if (!chatMessages) return;
        const listaBase = Array.isArray(messages) ? messages : [];
        const meuUser = String(sessaoAtual?.username || '').toLowerCase();
        const targetUser = String(chatTargetSelect?.value || '').trim().toLowerCase();
        const lista = targetUser
            ? listaBase.filter((item) => {
                const fromUser = String(item?.from?.username || '').toLowerCase();
                const toUser = String(item?.to?.username || '').toLowerCase();
                const ehPrivada = Boolean(toUser);
                if (!ehPrivada) return false;
                const conversaDireta = (fromUser === meuUser && toUser === targetUser) || (fromUser === targetUser && toUser === meuUser);
                return conversaDireta;
            })
            : listaBase.filter((item) => !String(item?.to?.username || '').trim());
        if (lista.length === 0) {
            chatMessages.innerHTML = targetUser
                ? '<div class="search-status">Sem mensagens privadas com este usuário.</div>'
                : '<div class="search-status">Nenhuma mensagem ainda.</div>';
            return;
        }
        chatMessages.innerHTML = lista.map((item) => {
            const fromUser = String(item?.from?.username || '').toLowerCase();
            const fromNome = escapeHtml(item?.from?.nome || item?.from?.username || 'Usuário');
            const toUsername = String(item?.to?.username || '').toLowerCase();
            const toNome = escapeHtml(item?.to?.nome || item?.to?.username || '');
            const at = escapeHtml(formatDateTime(item?.at));
            const texto = escapeHtml(item?.text || '');
            const isMe = fromUser === meuUser;
            const fromOnline = isMe || chatOnlineUsersSet.has(fromUser);
            const dotClass = fromOnline ? 'is-online' : 'is-offline';
            const onlineTitle = fromOnline ? 'online' : 'offline';
            const privado = toUsername ? ` • privado ${toNome ? `para ${toNome}` : ''}` : '';
            return `
                <div class="chat-message ${isMe ? 'is-me' : ''}">
                    <div class="chat-message-meta"><span class="user-presence-dot ${dotClass}" title="${onlineTitle}"></span><strong>${fromNome}</strong> • ${at}${privado}</div>
                    <div>${texto}</div>
                </div>
            `;
        }).join('');
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    async function carregarChat() {
        if (!sessaoAtual) return;
        const result = await ipcRenderer.invoke('chat-list', { limit: 200 });
        if (!result?.ok) {
            if (chatMessages) chatMessages.innerHTML = `<div class="search-status">${escapeHtml(result?.message || 'Erro ao carregar chat.')}</div>`;
            return;
        }
        chatState = Array.isArray(result.messages) ? result.messages : [];
        renderChatMessages(chatState);
        const unread = Number(result.unread) || 0;
        const unreadAnterior = chatUnreadState;
        renderChatUnread(unread);
        if (unread > unreadAnterior && !chatPanel?.classList.contains('active')) {
            tocarSomNovaMensagem();
        }
        if (chatPanel?.classList.contains('active') && (Number(result.unread) || 0) > 0) {
            await ipcRenderer.invoke('chat-mark-read', { all: true });
            renderChatUnread(0);
        }
    }

    async function enviarMensagemChat() {
        const text = String(chatInput?.value || '').trim();
        if (!text) return;
        const toUsername = String(chatTargetSelect?.value || '').trim().toLowerCase();
        const result = await ipcRenderer.invoke('chat-send', { text, toUsername });
        if (!result?.ok) return;
        if (chatInput) chatInput.value = '';
        await carregarChat();
    }

    function abrirChat() {
        if (!chatPanel) return;
        chatPanel.classList.add('active');
        if (chatFab) chatFab.classList.remove('has-alert');
        carregarChat().then(() => ipcRenderer.invoke('chat-mark-read', { all: true })).catch(() => {});
        if (chatInput) setTimeout(() => chatInput.focus(), 0);
    }

    function fecharChat() {
        if (!chatPanel) return;
        chatPanel.classList.remove('active');
    }

    function obterFiltrosAuditoriaDaTela() {
        const usernameRaw = String(auditFilterUser?.value || selectedAuditUsername || '').trim().toLowerCase();
        return {
            username: usernameRaw.replace(/^@/, ''),
            acao: String(auditFilterAction?.value || '').trim(),
            tipo: String(auditFilterType?.value || '').trim(),
            dateFrom: String(auditFilterDateFrom?.value || '').trim(),
            dateTo: String(auditFilterDateTo?.value || '').trim(),
            search: String(auditFilterSearch?.value || '').trim(),
            limit: 5000,
            page: Number(auditPaginationState.page || 1),
            pageSize: Number(auditPaginationState.pageSize || 20)
        };
    }

    function aplicarFiltrosAuditoriaNaTela(filtro) {
        const base = (filtro && typeof filtro === 'object') ? filtro : {};
        if (auditFilterUser) auditFilterUser.value = String(base.username || '');
        if (auditFilterAction) auditFilterAction.value = String(base.acao || '');
        if (auditFilterType) auditFilterType.value = String(base.tipo || '');
        if (auditFilterDateFrom) auditFilterDateFrom.value = String(base.dateFrom || '');
        if (auditFilterDateTo) auditFilterDateTo.value = String(base.dateTo || '');
        if (auditFilterSearch) auditFilterSearch.value = String(base.search || '');
    }

    function filtrosAuditoriaAtivos(filtro) {
        const base = (filtro && typeof filtro === 'object') ? filtro : {};
        return Boolean(
            String(base.username || '').trim() ||
            String(base.acao || '').trim() ||
            String(base.tipo || '').trim() ||
            String(base.dateFrom || '').trim() ||
            String(base.dateTo || '').trim() ||
            String(base.search || '').trim()
        );
    }

    function renderAuditPagination() {
        const page = Math.max(1, Number(auditPaginationState.page) || 1);
        const totalPages = Math.max(1, Number(auditPaginationState.totalPages) || 1);
        const total = Math.max(0, Number(auditPaginationState.total) || 0);

        if (auditPageInfo) {
            auditPageInfo.textContent = `Página ${page} de ${totalPages} (${total} evento(s))`;
        }
        if (auditPrevPageBtn) {
            auditPrevPageBtn.disabled = page <= 1;
        }
        if (auditNextPageBtn) {
            auditNextPageBtn.disabled = page >= totalPages;
        }
    }

    window.runGlobalSearch = async function() {
        const termo = String(globalSearchInput?.value || '').trim();
        if (!termo) {
            if (globalSearchResults) globalSearchResults.innerHTML = '';
            if (globalSearchStatus) globalSearchStatus.textContent = 'Digite um termo para pesquisar.';
            return;
        }

        if (globalSearchStatus) globalSearchStatus.textContent = 'Pesquisando...';
        if (globalSearchResults) globalSearchResults.innerHTML = '';

        try {
            const resultados = await ipcRenderer.invoke('buscar-global', termo);
            if (!Array.isArray(resultados) || resultados.length === 0) {
                if (globalSearchStatus) globalSearchStatus.textContent = 'Nenhum resultado encontrado.';
                return;
            }

            if (globalSearchStatus) {
                globalSearchStatus.textContent = `${resultados.length} resultado(s) encontrado(s).`;
            }

            if (globalSearchResults) {
                globalSearchResults.innerHTML = resultados.map((item) => {
                    const titulo = escapeHtml(item.nomePaciente || 'Paciente sem nome');
                    const linha = [
                        item.origem ? `Origem: ${escapeHtml(item.origem)}` : '',
                        item.cpfPaciente ? `CPF: ${escapeHtml(item.cpfPaciente)}` : '',
                        item.prontuarioPaciente ? `Prontuário: ${escapeHtml(item.prontuarioPaciente)}` : '',
                        item.numeroAcesso ? `Acesso: ${escapeHtml(item.numeroAcesso)}` : ''
                    ].filter(Boolean).join(' | ');

                    return `
                        <div class="search-item">
                            <div>
                                <div><strong>${titulo}</strong></div>
                                <div class="search-item-meta">${linha}</div>
                            </div>
                            <button class="search-open-button" data-route="${escapeHtml(item.rota)}">Abrir</button>
                        </div>
                    `;
                }).join('');

                globalSearchResults.querySelectorAll('.search-open-button').forEach((button) => {
                    button.addEventListener('click', () => {
                        const rota = button.getAttribute('data-route');
                        if (rota) window.location.href = rota;
                    });
                });
            }
        } catch (error) {
            console.error('Erro na busca global:', error);
            if (globalSearchStatus) globalSearchStatus.textContent = 'Erro ao realizar a busca.';
        }
    };

    if (globalSearchInput) {
        globalSearchInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                window.runGlobalSearch();
            }
            if (event.key === 'Escape') {
                window.closeSearchModal();
            }
        });
    }

    function renderUsersList() {
        if (!usersList) return;

        const selectedId = String(userIdInput?.value || '');
        const onlineByUsername = new Map(
            (Array.isArray(activeUsersState) ? activeUsersState : []).map((item) => [String(item.username || '').toLowerCase(), item])
        );
        if (!Array.isArray(usersState) || usersState.length === 0) {
            usersList.innerHTML = '';
            if (usersStatus) usersStatus.textContent = 'Nenhum usuário cadastrado.';
            return;
        }

        usersList.innerHTML = usersState.map((item) => {
            const role = String(item.role || '');
            const activeLabel = item.active === false ? 'inativo' : 'ativo';
            const selectedClass = selectedId && String(item.id) === selectedId ? 'is-selected' : '';
            const username = String(item.username || '').toLowerCase();
            const meuUser = String(sessaoAtual?.username || '').toLowerCase();
            const isOnline = username === meuUser || onlineByUsername.has(username);
            const onlineLabel = isOnline ? 'online agora' : 'offline';
            const onlineClass = isOnline ? 'is-online' : 'is-offline';

            return `
                <div class="users-item ${selectedClass}">
                    <div>
                        <div><span class="user-presence-dot ${onlineClass}" title="${escapeHtml(onlineLabel)}"></span><strong>${escapeHtml(item.nome || item.username)}</strong> (@${escapeHtml(item.username)})</div>
                        <div class="users-item-meta">Perfil: ${escapeHtml(role)} | Status: ${escapeHtml(activeLabel)} | <span class="user-online-indicator ${onlineClass}">${escapeHtml(onlineLabel)}</span></div>
                    </div>
                    <button type="button" class="users-item-edit" data-user-id="${escapeHtml(item.id)}">Editar</button>
                </div>
            `;
        }).join('');

        usersList.querySelectorAll('.users-item-edit').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-user-id');
                const user = usersState.find((item) => String(item.id) === String(id));
                if (!user) return;

                userIdInput.value = String(user.id || '');
                userUsernameInput.value = String(user.username || '');
                userUsernameInput.readOnly = true;
                userNomeInput.value = String(user.nome || '');
                userRoleInput.value = String(user.role || 'recepcao');
                userActiveInput.checked = user.active !== false;
                userPasswordInput.value = '';
                if (usersStatus) usersStatus.textContent = `Editando usuário @${user.username}`;
                selectedAuditUsername = String(user.username || '').toLowerCase();
                auditFilterState = {
                    ...auditFilterState,
                    username: selectedAuditUsername
                };
                auditPaginationState.page = 1;
                aplicarFiltrosAuditoriaNaTela(auditFilterState);
                carregarAuditoriaRecente();
                renderUsersList();
            });
        });
    }

    async function carregarUsuarios() {
        if (usersStatus) usersStatus.textContent = 'Carregando usuários...';
        const result = await ipcRenderer.invoke('auth-list-users');
        if (!result?.ok) {
            if (usersStatus) usersStatus.textContent = result?.message || 'Erro ao carregar usuários.';
            usersState = [];
            renderUsersList();
            return;
        }

        usersState = Array.isArray(result.users) ? result.users : [];
        if (usersStatus) usersStatus.textContent = `${usersState.length} usuário(s) encontrado(s).`;
        renderUsersList();
    }

    function formatDateTime(isoDate) {
        if (!isoDate) return '-';
        const date = new Date(String(isoDate || ''));
        if (Number.isNaN(date.getTime())) {
            return 'horário inválido';
        }
        return date.toLocaleString('pt-BR');
    }

    function renderActiveUsersList(activeUsers) {
        if (!activeUsersList) return;
        const lista = Array.isArray(activeUsers) ? activeUsers : [];
        if (lista.length === 0) {
            activeUsersList.innerHTML = '';
            if (activeUsersStatus) activeUsersStatus.textContent = 'Nenhum usuário logado no momento.';
            return;
        }

        if (activeUsersStatus) activeUsersStatus.textContent = `${lista.length} sessão(ões) ativa(s).`;
        activeUsersList.innerHTML = lista.map((item) => {
            const nome = escapeHtml(item.nome || item.username || 'Usuário');
            const username = escapeHtml(item.username || '');
            const role = escapeHtml(item.role || '');
            const host = escapeHtml(item.hostname || 'host desconhecido');
            const loginAt = escapeHtml(formatDateTime(item.loginAt));
            const lastSeen = escapeHtml(formatDateTime(item.lastSeen));
            return `
                <div class="active-users-item">
                    <div><strong>${nome}</strong> (@${username})</div>
                    <div class="users-item-meta">Perfil: ${role} | Máquina: ${host}</div>
                    <div class="users-item-meta">Login: ${loginAt} | Última atividade: ${lastSeen}</div>
                </div>
            `;
        }).join('');
    }

    function renderAuditList(logs) {
        if (!auditList) return;
        const lista = Array.isArray(logs) ? logs : [];
        if (lista.length === 0) {
            auditList.innerHTML = '';
            if (auditStatus) auditStatus.textContent = 'Sem eventos recentes.';
            return;
        }
        if (auditStatus) auditStatus.textContent = `${lista.length} evento(s) recente(s).`;
        auditList.innerHTML = lista.map((log) => {
            const at = formatDateTime(log?.at);
            const actor = escapeHtml(log?.actor?.username || 'system');
            const acao = escapeHtml(log?.acao || 'acao');
            const tipo = escapeHtml(log?.tipo || '-');
            const detalhe = escapeHtml(log?.detalhe || '');
            return `
                <div class="active-users-item">
                    <div><strong>${actor}</strong> | ${acao} em ${tipo}</div>
                    <div class="users-item-meta">${escapeHtml(at)}</div>
                    ${detalhe ? `<div class="users-item-meta">${detalhe}</div>` : ''}
                </div>
            `;
        }).join('');
    }

    async function carregarUsuariosAtivos() {
        if (String(sessaoAtual?.role || '') !== 'admin') return;
        if (activeUsersStatus) activeUsersStatus.textContent = 'Atualizando sessões ativas...';
        const result = await ipcRenderer.invoke('auth-list-active-users');
        if (!result?.ok) {
            if (activeUsersStatus) activeUsersStatus.textContent = result?.message || 'Erro ao carregar sessões ativas.';
            if (activeUsersList) activeUsersList.innerHTML = '';
            activeUsersState = [];
            renderUsersList();
            return;
        }
        activeUsersState = Array.isArray(result.activeUsers) ? result.activeUsers : [];
        renderActiveUsersList(result.activeUsers);
        renderUsersList();
    }

    async function carregarAuditoriaRecente() {
        if (String(sessaoAtual?.role || '') !== 'admin') return;
        if (auditStatus) auditStatus.textContent = 'Atualizando auditoria...';
        const filtrosTela = obterFiltrosAuditoriaDaTela();
        const usernameSelecionado = String(selectedAuditUsername || '').trim().toLowerCase();
        if (!filtrosTela.username && usernameSelecionado) {
            filtrosTela.username = usernameSelecionado;
        }
        auditFilterState = { ...auditFilterState, ...filtrosTela };
        const usarFiltro = filtrosAuditoriaAtivos(auditFilterState);
        const result = usarFiltro
            ? await ipcRenderer.invoke('audit-query', auditFilterState)
            : await ipcRenderer.invoke('audit-query', auditFilterState);
        if (!result?.ok) {
            if (auditStatus) auditStatus.textContent = result?.message || 'Erro ao carregar auditoria.';
            if (auditList) auditList.innerHTML = '';
            if (exportUserAuditBtn) {
                exportUserAuditBtn.disabled = true;
                exportUserAuditBtn.style.display = 'none';
            }
            auditPaginationState.total = 0;
            auditPaginationState.totalPages = 1;
            renderAuditPagination();
            return;
        }
        auditPaginationState.total = Number(result.total) || 0;
        auditPaginationState.page = Math.max(1, Number(result?.pagination?.page) || auditPaginationState.page);
        auditPaginationState.totalPages = Math.max(1, Number(result?.pagination?.totalPages) || 1);
        aplicarFiltrosAuditoriaNaTela(auditFilterState);
        const username = String(auditFilterState.username || '').trim().toLowerCase();
        if (auditStatus) {
            if (username) {
                auditStatus.textContent = `Exibindo ${result.total || 0} alteração(ões) de @${username}.`;
            } else if (usarFiltro) {
                auditStatus.textContent = `Exibindo ${result.total || 0} alteração(ões) com filtros aplicados.`;
            } else {
                auditStatus.textContent = 'Exibindo últimas alterações gerais.';
            }
        }
        if (exportUserAuditBtn) {
            exportUserAuditBtn.disabled = !username;
            exportUserAuditBtn.style.display = username ? 'inline-flex' : 'none';
        }
        renderAuditList(result.logs);
        renderAuditPagination();
    }

    function atualizarDashboardUI(summary) {
        const base = (summary && typeof summary === 'object') ? summary : {};
        if (dashRegistrosHoje) dashRegistrosHoje.textContent = String(base.registrosHoje || 0);
        if (dashAgendamentosHoje) dashAgendamentosHoje.textContent = String(base.agendamentosHoje || 0);
        if (dashPendencias) dashPendencias.textContent = String(base.pendenciasOcorrencias || 0);
        if (dashUsuariosAtivos) dashUsuariosAtivos.textContent = String(base.usuariosAtivos || 0);

        if (homeAlertsList) {
            const alertasDetalhados = Array.isArray(base.alertasDetalhados) ? base.alertasDetalhados : [];
            const alertas = alertasDetalhados.length > 0
                ? alertasDetalhados
                : (Array.isArray(base.alertas) ? base.alertas.map((mensagem) => ({ tipo: 'sistema', mensagem })) : []);

            if (alertas.length === 0) {
                homeAlertsList.textContent = 'Sem alertas no momento.';
                return;
            }
            homeAlertsList.innerHTML = alertas.map((item) => {
                const msg = escapeHtml(item?.mensagem || '');
                const tipo = String(item?.tipo || '');
                const ocorrenciaId = String(item?.ocorrenciaId || '');
                const action = (tipo === 'pendencia-ocorrencia' && ocorrenciaId)
                    ? `<button class="search-open-button home-alert-open" data-ocorrencia-id="${escapeHtml(ocorrenciaId)}">Abrir</button>`
                    : '';
                return `<div class="home-alert-item"><span>- ${msg}</span>${action}</div>`;
            }).join('');

            homeAlertsList.querySelectorAll('.home-alert-open').forEach((button) => {
                button.addEventListener('click', () => {
                    const id = String(button.getAttribute('data-ocorrencia-id') || '').trim();
                    if (!id) return;
                    window.location.href = `ocorrencias/ocorrencias.html?pendencia_id=${encodeURIComponent(id)}`;
                });
            });
        }
    }

    async function carregarDashboard() {
        if (!sessaoAtual) return;
        const result = await ipcRenderer.invoke('dashboard-summary');
        if (!result?.ok) {
            if (homeAlertsList) homeAlertsList.textContent = result?.message || 'Erro ao carregar dashboard.';
            return;
        }
        atualizarDashboardUI(result.summary);
    }

    function iniciarPollingDashboard() {
        if (dashboardPollTimer) {
            clearInterval(dashboardPollTimer);
        }
        dashboardPollTimer = setInterval(() => {
            carregarDashboard().catch((error) => {
                console.error('Erro ao atualizar dashboard:', error);
            });
        }, 15000);
    }

    window.resetUserForm = function() {
        if (!userForm) return;
        userForm.reset();
        userIdInput.value = '';
        userUsernameInput.readOnly = false;
        userRoleInput.value = 'recepcao';
        userActiveInput.checked = true;
        selectedAuditUsername = '';
        auditFilterState = {
            username: '',
            acao: '',
            tipo: '',
            dateFrom: '',
            dateTo: '',
            search: '',
            limit: 5000
        };
        auditPaginationState = {
            page: 1,
            pageSize: 20,
            total: 0,
            totalPages: 1
        };
        aplicarFiltrosAuditoriaNaTela(auditFilterState);
        renderAuditPagination();
        if (usersStatus) usersStatus.textContent = 'Novo usuário';
        renderUsersList();
        carregarAuditoriaRecente();
    };

    window.openUsersModal = async function() {
        if (String(sessaoAtual?.role || '') !== 'admin') {
            return;
        }
        if (usersModal) usersModal.classList.add('active');
        window.resetUserForm();
        await carregarUsuarios();
        await carregarUsuariosAtivos();
        await carregarAuditoriaRecente();
        if (activeUsersPollTimer) clearInterval(activeUsersPollTimer);
        activeUsersPollTimer = setInterval(() => {
            if (!usersModal?.classList.contains('active')) return;
            Promise.all([carregarUsuariosAtivos(), carregarAuditoriaRecente()]).catch((error) => {
                console.error('Erro ao atualizar monitoramento administrativo:', error);
            });
        }, 10000);
    };

    window.deleteSelectedUser = async function() {
        const selectedId = String(userIdInput?.value || '');
        if (!selectedId) {
            if (usersStatus) usersStatus.textContent = 'Selecione um usuário para excluir.';
            return;
        }

        usersState = usersState.filter((item) => String(item.id) !== selectedId);
        const result = await ipcRenderer.invoke('auth-save-users', usersState);
        if (!result?.ok) {
            if (usersStatus) usersStatus.textContent = result?.message || 'Erro ao excluir usuário.';
            await carregarUsuarios();
            return;
        }

        if (usersStatus) usersStatus.textContent = 'Usuário excluído com sucesso.';
        window.resetUserForm();
        await carregarUsuarios();
    };

    if (userForm) {
        userForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            const id = String(userIdInput?.value || '');
            const username = String(userUsernameInput?.value || '').trim().toLowerCase();
            const nome = String(userNomeInput?.value || '').trim();
            const role = String(userRoleInput?.value || '').trim().toLowerCase();
            const password = String(userPasswordInput?.value || '');
            const active = Boolean(userActiveInput?.checked);

            if (!username || !nome || !role) {
                if (usersStatus) usersStatus.textContent = 'Preencha usuário, nome e perfil.';
                return;
            }

            if (!id && !password) {
                if (usersStatus) usersStatus.textContent = 'Informe senha para novo usuário.';
                return;
            }

            const payload = [...usersState];
            const index = payload.findIndex((item) => String(item.id) === id);
            const userData = {
                id: id || `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
                username,
                nome,
                role,
                active
            };

            if (password) {
                userData.password = password;
            }

            if (index >= 0) {
                payload[index] = { ...payload[index], ...userData };
            } else {
                payload.push(userData);
            }

            const result = await ipcRenderer.invoke('auth-save-users', payload);
            if (!result?.ok) {
                if (usersStatus) usersStatus.textContent = result?.message || 'Erro ao salvar usuário.';
                return;
            }

            if (usersStatus) usersStatus.textContent = 'Usuário salvo com sucesso.';
            usersState = payload.map((item) => ({ ...item, password: undefined }));
            window.resetUserForm();
            await carregarUsuarios();
        });
    }

    async function logout() {
        try {
            await ipcRenderer.invoke('auth-logout');
        } catch (error) {
            console.error('Erro ao finalizar sessão:', error);
        } finally {
            window.location.href = 'auth/login.html';
        }
    }

    function aplicarControleDeAcessoHome() {
        const permitidos = new Set(getModulesPermitidos());
        const role = String(sessaoAtual?.role || '').toLowerCase();

        if (sessionInfo) {
            const nome = sessaoAtual?.nome || sessaoAtual?.username || 'Usuário';
            sessionInfo.textContent = `${nome} (${role || 'sem perfil'})`;
        }

        if (configBtn) {
            configBtn.style.display = role === 'tecnico' ? 'none' : '';
        }

        if (manageUsersBtn) {
            manageUsersBtn.style.display = role === 'admin' ? '' : 'none';
        }

        if (manageAutoBackupBtn) {
            manageAutoBackupBtn.style.display = role === 'admin' ? '' : 'none';
        }

        if (homeDashboardSection) {
            homeDashboardSection.style.display = role === 'admin' ? '' : 'none';
        }

        if (homeAlertsSection) {
            homeAlertsSection.style.display = role === 'admin' ? '' : 'none';
        }

        if (deleteUserBtn) {
            deleteUserBtn.disabled = role !== 'admin';
        }

        moduleCards.forEach((card) => {
            const moduleId = String(card.getAttribute('data-module') || '');
            const route = String(card.getAttribute('data-route') || '');
            const autorizado = permitidos.has(moduleId);

            if (!autorizado) {
                card.classList.add('no-access');
                card.title = 'Sem permissão para este módulo';
            } else {
                card.classList.remove('no-access');
                card.title = '';
            }

            card.onclick = () => {
                if (!autorizado || !route) return;
                window.location.href = route;
            };
        });
    }

    async function iniciarSessao() {
        const session = await ipcRenderer.invoke('auth-get-session');
        if (!session) {
            window.location.href = 'auth/login.html';
            return false;
        }
        sessaoAtual = session;
        aplicarControleDeAcessoHome();
        const role = String(sessaoAtual?.role || '').toLowerCase();
        if (role === 'admin') {
            await carregarDashboard();
            iniciarPollingDashboard();
        }
        await carregarUsuariosChat();
        await carregarUsuariosOnlineChat();
        await carregarChat();
        if (chatPollTimer) clearInterval(chatPollTimer);
        chatPollTimer = setInterval(() => {
            Promise.all([carregarChat(), carregarUsuariosChat(), carregarUsuariosOnlineChat()]).catch((error) => {
                console.error('Erro ao atualizar chat:', error);
            });
        }, 5000);
        return true;
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }

    if (chatFab) {
        chatFab.addEventListener('click', () => {
            if (!chatPanel?.classList.contains('active')) {
                abrirChat();
            } else {
                fecharChat();
            }
        });
    }

    if (chatCloseBtn) {
        chatCloseBtn.addEventListener('click', fecharChat);
    }

    if (chatForm) {
        chatForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            await enviarMensagemChat();
        });
    }

    if (chatTargetSelect) {
        chatTargetSelect.addEventListener('change', () => {
            atualizarRotuloDestinoChat();
            renderChatMessages(chatState);
        });
    }

    if (exportUserAuditBtn) {
        exportUserAuditBtn.addEventListener('click', async () => {
            const filtros = obterFiltrosAuditoriaDaTela();
            const username = String(filtros.username || selectedAuditUsername || '').trim().toLowerCase();
            if (!username) {
                if (auditStatus) auditStatus.textContent = 'Selecione um usuário para exportar o log.';
                return;
            }
            if (auditStatus) auditStatus.textContent = `Exportando log de @${username}...`;
            const result = await ipcRenderer.invoke('audit-export-user', { username });
            if (!result?.ok) {
                if (auditStatus) auditStatus.textContent = result?.message || 'Erro ao exportar log do usuário.';
                return;
            }
            if (auditStatus) auditStatus.textContent = `Log de @${username} exportado com sucesso (${result.total || 0} evento(s)).`;
        });
    }

    if (applyAuditFilterBtn) {
        applyAuditFilterBtn.addEventListener('click', async () => {
            auditFilterState = obterFiltrosAuditoriaDaTela();
            selectedAuditUsername = String(auditFilterState.username || '').trim().toLowerCase();
            auditPaginationState.page = 1;
            await carregarAuditoriaRecente();
            renderUsersList();
        });
    }

    if (clearAuditFilterBtn) {
        clearAuditFilterBtn.addEventListener('click', async () => {
            selectedAuditUsername = '';
            auditFilterState = {
                username: '',
                acao: '',
                tipo: '',
                dateFrom: '',
                dateTo: '',
                search: '',
                limit: 5000
            };
            auditPaginationState.page = 1;
            aplicarFiltrosAuditoriaNaTela(auditFilterState);
            await carregarAuditoriaRecente();
            renderUsersList();
        });
    }

    if (exportAuditCsvBtn) {
        exportAuditCsvBtn.addEventListener('click', async () => {
            auditFilterState = obterFiltrosAuditoriaDaTela();
            if (auditStatus) auditStatus.textContent = 'Exportando auditoria em CSV...';
            const result = await ipcRenderer.invoke('audit-export-csv', auditFilterState);
            if (!result?.ok) {
                if (auditStatus) auditStatus.textContent = result?.message || 'Erro ao exportar auditoria CSV.';
                return;
            }
            if (auditStatus) auditStatus.textContent = `CSV exportado com sucesso (${result.total || 0} evento(s)).`;
        });
    }

    if (auditPrevPageBtn) {
        auditPrevPageBtn.addEventListener('click', async () => {
            if (auditPaginationState.page <= 1) return;
            auditPaginationState.page -= 1;
            await carregarAuditoriaRecente();
        });
    }

    if (auditNextPageBtn) {
        auditNextPageBtn.addEventListener('click', async () => {
            if (auditPaginationState.page >= auditPaginationState.totalPages) return;
            auditPaginationState.page += 1;
            await carregarAuditoriaRecente();
        });
    }

    window.addEventListener('beforeunload', () => {
        if (activeUsersPollTimer) clearInterval(activeUsersPollTimer);
        if (dashboardPollTimer) clearInterval(dashboardPollTimer);
        if (chatPollTimer) clearInterval(chatPollTimer);
    });

    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) window.changeTheme(savedTheme);

    ipcRenderer.on('apply-theme', (event, theme) => {
        window.changeTheme(theme);
    });

    iniciarSessao().catch((error) => {
        console.error('Falha ao iniciar sessão:', error);
        window.location.href = 'auth/login.html';
    });
} catch (error) {
    console.error('Erro na inicialização:', error);
}
