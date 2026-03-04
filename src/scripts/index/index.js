try {
    const { ipcRenderer } = require('electron');

    const modal = document.getElementById('configModal');
    const configBtn = document.getElementById('configBtn');
    const closeBtn = document.querySelector('#configModal .close');

    const exportModal = document.getElementById('exportModal');
    const backupModal = document.getElementById('backupModal');
    const importModal = document.getElementById('importModal');
    const searchModal = document.getElementById('searchModal');
    const globalSearchInput = document.getElementById('globalSearchInput');
    const globalSearchResults = document.getElementById('globalSearchResults');
    const globalSearchStatus = document.getElementById('globalSearchStatus');
    const usersModal = document.getElementById('usersModal');
    const usersStatus = document.getElementById('usersStatus');
    const usersList = document.getElementById('usersList');
    const userForm = document.getElementById('userForm');
    const userIdInput = document.getElementById('userId');
    const userUsernameInput = document.getElementById('userUsername');
    const userNomeInput = document.getElementById('userNome');
    const userRoleInput = document.getElementById('userRole');
    const userPasswordInput = document.getElementById('userPassword');
    const userActiveInput = document.getElementById('userActive');
    const deleteUserBtn = document.getElementById('deleteUserBtn');
    const manageUsersBtn = document.getElementById('manageUsersBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const sessionInfo = document.getElementById('sessionInfo');
    const moduleCards = Array.from(document.querySelectorAll('.button-group1[data-module]'));

    const PERMISSOES = {
        admin: ['agendamento', 'registros', 'ocorrencias', 'ponto'],
        recepcao: ['agendamento', 'registros', 'ocorrencias', 'ponto'],
        tecnico: ['registros', 'ocorrencias', 'ponto']
    };

    let sessaoAtual = null;
    let usersState = [];

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

    window.closeImportModal = function() {
        if (importModal) importModal.classList.remove('active');
    };

    window.closeSearchModal = function() {
        if (searchModal) searchModal.classList.remove('active');
    };

    window.closeUsersModal = function() {
        if (usersModal) usersModal.classList.remove('active');
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
        if (!Array.isArray(usersState) || usersState.length === 0) {
            usersList.innerHTML = '';
            if (usersStatus) usersStatus.textContent = 'Nenhum usuário cadastrado.';
            return;
        }

        usersList.innerHTML = usersState.map((item) => {
            const role = String(item.role || '');
            const activeLabel = item.active === false ? 'inativo' : 'ativo';
            const selectedClass = selectedId && String(item.id) === selectedId ? 'is-selected' : '';

            return `
                <div class="users-item ${selectedClass}">
                    <div>
                        <div><strong>${escapeHtml(item.nome || item.username)}</strong> (@${escapeHtml(item.username)})</div>
                        <div class="users-item-meta">Perfil: ${escapeHtml(role)} | Status: ${escapeHtml(activeLabel)}</div>
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

    window.resetUserForm = function() {
        if (!userForm) return;
        userForm.reset();
        userIdInput.value = '';
        userUsernameInput.readOnly = false;
        userRoleInput.value = 'recepcao';
        userActiveInput.checked = true;
        if (usersStatus) usersStatus.textContent = 'Novo usuário';
        renderUsersList();
    };

    window.openUsersModal = async function() {
        if (String(sessaoAtual?.role || '') !== 'admin') {
            return;
        }
        if (usersModal) usersModal.classList.add('active');
        window.resetUserForm();
        await carregarUsuarios();
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
        return true;
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }

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
