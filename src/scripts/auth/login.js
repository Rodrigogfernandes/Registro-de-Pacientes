const { ipcRenderer } = require('electron');

const form = document.getElementById('loginForm');
const messageEl = document.getElementById('loginMessage');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');

function setMessage(text, isError = false) {
    if (!messageEl) return;
    messageEl.textContent = text;
    messageEl.classList.toggle('is-error', isError);
}

async function checarSessao() {
    try {
        const session = await ipcRenderer.invoke('auth-get-session');
        if (session) {
            window.location.href = '../index.html';
            return;
        }
        if (usernameInput) usernameInput.focus();
    } catch (error) {
        console.error('Erro ao checar sessão:', error);
        if (usernameInput) usernameInput.focus();
    }
}

form?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const username = String(usernameInput?.value || '').trim();
    const password = String(passwordInput?.value || '');

    if (!username || !password) {
        setMessage('Informe usuário e senha.', true);
        return;
    }

    setMessage('Autenticando...');
    const result = await ipcRenderer.invoke('auth-login', { username, password });
    if (result?.ok) {
        window.location.href = '../index.html';
        return;
    }

    setMessage(result?.message || 'Falha ao autenticar.', true);
    if (passwordInput) passwordInput.value = '';
    passwordInput?.focus();
});

checarSessao();
