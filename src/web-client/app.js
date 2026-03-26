const state = {
    token: localStorage.getItem('portal_client_token') || '',
    client: null,
    assignedAttendant: null,
    attendantsOnline: [],
    appointments: [],
    reports: [],
    pendingAttachment: null
};

let chatPollTimer = null;

const els = {
    authView: document.getElementById('authView'),
    appView: document.getElementById('appView'),
    authMessage: document.getElementById('authMessage'),
    scheduleMessage: document.getElementById('scheduleMessage'),
    chatMessage: document.getElementById('chatMessage'),
    clientName: document.getElementById('clientName'),
    clientMeta: document.getElementById('clientMeta'),
    metricNext: document.getElementById('metricNext'),
    metricAppointments: document.getElementById('metricAppointments'),
    metricReports: document.getElementById('metricReports'),
    metricPending: document.getElementById('metricPending'),
    appointmentList: document.getElementById('appointmentList'),
    reportList: document.getElementById('reportList'),
    chatMessages: document.getElementById('chatMessages'),
    chatRoutingStatus: document.getElementById('chatRoutingStatus'),
    chatAttachmentInput: document.getElementById('chatAttachmentInput'),
    chatAttachBtn: document.getElementById('chatAttachBtn'),
    chatDetachBtn: document.getElementById('chatDetachBtn'),
    chatClearBtn: document.getElementById('chatClearBtn'),
    scheduleDoctor: document.getElementById('scheduleDoctor'),
    scheduleDate: document.getElementById('scheduleDate'),
    scheduleTime: document.getElementById('scheduleTime')
};

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatBytes(bytes) {
    const total = Number(bytes) || 0;
    if (total < 1024) return `${total} B`;
    if (total < 1024 * 1024) return `${(total / 1024).toFixed(1)} KB`;
    return `${(total / (1024 * 1024)).toFixed(1)} MB`;
}

function attachmentUrl(messageId) {
    const token = encodeURIComponent(String(state.token || ''));
    return `/cliente/api/chat/attachments/${encodeURIComponent(String(messageId || ''))}?token=${token}`;
}

function updateChatAttachmentUI() {
    if (!els.chatAttachBtn || !els.chatDetachBtn) return;
    if (!state.pendingAttachment) {
        els.chatAttachBtn.textContent = 'Anexar';
        els.chatDetachBtn.classList.add('is-hidden');
        if (els.chatAttachmentInput) els.chatAttachmentInput.value = '';
        return;
    }
    const label = String(state.pendingAttachment.name || 'arquivo');
    els.chatAttachBtn.textContent = label.length > 18 ? `${label.slice(0, 15)}...` : label;
    els.chatDetachBtn.classList.remove('is-hidden');
}

function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = String(reader.result || '');
            const base64 = result.includes(',') ? result.split(',').pop() : result;
            resolve(base64 || '');
        };
        reader.onerror = () => reject(new Error('Nao foi possivel ler o arquivo selecionado.'));
        reader.readAsDataURL(file);
    });
}

async function api(path, options = {}) {
    let response;
    try {
        response = await fetch(`/cliente/api${path}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
                ...(options.headers || {})
            }
        });
    } catch (error) {
        throw new Error('Nao foi possivel conectar ao portal. Verifique se o servidor esta em execucao.');
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/pdf')) {
        return response.blob();
    }

    const data = await response.json();
    if (!response.ok || data?.ok === false) {
        throw new Error(data?.message || 'Falha na requisicao.');
    }
    return data;
}

function setMessage(target, text, isError = false) {
    if (!target) return;
    target.textContent = text || '';
    target.style.color = isError ? '#b42318' : '';
}

function toggleAuth(showRegister) {
    document.getElementById('loginForm').classList.toggle('is-hidden', showRegister);
    document.getElementById('registerForm').classList.toggle('is-hidden', !showRegister);
    document.getElementById('showLoginBtn').classList.toggle('is-active', !showRegister);
    document.getElementById('showRegisterBtn').classList.toggle('is-active', showRegister);
    setMessage(els.authMessage, '');
}

function toggleApp(isLogged) {
    els.authView.classList.toggle('is-hidden', isLogged);
    els.appView.classList.toggle('is-hidden', !isLogged);
}

function formatDateTime(value) {
    const parsed = Date.parse(String(value || ''));
    if (!Number.isFinite(parsed)) return '-';
    return new Date(parsed).toLocaleString('pt-BR');
}

function renderOverview() {
    if (!state.client) return;
    els.clientName.textContent = state.client.nome || 'Cliente';
    els.clientMeta.textContent = `${state.client.email} • Prontuario ${state.client.prontuarioPaciente || '-'}`;
    els.metricAppointments.textContent = String(state.appointments.length);
    els.metricReports.textContent = String(state.reports.length);
    const pending = state.appointments.filter((item) => String(item?.statusExame || '').toLowerCase() === 'agendado').length;
    els.metricPending.textContent = String(pending);
    const next = state.appointments.find((item) => Date.parse(String(item?.dataHora || '')) >= Date.now() && String(item?.statusExame || '').toLowerCase() !== 'cancelado');
    els.metricNext.textContent = next ? formatDateTime(next.dataHora) : 'Sem agendamento';

    if (state.appointments.length === 0) {
        els.appointmentList.innerHTML = '<div class="empty-state">Nenhum agendamento ainda. Use a aba Agendar para solicitar seu proximo exame.</div>';
        return;
    }

    els.appointmentList.innerHTML = state.appointments.map((item) => `
        <div class="appointment-item">
            <strong>${item.exame || 'Exame nao informado'}</strong>
            <div class="list-meta">${item.modalidade || '-'} • ${formatDateTime(item.dataHora)}</div>
            <div class="list-meta">Profissional: ${item.nomeTecnico || '-'} • Status: ${item.statusExame || '-'}</div>
        </div>
    `).join('');
}

function renderReports() {
    if (state.reports.length === 0) {
        els.reportList.innerHTML = '<div class="empty-state">Seus laudos digitais aparecerao aqui quando o exame estiver concluido.</div>';
        return;
    }

    els.reportList.innerHTML = state.reports.map((item) => `
        <div class="report-item">
            <strong>${item.exame || 'Laudo digital'}</strong>
            <div class="list-meta">${item.modalidade || '-'} • ${formatDateTime(item.dataHora)}</div>
            <div class="list-meta">Acesso: ${item.numeroAcesso || '-'} • ${item.nomeTecnico || '-'}</div>
            <button class="download-btn" type="button" data-download-id="${item.id}">Baixar PDF</button>
        </div>
    `).join('');

    els.reportList.querySelectorAll('[data-download-id]').forEach((button) => {
        button.addEventListener('click', async () => {
            const id = button.getAttribute('data-download-id');
            try {
                const blob = await api(`/reports/${encodeURIComponent(id)}/download`);
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `${id}.pdf`;
                link.click();
                URL.revokeObjectURL(url);
            } catch (error) {
                setMessage(els.chatMessage, error.message, true);
            }
        });
    });
}

function renderChatRouting() {
    const sendButton = document.querySelector('#chatForm button[type="submit"]');
    if (!els.chatRoutingStatus) return;
    if (!state.assignedAttendant) {
        els.chatRoutingStatus.textContent = 'No momento nao ha atendente online. Assim que alguem entrar, a conversa sera iniciada.';
        if (sendButton) sendButton.disabled = true;
        if (els.chatAttachBtn) els.chatAttachBtn.disabled = true;
        return;
    }
    if (sendButton) sendButton.disabled = false;
    if (els.chatAttachBtn) els.chatAttachBtn.disabled = false;
    const totalOnline = Array.isArray(state.attendantsOnline) ? state.attendantsOnline.length : 0;
    els.chatRoutingStatus.textContent = `Atendimento com ${state.assignedAttendant.nome || state.assignedAttendant.username}. ${totalOnline} atendente(s) online.`;
}

function startChatPolling() {
    if (chatPollTimer) {
        clearInterval(chatPollTimer);
    }
    chatPollTimer = setInterval(() => {
        if (!state.token) return;
        loadChat().catch(() => {});
    }, 5000);
}

function stopChatPolling() {
    if (!chatPollTimer) return;
    clearInterval(chatPollTimer);
    chatPollTimer = null;
}

async function loadChat() {
    const data = await api('/chat/messages');
    state.assignedAttendant = data.attendant || null;
    state.attendantsOnline = data.attendantsOnline || [];
    renderChatRouting();

    const messages = Array.isArray(data.messages) ? data.messages : [];
    if (messages.length === 0) {
        els.chatMessages.innerHTML = '<div class="empty-state">Ainda nao ha mensagens nesta conversa.</div>';
        return;
    }
    const me = String(state.client?.username || '').toLowerCase();
    els.chatMessages.innerHTML = messages.map((item) => `
        <div class="chat-message ${String(item?.from?.username || '').toLowerCase() === me ? 'is-me' : ''}">
            <strong>${escapeHtml(item?.from?.nome || item?.from?.username || 'Atendimento')}</strong>
            <div class="chat-meta">${formatDateTime(item?.at)}</div>
            <div>${escapeHtml(item?.text || '')}</div>
            ${item?.attachment?.path ? `
                <div class="chat-attachment">
                    ${String(item?.attachment?.kind || '').toLowerCase() === 'image'
                        ? `<a class="chat-attachment-link" href="${attachmentUrl(item?.id)}" target="_blank" rel="noreferrer"><img class="chat-attachment-image" src="${attachmentUrl(item?.id)}" alt="${escapeHtml(item?.attachment?.name || 'Imagem enviada')}"></a>`
                        : `<a class="chat-attachment-link" href="${attachmentUrl(item?.id)}" target="_blank" rel="noreferrer">Abrir PDF: ${escapeHtml(item?.attachment?.name || 'arquivo.pdf')}</a>`
                    }
                    <div class="chat-meta">${escapeHtml(formatBytes(item?.attachment?.size || 0))}</div>
                </div>
            ` : ''}
        </div>
    `).join('');
    els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
}

async function loadScheduleOptions() {
    const medicoId = els.scheduleDoctor.value;
    const date = els.scheduleDate.value;
    const data = await api(`/appointments/options?medicoId=${encodeURIComponent(medicoId)}&date=${encodeURIComponent(date)}`);
    const doctors = Array.isArray(data.doctors) ? data.doctors : [];
    els.scheduleDoctor.innerHTML = doctors.map((item) => `<option value="${item.id}">${item.nome}</option>`).join('');
    const selectedDoctorId = doctors.some((item) => item.id === medicoId) ? medicoId : (doctors[0]?.id || '');
    if (selectedDoctorId) {
        els.scheduleDoctor.value = selectedDoctorId;
    }
    if (!medicoId && selectedDoctorId && date) {
        return loadScheduleOptions();
    }
    const slots = Array.isArray(data.slots) ? data.slots : [];
    els.scheduleTime.innerHTML = slots.length > 0
        ? slots.map((slot) => `<option value="${slot}">${slot}</option>`).join('')
        : '<option value="">Sem horarios disponiveis</option>';
}

async function refreshData() {
    const [sessionData, dashboardData, attendantsData, appointmentsData, reportsData] = await Promise.all([
        api('/session'),
        api('/dashboard'),
        api('/attendants'),
        api('/appointments'),
        api('/reports')
    ]);

    state.client = sessionData.client;
    state.assignedAttendant = attendantsData.attendant || null;
    state.attendantsOnline = attendantsData.attendantsOnline || [];
    state.appointments = appointmentsData.appointments || [];
    state.reports = reportsData.reports || [];

    renderChatRouting();
    renderOverview();
    renderReports();
    els.metricPending.textContent = String(dashboardData.summary?.pendentes || 0);
    els.metricReports.textContent = String(dashboardData.summary?.totalLaudos || state.reports.length);
    els.metricAppointments.textContent = String(dashboardData.summary?.totalAgendamentos || state.appointments.length);
    els.metricNext.textContent = dashboardData.summary?.proximoAgendamento ? formatDateTime(dashboardData.summary.proximoAgendamento.dataHora) : 'Sem agendamento';
    await loadScheduleOptions();
    await loadChat();
}

function activateTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach((button) => {
        button.classList.toggle('is-active', button.dataset.tab === tabId);
    });
    document.querySelectorAll('.tab-panel').forEach((panel) => {
        panel.classList.toggle('is-active', panel.id === `tab-${tabId}`);
    });
}

async function handleAuthSuccess(data) {
    state.token = data.token;
    localStorage.setItem('portal_client_token', state.token);
    toggleApp(true);
    await refreshData();
    startChatPolling();
}

document.getElementById('showLoginBtn').addEventListener('click', () => toggleAuth(false));
document.getElementById('showRegisterBtn').addEventListener('click', () => toggleAuth(true));

document.getElementById('loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
        setMessage(els.authMessage, 'Entrando...');
        const data = await api('/auth/login', {
            method: 'POST',
            body: JSON.stringify({
                email: document.getElementById('loginEmail').value,
                password: document.getElementById('loginPassword').value
            })
        });
        await handleAuthSuccess(data);
    } catch (error) {
        setMessage(els.authMessage, error.message, true);
    }
});

document.getElementById('registerForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
        setMessage(els.authMessage, 'Criando conta...');
        const data = await api('/auth/register', {
            method: 'POST',
            body: JSON.stringify({
                nome: document.getElementById('registerNome').value,
                email: document.getElementById('registerEmail').value,
                password: document.getElementById('registerPassword').value,
                cpf: document.getElementById('registerCpf').value,
                telefone: document.getElementById('registerTelefone').value,
                dataNascimento: document.getElementById('registerNascimento').value,
                endereco: document.getElementById('registerEndereco').value,
                planoPaciente: document.getElementById('registerPlano').value
            })
        });
        await handleAuthSuccess(data);
    } catch (error) {
        setMessage(els.authMessage, error.message, true);
    }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
    try {
        await api('/auth/logout', { method: 'POST' });
    } catch (error) {
        // noop
    }
    state.token = '';
    state.client = null;
    state.assignedAttendant = null;
    state.attendantsOnline = [];
    state.pendingAttachment = null;
    localStorage.removeItem('portal_client_token');
    stopChatPolling();
    updateChatAttachmentUI();
    toggleApp(false);
});

document.querySelectorAll('.tab-btn').forEach((button) => {
    button.addEventListener('click', () => activateTab(button.dataset.tab));
});

els.scheduleDoctor.addEventListener('change', () => loadScheduleOptions().catch((error) => setMessage(els.scheduleMessage, error.message, true)));
els.scheduleDate.addEventListener('change', () => loadScheduleOptions().catch((error) => setMessage(els.scheduleMessage, error.message, true)));

document.getElementById('scheduleForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
        const data = await api('/appointments', {
            method: 'POST',
            body: JSON.stringify({
                medicoId: els.scheduleDoctor.value,
                date: els.scheduleDate.value,
                time: els.scheduleTime.value,
                modalidade: document.getElementById('scheduleModalidade').value,
                exame: document.getElementById('scheduleExam').value,
                observacoes: document.getElementById('scheduleNotes').value
            })
        });
        setMessage(els.scheduleMessage, `Agendamento confirmado para ${formatDateTime(data.appointment?.dataHora)}.`);
        await refreshData();
        activateTab('overview');
    } catch (error) {
        setMessage(els.scheduleMessage, error.message, true);
    }
});

document.getElementById('chatForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = document.getElementById('chatInput');
    try {
        const attachment = state.pendingAttachment
            ? {
                name: state.pendingAttachment.name,
                type: state.pendingAttachment.type,
                size: state.pendingAttachment.size,
                base64: state.pendingAttachment.base64
            }
            : null;
        await api('/chat/messages', {
            method: 'POST',
            body: JSON.stringify({
                text: input.value,
                attachment
            })
        });
        input.value = '';
        state.pendingAttachment = null;
        updateChatAttachmentUI();
        setMessage(els.chatMessage, 'Mensagem enviada.');
        await loadChat();
    } catch (error) {
        setMessage(els.chatMessage, error.message, true);
    }
});

if (els.chatAttachBtn && els.chatAttachmentInput) {
    els.chatAttachBtn.addEventListener('click', () => {
        els.chatAttachmentInput.click();
    });
}

if (els.chatAttachmentInput) {
    els.chatAttachmentInput.addEventListener('change', async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const fileName = String(file.name || '');
        if (!/\.(png|jpe?g|pdf)$/i.test(fileName)) {
            setMessage(els.chatMessage, 'Envie apenas arquivos PNG, JPG ou PDF.', true);
            state.pendingAttachment = null;
            updateChatAttachmentUI();
            return;
        }
        if (Number(file.size || 0) > 8 * 1024 * 1024) {
            setMessage(els.chatMessage, 'O arquivo excede o limite de 8 MB.', true);
            state.pendingAttachment = null;
            updateChatAttachmentUI();
            return;
        }
        try {
            const base64 = await readFileAsBase64(file);
            state.pendingAttachment = {
                name: file.name,
                type: file.type,
                size: Number(file.size || 0),
                base64
            };
            updateChatAttachmentUI();
            setMessage(els.chatMessage, `Anexo selecionado: ${file.name}`);
        } catch (error) {
            state.pendingAttachment = null;
            updateChatAttachmentUI();
            setMessage(els.chatMessage, error.message, true);
        }
    });
}

if (els.chatDetachBtn) {
    els.chatDetachBtn.addEventListener('click', () => {
        state.pendingAttachment = null;
        updateChatAttachmentUI();
        setMessage(els.chatMessage, 'Anexo removido.');
    });
}

if (els.chatClearBtn) {
    els.chatClearBtn.addEventListener('click', async () => {
        const confirmed = window.confirm('Excluir esta conversa do seu portal?');
        if (!confirmed) return;
        try {
            await api('/chat/conversation', { method: 'DELETE' });
            setMessage(els.chatMessage, 'Conversa removida do seu portal.');
            await loadChat();
        } catch (error) {
            setMessage(els.chatMessage, error.message, true);
        }
    });
}

(async function init() {
    els.scheduleDate.value = new Date().toISOString().slice(0, 10);
    toggleAuth(false);
    updateChatAttachmentUI();
    if (!state.token) {
        stopChatPolling();
        toggleApp(false);
        setMessage(els.authMessage, 'Entre com seu e-mail e senha para acessar o portal.');
        return;
    }
    try {
        toggleApp(true);
        await refreshData();
        updateChatAttachmentUI();
        startChatPolling();
    } catch (error) {
        localStorage.removeItem('portal_client_token');
        state.token = '';
        stopChatPolling();
        toggleApp(false);
        setMessage(els.authMessage, error.message || 'Nao foi possivel carregar a home do portal.', true);
    }
})();
