const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const PDFDocument = require('pdfkit');

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CHAT_ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.pdf']);
const CHAT_ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;

function createClientPortalServer(deps) {
    const {
        baseDir,
        port,
        host = '127.0.0.1',
        cpfSomenteDigitos,
        normalizarProntuario,
        hashSenha,
        validarSenhaForteOuFalhar,
        obterStatusTentativas,
        registrarFalhaLogin,
        limparTentativasLogin,
        lerDados,
        salvarDados,
        obterConfigAuth,
        garantirUsuariosAuth,
        sanitizeAuthUser,
        filtrarPresencasAtivas,
        getMongoOnline
    } = deps;

    const sessions = new Map();
    const webApp = express();
    const staticDir = path.join(baseDir, 'src', 'web-client');

    webApp.use(express.json({ limit: '12mb' }));
    webApp.use((req, res, next) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
        if (req.method === 'OPTIONS') {
            res.status(204).end();
            return;
        }
        next();
    });

    const limparTexto = (valor) => String(valor || '').trim();
    const normalizarEmail = (email) => String(email || '').trim().toLowerCase();
    const normalizarUsername = (valor) => String(valor || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-+|-+$/g, '');

    function extrairNumeroProntuario(valor) {
        const match = String(valor || '').trim().toUpperCase().match(/^P(\d{1,10})$/);
        return match ? Number(match[1]) : null;
    }

    function extrairNumeroAcesso(valor) {
        const limpo = String(valor || '').trim();
        return /^\d{1,12}$/.test(limpo) ? Number(limpo) : null;
    }

    function formatarProntuarioSequencial(numero) {
        return `P${String(numero).padStart(6, '0')}`;
    }

    function formatarNumeroAcessoSequencial(numero) {
        return String(numero).padStart(7, '0');
    }

    function obterContadores(config) {
        const base = (config && typeof config === 'object') ? config : {};
        if (!base.contadores || typeof base.contadores !== 'object') {
            base.contadores = {};
        }
        if (!Number.isFinite(Number(base.contadores.prontuarioAtual))) {
            base.contadores.prontuarioAtual = 0;
        }
        if (!Number.isFinite(Number(base.contadores.numeroAcessoAtual))) {
            base.contadores.numeroAcessoAtual = 0;
        }
        return base.contadores;
    }

    function normalizarPortalClient(user) {
        return {
            id: limparTexto(user?.id || `portal-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`),
            username: normalizarUsername(user?.username),
            nome: limparTexto(user?.nome),
            email: normalizarEmail(user?.email),
            telefone: limparTexto(user?.telefone),
            cpf: cpfSomenteDigitos(user?.cpf),
            patientId: limparTexto(user?.patientId),
            prontuarioPaciente: normalizarProntuario(user?.prontuarioPaciente || user?.documentoPaciente || ''),
            passwordHash: limparTexto(user?.passwordHash),
            active: user?.active !== false,
            createdAt: Number.isFinite(Date.parse(String(user?.createdAt || ''))) ? new Date(user.createdAt).toISOString() : new Date().toISOString(),
            updatedAt: Number.isFinite(Date.parse(String(user?.updatedAt || ''))) ? new Date(user.updatedAt).toISOString() : new Date().toISOString(),
            lastLoginAt: Number.isFinite(Date.parse(String(user?.lastLoginAt || ''))) ? new Date(user.lastLoginAt).toISOString() : ''
        };
    }

    async function obterConfigPortal() {
        const config = await obterConfigAuth();
        if (!Array.isArray(config.portalClients)) {
            config.portalClients = [];
        }
        config.portalClients = config.portalClients.map(normalizarPortalClient).filter((item) => item.email && item.passwordHash);
        return config;
    }

    async function salvarPortalClientes(config, portalClients) {
        const payload = (config && typeof config === 'object') ? config : await obterConfigAuth();
        payload.portalClients = (Array.isArray(portalClients) ? portalClients : []).map(normalizarPortalClient);
        await salvarDados('config', payload);
        return payload;
    }

    function obterRotasPortal(config) {
        const payload = (config && typeof config === 'object') ? config : {};
        if (!payload.portalClientRouting || typeof payload.portalClientRouting !== 'object') {
            payload.portalClientRouting = {};
        }
        return payload.portalClientRouting;
    }

    async function listarAtendentesOnline() {
        const [config, presencas] = await Promise.all([garantirUsuariosAuth(), lerDados('auth-presence')]);
        const online = new Set(filtrarPresencasAtivas(presencas).map((item) => String(item?.username || '').toLowerCase()));
        const candidatos = (config.authUsers || [])
            .map(sanitizeAuthUser)
            .filter((item) => item.active && ['admin', 'recepcao'].includes(item.role))
            .map((item) => ({
                username: item.username,
                nome: item.nome || item.username,
                role: item.role
            }));

        const onlineFiltrados = candidatos
            .filter((item) => online.has(String(item.username || '').toLowerCase()))
            .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));

        if (onlineFiltrados.length > 0) {
            return onlineFiltrados;
        }

        // Fallback para nao travar o chat quando a presenca ainda nao sincronizou.
        return candidatos.sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
    }

    function escolherAtendente(atendentes, chaveExclusao = '') {
        const lista = Array.isArray(atendentes) ? atendentes : [];
        if (lista.length === 0) return null;
        const exclusao = String(chaveExclusao || '').toLowerCase();
        const elegiveis = exclusao ? lista.filter((item) => String(item?.username || '').toLowerCase() !== exclusao) : lista;
        const base = elegiveis.length > 0 ? elegiveis : lista;
        const indice = Math.floor(Math.random() * base.length);
        return base[indice] || null;
    }

    async function garantirAtendenteCliente(client, { allowTransfer = true } = {}) {
        const config = await obterConfigPortal();
        const routes = obterRotasPortal(config);
        const clientKey = String(client?.id || '');
        const atual = routes[clientKey] || null;
        const onlineAttendants = await listarAtendentesOnline();
        const atualOnline = atual
            ? onlineAttendants.find((item) => String(item?.username || '').toLowerCase() === String(atual?.username || '').toLowerCase())
            : null;

        if (atualOnline) {
            routes[clientKey] = {
                username: atualOnline.username,
                nome: atualOnline.nome,
                assignedAt: atual?.assignedAt || new Date().toISOString()
            };
            await salvarDados('config', config);
            return {
                attendant: routes[clientKey],
                transferred: false,
                onlineAttendants
            };
        }

        const proximo = escolherAtendente(onlineAttendants, allowTransfer ? String(atual?.username || '') : '');
        if (!proximo) {
            delete routes[clientKey];
            await salvarDados('config', config);
            return {
                attendant: null,
                transferred: false,
                previous: atual || null,
                onlineAttendants
            };
        }

        routes[clientKey] = {
            username: proximo.username,
            nome: proximo.nome,
            assignedAt: new Date().toISOString()
        };
        await salvarDados('config', config);
        return {
            attendant: routes[clientKey],
            transferred: Boolean(atual && String(atual?.username || '').toLowerCase() !== String(proximo.username || '').toLowerCase()),
            previous: atual || null,
            onlineAttendants
        };
    }

    async function registrarMensagemSistemaTransferencia({ client, fromAttendant, toAttendant }) {
        if (!client || !toAttendant) return;
        const raw = await lerDados('chat-messages');
        const lista = Array.isArray(raw) ? raw : [];
        const username = String(client?.username || '').toLowerCase();
        const nome = String(client?.nome || client?.email || 'Cliente');
        lista.push({
            id: `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
            at: new Date().toISOString(),
            from: { username: 'sistema', nome: 'Sistema', role: 'sistema' },
            to: { username, nome },
            text: fromAttendant
                ? `Seu atendimento foi transferido de ${fromAttendant.nome || fromAttendant.username} para ${toAttendant.nome || toAttendant.username}.`
                : `Seu atendimento foi iniciado com ${toAttendant.nome || toAttendant.username}.`,
            attachment: null,
            readBy: [],
            receivedBy: [],
            deletedFor: []
        });
        await salvarDados('chat-messages', lista.length > 5000 ? lista.slice(lista.length - 5000) : lista);
    }

    async function possuiHistoricoCliente(client) {
        if (!client) return false;
        const username = String(client?.username || '').trim().toLowerCase();
        if (!username) return false;
        const raw = await lerDados('chat-messages');
        const lista = Array.isArray(raw) ? raw : [];
        return lista.some((item) => {
            const fromUsername = String(item?.from?.username || '').trim().toLowerCase();
            const toUsername = String(item?.to?.username || '').trim().toLowerCase();
            return fromUsername === username || toUsername === username;
        });
    }

    function gerarUsernameCliente(nome, email, portalClients = [], authUsers = []) {
        const base = normalizarUsername((nome || email || 'cliente').split('@')[0]) || 'cliente';
        const usados = new Set([
            ...portalClients.map((item) => normalizarUsername(item?.username)),
            ...authUsers.map((item) => normalizarUsername(item?.username))
        ]);
        let username = `cliente_${base}`;
        let sufixo = 2;
        while (usados.has(username)) {
            username = `cliente_${base}_${sufixo}`;
            sufixo += 1;
        }
        return username;
    }

    function limparSessoesExpiradas() {
        const agora = Date.now();
        for (const [token, sessao] of sessions.entries()) {
            if (!sessao?.expiresAt || sessao.expiresAt <= agora) {
                sessions.delete(token);
            }
        }
    }

    function criarSessao(client) {
        limparSessoesExpiradas();
        const token = crypto.randomBytes(24).toString('hex');
        sessions.set(token, {
            token,
            clientId: String(client?.id || ''),
            username: String(client?.username || '').toLowerCase(),
            email: normalizarEmail(client?.email),
            expiresAt: Date.now() + SESSION_TTL_MS
        });
        return token;
    }

    function tokenDaRequisicao(req) {
        const authHeader = String(req?.headers?.authorization || '').trim();
        if (authHeader.toLowerCase().startsWith('bearer ')) {
            return authHeader.slice(7).trim();
        }
        return limparTexto(req?.query?.token || '');
    }

    async function obterClienteAutenticado(req) {
        limparSessoesExpiradas();
        const token = tokenDaRequisicao(req);
        if (!token) return null;
        const sessao = sessions.get(token);
        if (!sessao) return null;
        const config = await obterConfigPortal();
        const client = config.portalClients.find((item) => item.id === sessao.clientId && item.active);
        if (!client) {
            sessions.delete(token);
            return null;
        }
        sessao.expiresAt = Date.now() + SESSION_TTL_MS;
        sessions.set(token, sessao);
        return { token, client };
    }

    async function autenticar(req, res, next) {
        try {
            const sessao = await obterClienteAutenticado(req);
            if (!sessao) {
                res.status(401).json({ ok: false, message: 'Sessao do cliente invalida ou expirada.' });
                return;
            }
            req.portalClient = sessao.client;
            req.portalToken = sessao.token;
            next();
        } catch (error) {
            res.status(500).json({ ok: false, message: error.message });
        }
    }

    function registroPertenceAoCliente(item, client) {
        const patientId = limparTexto(client?.patientId);
        const prontuario = normalizarProntuario(client?.prontuarioPaciente || '');
        const cpf = cpfSomenteDigitos(client?.cpf || '');
        const itemPatientId = limparTexto(item?.pacienteId || item?.patientId || '');
        const itemProntuario = normalizarProntuario(item?.prontuarioPaciente || item?.documentoPaciente || item?.pacienteDocumento || '');
        const itemCpf = cpfSomenteDigitos(item?.cpfPaciente || '');
        return Boolean(
            (patientId && itemPatientId && patientId === itemPatientId) ||
            (prontuario && itemProntuario && prontuario === itemProntuario) ||
            (cpf && itemCpf && cpf === itemCpf)
        );
    }

    function parseHoraParaMinutos(hhmm) {
        const [hora, minuto] = String(hhmm || '').split(':').map(Number);
        return (Number.isFinite(hora) && Number.isFinite(minuto)) ? (hora * 60 + minuto) : NaN;
    }

    function formatarMinutosParaHora(total) {
        const h = String(Math.floor(total / 60)).padStart(2, '0');
        const m = String(total % 60).padStart(2, '0');
        return `${h}:${m}`;
    }

    function normalizarMedico(item, index = 0) {
        return {
            id: limparTexto(item?.id || `medico-${index + 1}`),
            nome: limparTexto(item?.nome || `Medico ${index + 1}`),
            diasSemana: Array.isArray(item?.diasSemana)
                ? [...new Set(item.diasSemana.map(Number).filter((dia) => dia >= 0 && dia <= 6))].sort((a, b) => a - b)
                : [1, 2, 3, 4, 5],
            inicio: /^\d{2}:\d{2}$/.test(String(item?.inicio || '')) ? item.inicio : '07:00',
            fim: /^\d{2}:\d{2}$/.test(String(item?.fim || '')) ? item.fim : '13:00',
            intervaloMinutos: Math.max(5, Number(item?.intervaloMinutos) || 30),
            datasBloqueadas: Array.isArray(item?.datasBloqueadas) ? item.datasBloqueadas.map((data) => String(data || '').trim()).filter(Boolean) : []
        };
    }

    function gerarProximoProntuario(config, pacientes = [], agendamentos = [], registros = []) {
        const contadores = obterContadores(config);
        let maior = Number(contadores.prontuarioAtual) || 0;
        [...pacientes, ...agendamentos, ...registros].forEach((item) => {
            const numero = extrairNumeroProntuario(item?.prontuarioPaciente || item?.documentoPaciente || item?.pacienteDocumento || '');
            if (Number.isFinite(numero)) {
                maior = Math.max(maior, numero);
            }
        });
        contadores.prontuarioAtual = maior + 1;
        return formatarProntuarioSequencial(contadores.prontuarioAtual);
    }

    function gerarProximoNumeroAcesso(config, agendamentos = [], registros = []) {
        const contadores = obterContadores(config);
        let maior = Number(contadores.numeroAcessoAtual) || 0;
        [...agendamentos, ...registros].forEach((item) => {
            const numero = extrairNumeroAcesso(item?.numeroAcesso || '');
            if (Number.isFinite(numero)) {
                maior = Math.max(maior, numero);
            }
        });
        contadores.numeroAcessoAtual = maior + 1;
        return formatarNumeroAcessoSequencial(contadores.numeroAcessoAtual);
    }

    function obterHorariosDisponiveis({ medico, dataIso, agendamentos }) {
        if (!medico || !/^\d{4}-\d{2}-\d{2}$/.test(String(dataIso || ''))) return [];
        const dataBase = new Date(`${dataIso}T00:00:00`);
        if (Number.isNaN(dataBase.getTime())) return [];
        if (medico.datasBloqueadas.includes(dataIso)) return [];
        if (!medico.diasSemana.includes(dataBase.getDay())) return [];

        const inicio = parseHoraParaMinutos(medico.inicio);
        const fim = parseHoraParaMinutos(medico.fim);
        const ocupados = new Set(
            (Array.isArray(agendamentos) ? agendamentos : [])
                .filter((item) => String(item?.medicoId || '') === String(medico.id || ''))
                .filter((item) => String(item?.statusExame || '').toLowerCase() !== 'cancelado')
                .filter((item) => String(item?.dataHora || '').slice(0, 10) === dataIso)
                .map((item) => String(item?.dataHora || '').slice(11, 16))
        );

        const horarios = [];
        for (let minuto = inicio; minuto + medico.intervaloMinutos <= fim; minuto += medico.intervaloMinutos) {
            const hora = formatarMinutosParaHora(minuto);
            if (!ocupados.has(hora)) {
                horarios.push(hora);
            }
        }
        return horarios;
    }

    function normalizarChat(raw) {
        return (Array.isArray(raw) ? raw : []).map((item) => ({
            ...item,
            readBy: [...new Set(Array.isArray(item?.readBy) ? item.readBy.map((valor) => String(valor || '').toLowerCase()) : [])],
            receivedBy: [...new Set(Array.isArray(item?.receivedBy) ? item.receivedBy.map((valor) => String(valor || '').toLowerCase()) : [])],
            deletedFor: [...new Set(Array.isArray(item?.deletedFor) ? item.deletedFor.map((valor) => String(valor || '').toLowerCase()) : [])]
        }));
    }

    function getChatUploadsDir() {
        return path.join(baseDir, 'data', 'chat_uploads');
    }


    function chatVisivelPara(item, username) {
        const user = String(username || '').toLowerCase();
        const fromUsername = String(item?.from?.username || '').trim().toLowerCase();
        const toUsername = String(item?.to?.username || '').trim().toLowerCase();
        const deletedFor = Array.isArray(item?.deletedFor) ? item.deletedFor.map((valor) => String(valor || '').toLowerCase()) : [];
        if (deletedFor.includes(user)) return false;
        if (!toUsername) return false;
        return toUsername === user || fromUsername === user;
    }

    function chatEhConversaDoCliente(item, username) {
        const user = String(username || '').toLowerCase();
        const fromUsername = String(item?.from?.username || '').trim().toLowerCase();
        const toUsername = String(item?.to?.username || '').trim().toLowerCase();
        return fromUsername === user || toUsername === user;
    }

    function gerarPdfLaudo({ item, client, res }) {
        const nomeArquivo = `laudo_${String(item?.numeroAcesso || item?.id || 'cliente')}.pdf`;
        const doc = new PDFDocument({ margin: 40 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=\"${nomeArquivo}\"`);
        doc.pipe(res);
        doc.fontSize(20).text('Laudo Digital Simplificado', { align: 'center' });
        doc.moveDown();
        doc.fontSize(11).text('Documento gerado automaticamente pelo portal do cliente.');
        doc.moveDown();
        doc.fontSize(13).text(`Paciente: ${client?.nome || '-'}`);
        doc.text(`Prontuario: ${client?.prontuarioPaciente || '-'}`);
        doc.text(`CPF: ${client?.cpf || '-'}`);
        doc.moveDown();
        doc.text(`Exame: ${item?.exame || item?.modalidade || '-'}`);
        doc.text(`Modalidade: ${item?.modalidade || '-'}`);
        doc.text(`Data/Hora: ${item?.dataHoraExame || item?.dataHora || '-'}`);
        doc.text(`Numero de acesso: ${item?.numeroAcesso || '-'}`);
        doc.text(`Profissional: ${item?.nomeTecnico || '-'}`);
        doc.text(`Status: ${item?.statusExame || 'Realizado'}`);
        if (item?.observacoes) {
            doc.moveDown();
            doc.text('Observacoes:');
            doc.text(String(item.observacoes));
        }
        doc.moveDown();
        doc.fontSize(10).fillColor('#666').text(`Gerado em ${new Date().toLocaleString('pt-BR')}.`);
        doc.end();
    }

    function listarClientesOnline() {
        limparSessoesExpiradas();
        const vistos = new Set();
        const ativos = [];
        for (const sessao of sessions.values()) {
            const username = String(sessao?.username || '').toLowerCase();
            if (!username || vistos.has(username)) continue;
            vistos.add(username);
            ativos.push({
                username,
                nome: String(sessao?.email || username),
                role: 'cliente'
            });
        }
        return ativos;
    }

    webApp.get('/cliente/api/health', (req, res) => {
        res.json({ ok: true, port, online: Boolean(getMongoOnline?.()) });
    });

    webApp.post('/cliente/api/auth/register', async (req, res) => {
        try {
            const nome = limparTexto(req.body?.nome);
            const email = normalizarEmail(req.body?.email);
            const password = String(req.body?.password || '');
            const cpf = cpfSomenteDigitos(req.body?.cpf);
            const telefone = limparTexto(req.body?.telefone);
            const dataNascimento = limparTexto(req.body?.dataNascimento);
            const endereco = limparTexto(req.body?.endereco);
            const planoPaciente = limparTexto(req.body?.planoPaciente);

            if (!nome || !email || !password || !cpf) throw new Error('Informe nome, e-mail, CPF e senha.');
            if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Informe um e-mail válido.');
            if (cpf.length !== 11) throw new Error('Informe um CPF válido com 11 dígitos.');
            validarSenhaForteOuFalhar(password);

            const config = await obterConfigPortal();
            const authConfig = await garantirUsuariosAuth();
            const portalClients = Array.isArray(config.portalClients) ? config.portalClients : [];
            if (portalClients.some((item) => item.email === email)) throw new Error('Já existe uma conta com este e-mail.');
            if (portalClients.some((item) => item.cpf === cpf)) throw new Error('Já existe uma conta com este CPF.');

            const [pacientesRaw, agendamentosRaw, registrosRaw] = await Promise.all([
                lerDados('pacientes'),
                lerDados('agendamentos'),
                lerDados('registros')
            ]);
            const pacientes = Array.isArray(pacientesRaw) ? pacientesRaw : [];
            const agendamentos = Array.isArray(agendamentosRaw) ? agendamentosRaw : [];
            const registros = Array.isArray(registrosRaw) ? registrosRaw : [];

            let paciente = pacientes.find((item) => cpfSomenteDigitos(item?.cpfPaciente || '') === cpf) || null;
            if (!paciente) {
                const prontuarioPaciente = gerarProximoProntuario(config, pacientes, agendamentos, registros);
                paciente = {
                    id: `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
                    nomePaciente: nome,
                    cpfPaciente: cpf,
                    prontuarioPaciente,
                    documentoPaciente: prontuarioPaciente,
                    telefonePaciente: telefone,
                    dataNascimentoPaciente: dataNascimento,
                    enderecoPaciente: endereco,
                    planoPaciente
                };
                pacientes.push(paciente);
            } else {
                paciente.nomePaciente = nome || paciente.nomePaciente;
                paciente.telefonePaciente = telefone || paciente.telefonePaciente || '';
                paciente.dataNascimentoPaciente = dataNascimento || paciente.dataNascimentoPaciente || '';
                paciente.enderecoPaciente = endereco || paciente.enderecoPaciente || '';
                paciente.planoPaciente = planoPaciente || paciente.planoPaciente || '';
                const idxPaciente = pacientes.findIndex((item) => String(item?.id || '') === String(paciente.id || ''));
                if (idxPaciente >= 0) {
                    pacientes[idxPaciente] = paciente;
                }
            }

            const client = normalizarPortalClient({
                id: `portal-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
                username: gerarUsernameCliente(nome, email, portalClients, authConfig.authUsers || []),
                nome,
                email,
                telefone,
                cpf,
                patientId: paciente.id,
                prontuarioPaciente: paciente.prontuarioPaciente || paciente.documentoPaciente || '',
                passwordHash: hashSenha(password),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                lastLoginAt: new Date().toISOString(),
                active: true
            });

            portalClients.push(client);
            await Promise.all([
                salvarDados('pacientes', pacientes),
                salvarPortalClientes(config, portalClients)
            ]);

            res.json({
                ok: true,
                token: criarSessao(client),
                client: {
                    id: client.id,
                    username: client.username,
                    nome: client.nome,
                    email: client.email,
                    telefone: client.telefone,
                    cpf: client.cpf,
                    prontuarioPaciente: client.prontuarioPaciente
                }
            });
        } catch (error) {
            res.status(400).json({ ok: false, message: error.message });
        }
    });

    webApp.post('/cliente/api/auth/login', async (req, res) => {
        try {
            const email = normalizarEmail(req.body?.email);
            const password = String(req.body?.password || '');
            if (!email || !password) throw new Error('Informe e-mail e senha.');

            const key = `client:${email}`;
            const tentativas = obterStatusTentativas(key);
            if (tentativas.lockedUntil && tentativas.lockedUntil > Date.now()) {
                const restanteMin = Math.ceil((tentativas.lockedUntil - Date.now()) / 60000);
                throw new Error(`Conta bloqueada temporariamente. Tente novamente em ${restanteMin} minuto(s).`);
            }

            const config = await obterConfigPortal();
            const client = config.portalClients.find((item) => item.email === email && item.active);
            if (!client || client.passwordHash !== hashSenha(password)) {
                registrarFalhaLogin(key);
                throw new Error('E-mail ou senha inválidos.');
            }

            limparTentativasLogin(key);
            client.lastLoginAt = new Date().toISOString();
            client.updatedAt = new Date().toISOString();
            await salvarPortalClientes(config, config.portalClients);

            res.json({
                ok: true,
                token: criarSessao(client),
                client: {
                    id: client.id,
                    username: client.username,
                    nome: client.nome,
                    email: client.email,
                    telefone: client.telefone,
                    cpf: client.cpf,
                    prontuarioPaciente: client.prontuarioPaciente
                }
            });
        } catch (error) {
            res.status(400).json({ ok: false, message: error.message });
        }
    });

    webApp.post('/cliente/api/auth/logout', autenticar, (req, res) => {
        sessions.delete(String(req.portalToken || ''));
        res.json({ ok: true });
    });

    webApp.get('/cliente/api/session', autenticar, (req, res) => {
        res.json({
            ok: true,
            client: {
                id: req.portalClient.id,
                username: req.portalClient.username,
                nome: req.portalClient.nome,
                email: req.portalClient.email,
                telefone: req.portalClient.telefone,
                cpf: req.portalClient.cpf,
                prontuarioPaciente: req.portalClient.prontuarioPaciente
            }
        });
    });

    webApp.get('/cliente/api/dashboard', autenticar, async (req, res) => {
        try {
            const [agendamentosRaw, registrosRaw] = await Promise.all([lerDados('agendamentos'), lerDados('registros')]);
            const agendamentos = (Array.isArray(agendamentosRaw) ? agendamentosRaw : [])
                .filter((item) => registroPertenceAoCliente(item, req.portalClient))
                .sort((a, b) => Date.parse(String(a?.dataHora || '')) - Date.parse(String(b?.dataHora || '')));
            const registros = (Array.isArray(registrosRaw) ? registrosRaw : [])
                .filter((item) => registroPertenceAoCliente(item, req.portalClient))
                .sort((a, b) => Date.parse(String(b?.dataHoraExame || '')) - Date.parse(String(a?.dataHoraExame || '')));
            const agora = Date.now();
            const proximos = agendamentos.filter((item) => Date.parse(String(item?.dataHora || '')) >= agora && String(item?.statusExame || '').toLowerCase() !== 'cancelado');
            res.json({
                ok: true,
                summary: {
                    proximoAgendamento: proximos[0] || null,
                    totalAgendamentos: agendamentos.length,
                    totalLaudos: registros.length,
                    pendentes: agendamentos.filter((item) => String(item?.statusExame || '').toLowerCase() === 'agendado').length
                }
            });
        } catch (error) {
            res.status(500).json({ ok: false, message: error.message });
        }
    });

    webApp.get('/cliente/api/attendants', autenticar, async (req, res) => {
        try {
            const routing = await garantirAtendenteCliente(req.portalClient, { allowTransfer: true });
            res.json({
                ok: true,
                attendant: routing.attendant,
                attendantsOnline: routing.onlineAttendants || []
            });
        } catch (error) {
            res.status(500).json({ ok: false, message: error.message });
        }
    });

    webApp.get('/cliente/api/appointments', autenticar, async (req, res) => {
        try {
            const lista = await lerDados('agendamentos');
            const appointments = (Array.isArray(lista) ? lista : [])
                .filter((item) => registroPertenceAoCliente(item, req.portalClient))
                .sort((a, b) => Date.parse(String(a?.dataHora || '')) - Date.parse(String(b?.dataHora || '')));
            res.json({ ok: true, appointments });
        } catch (error) {
            res.status(500).json({ ok: false, message: error.message });
        }
    });

    webApp.get('/cliente/api/appointments/options', autenticar, async (req, res) => {
        try {
            const date = limparTexto(req.query?.date);
            const medicoId = limparTexto(req.query?.medicoId);
            const [medicosRaw, agendamentosRaw] = await Promise.all([lerDados('medicos-agenda'), lerDados('agendamentos')]);
            const medicos = (Array.isArray(medicosRaw) ? medicosRaw : []).map(normalizarMedico);
            const doctors = medicos.map((item) => ({
                id: item.id,
                nome: item.nome,
                inicio: item.inicio,
                fim: item.fim,
                intervaloMinutos: item.intervaloMinutos,
                diasSemana: item.diasSemana
            }));

            if (!date || !medicoId) {
                res.json({ ok: true, doctors, slots: [] });
                return;
            }

            const medico = medicos.find((item) => item.id === medicoId);
            if (!medico) throw new Error('Profissional não encontrado.');
            const slots = obterHorariosDisponiveis({
                medico,
                dataIso: date,
                agendamentos: Array.isArray(agendamentosRaw) ? agendamentosRaw : []
            });
            res.json({ ok: true, doctors, slots });
        } catch (error) {
            res.status(400).json({ ok: false, message: error.message });
        }
    });

    webApp.post('/cliente/api/appointments', autenticar, async (req, res) => {
        try {
            const medicoId = limparTexto(req.body?.medicoId);
            const date = limparTexto(req.body?.date);
            const time = limparTexto(req.body?.time);
            const modalidade = limparTexto(req.body?.modalidade) || 'Ressonancia';
            const exame = limparTexto(req.body?.exame);
            const observacoes = limparTexto(req.body?.observacoes);
            if (!medicoId || !date || !time || !exame) throw new Error('Informe profissional, data, horário e exame.');

            const [config, agendamentosRaw, medicosRaw, registrosRaw, pacientesRaw] = await Promise.all([
                obterConfigPortal(),
                lerDados('agendamentos'),
                lerDados('medicos-agenda'),
                lerDados('registros'),
                lerDados('pacientes')
            ]);
            const agendamentos = Array.isArray(agendamentosRaw) ? agendamentosRaw : [];
            const medicos = (Array.isArray(medicosRaw) ? medicosRaw : []).map(normalizarMedico);
            const medico = medicos.find((item) => item.id === medicoId);
            if (!medico) throw new Error('Profissional não encontrado.');

            const disponiveis = obterHorariosDisponiveis({ medico, dataIso: date, agendamentos });
            if (!disponiveis.includes(time)) throw new Error('Este horário não está mais disponível.');

            const pacientes = Array.isArray(pacientesRaw) ? pacientesRaw : [];
            const paciente = pacientes.find((item) => String(item?.id || '') === String(req.portalClient?.patientId || ''))
                || pacientes.find((item) => cpfSomenteDigitos(item?.cpfPaciente || '') === cpfSomenteDigitos(req.portalClient?.cpf || ''));
            if (!paciente) throw new Error('Paciente do portal não encontrado.');

            const appointment = {
                id: Date.now(),
                nomePaciente: paciente.nomePaciente || req.portalClient.nome,
                cpfPaciente: paciente.cpfPaciente || req.portalClient.cpf,
                prontuarioPaciente: paciente.prontuarioPaciente || paciente.documentoPaciente || req.portalClient.prontuarioPaciente,
                telefonePaciente: paciente.telefonePaciente || req.portalClient.telefone || '',
                dataNascimentoPaciente: paciente.dataNascimentoPaciente || '',
                enderecoPaciente: paciente.enderecoPaciente || '',
                planoPaciente: paciente.planoPaciente || '',
                medicoId: medico.id,
                modalidade,
                exame,
                numeroAcesso: gerarProximoNumeroAcesso(config, agendamentos, Array.isArray(registrosRaw) ? registrosRaw : []),
                dataHora: `${date}T${time}`,
                nomeTecnico: medico.nome,
                statusExame: 'Agendado',
                documentoPaciente: paciente.prontuarioPaciente || paciente.documentoPaciente || req.portalClient.prontuarioPaciente,
                pacienteId: paciente.id,
                origem: 'portal-cliente',
                observacoes
            };

            agendamentos.push(appointment);
            await Promise.all([
                salvarDados('agendamentos', agendamentos),
                salvarDados('config', config)
            ]);
            res.json({ ok: true, appointment });
        } catch (error) {
            res.status(400).json({ ok: false, message: error.message });
        }
    });

    webApp.get('/cliente/api/reports', autenticar, async (req, res) => {
        try {
            const [registrosRaw, agendamentosRaw] = await Promise.all([lerDados('registros'), lerDados('agendamentos')]);
            const reports = [];
            (Array.isArray(registrosRaw) ? registrosRaw : []).forEach((item) => {
                if (!registroPertenceAoCliente(item, req.portalClient)) return;
                reports.push({
                    id: `registro-${item.id}`,
                    origem: 'registro',
                    exame: item.exame || '',
                    modalidade: item.modalidade || '',
                    dataHora: item.dataHoraExame || item.dataHora || '',
                    numeroAcesso: item.numeroAcesso || '',
                    nomeTecnico: item.nomeTecnico || '',
                    statusExame: item.statusExame || 'Realizado'
                });
            });
            (Array.isArray(agendamentosRaw) ? agendamentosRaw : []).forEach((item) => {
                if (!registroPertenceAoCliente(item, req.portalClient)) return;
                if (String(item?.statusExame || '').toLowerCase() !== 'realizado') return;
                if (reports.some((report) => report.numeroAcesso && report.numeroAcesso === item.numeroAcesso)) return;
                reports.push({
                    id: `agendamento-${item.id}`,
                    origem: 'agendamento',
                    exame: item.exame || '',
                    modalidade: item.modalidade || '',
                    dataHora: item.dataHora || '',
                    numeroAcesso: item.numeroAcesso || '',
                    nomeTecnico: item.nomeTecnico || '',
                    statusExame: item.statusExame || 'Realizado'
                });
            });
            reports.sort((a, b) => Date.parse(String(b?.dataHora || '')) - Date.parse(String(a?.dataHora || '')));
            res.json({ ok: true, reports });
        } catch (error) {
            res.status(500).json({ ok: false, message: error.message });
        }
    });

    webApp.get('/cliente/api/reports/:id/download', autenticar, async (req, res) => {
        try {
            const reportId = String(req.params?.id || '').trim();
            const [registrosRaw, agendamentosRaw] = await Promise.all([lerDados('registros'), lerDados('agendamentos')]);
            let item = null;
            if (reportId.startsWith('registro-')) {
                const id = reportId.slice('registro-'.length);
                item = (Array.isArray(registrosRaw) ? registrosRaw : []).find((entry) => String(entry?.id || '') === id && registroPertenceAoCliente(entry, req.portalClient));
            } else if (reportId.startsWith('agendamento-')) {
                const id = reportId.slice('agendamento-'.length);
                item = (Array.isArray(agendamentosRaw) ? agendamentosRaw : []).find((entry) => String(entry?.id || '') === id && registroPertenceAoCliente(entry, req.portalClient));
            }
            if (!item) throw new Error('Laudo não encontrado para este cliente.');
            gerarPdfLaudo({ item, client: req.portalClient, res });
        } catch (error) {
            res.status(404).json({ ok: false, message: error.message });
        }
    });

    webApp.get('/cliente/api/chat/messages', autenticar, async (req, res) => {
        try {
            const routing = await garantirAtendenteCliente(req.portalClient, { allowTransfer: true });
            const username = String(req.portalClient?.username || '').trim().toLowerCase();
            const raw = await lerDados('chat-messages');
            const lista = normalizarChat(raw);
            let mudou = false;
            const atualizada = lista.map((item) => {
                if (!chatVisivelPara(item, username)) return item;
                const fromUsername = String(item?.from?.username || '').trim().toLowerCase();
                const readBy = Array.isArray(item?.readBy) ? item.readBy.map((valor) => String(valor || '').toLowerCase()) : [];
                const receivedBy = Array.isArray(item?.receivedBy) ? item.receivedBy.map((valor) => String(valor || '').toLowerCase()) : [];
                let proximo = item;
                if (fromUsername !== username && !receivedBy.includes(username)) {
                    proximo = { ...proximo, receivedBy: [...receivedBy, username] };
                    mudou = true;
                }
                const readByAtual = Array.isArray(proximo?.readBy) ? proximo.readBy : readBy;
                if (fromUsername !== username && !readByAtual.includes(username)) {
                    proximo = { ...proximo, readBy: [...readByAtual, username] };
                    mudou = true;
                }
                return proximo;
            });
            if (mudou) {
                await salvarDados('chat-messages', atualizada);
            }
            const messages = atualizada
                .filter((item) => chatVisivelPara(item, username))
                .map((item) => ({
                    ...item,
                    attachment: validarAttachmentPersistido(item?.attachment)
                }))
                .sort((a, b) => Date.parse(String(a?.at || '')) - Date.parse(String(b?.at || '')));
            res.json({
                ok: true,
                messages,
                attendant: routing.attendant,
                attendantsOnline: routing.onlineAttendants || []
            });
        } catch (error) {
            res.status(500).json({ ok: false, message: error.message });
        }
    });

    webApp.post('/cliente/api/chat/messages', autenticar, async (req, res) => {
        try {
            const text = limparTexto(req.body?.text);
            const attachment = salvarAttachmentBase64(req.body?.attachment);
            if (!text && !attachment) throw new Error('Digite uma mensagem ou selecione um anexo.');
            if (text.length > 1000) throw new Error('Mensagem muito longa.');

            const routing = await garantirAtendenteCliente(req.portalClient, { allowTransfer: true });
            const temHistorico = await possuiHistoricoCliente(req.portalClient);
            if (temHistorico && routing.transferred && routing.attendant) {
                await registrarMensagemSistemaTransferencia({
                    client: req.portalClient,
                    fromAttendant: routing.previous,
                    toAttendant: routing.attendant
                });
            } else if (!temHistorico && !routing.previous && routing.attendant) {
                await registrarMensagemSistemaTransferencia({
                    client: req.portalClient,
                    fromAttendant: null,
                    toAttendant: routing.attendant
                });
            }
            const toUsername = String(routing.attendant?.username || '').trim().toLowerCase();
            if (!toUsername) throw new Error('Nenhum atendente online no momento. Tente novamente em instantes.');

            const config = await garantirUsuariosAuth();
            const attendant = (config.authUsers || [])
                .map(sanitizeAuthUser)
                .find((item) => item.active && ['admin', 'recepcao'].includes(item.role) && item.username === toUsername);
            if (!attendant) throw new Error('Atendente inválido ou inativo.');

            const raw = await lerDados('chat-messages');
            const lista = Array.isArray(raw) ? raw : [];
            const username = String(req.portalClient?.username || '').trim().toLowerCase();
            const nome = String(req.portalClient?.nome || req.portalClient?.email || 'Cliente');
            const message = {
                id: `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
                at: new Date().toISOString(),
                from: { username, nome, role: 'cliente' },
                to: { username: attendant.username, nome: attendant.nome || attendant.username },
                text,
                attachment,
                readBy: [username],
                receivedBy: [username],
                deletedFor: []
            };
            lista.push(message);
            await salvarDados('chat-messages', lista.length > 5000 ? lista.slice(lista.length - 5000) : lista);
            res.json({
                ok: true,
                message,
                attendant: routing.attendant,
                attendantsOnline: routing.onlineAttendants || []
            });
        } catch (error) {
            res.status(400).json({ ok: false, message: error.message });
        }
    });

    webApp.delete('/cliente/api/chat/conversation', autenticar, async (req, res) => {
        try {
            const username = String(req.portalClient?.username || '').trim().toLowerCase();
            const raw = await lerDados('chat-messages');
            const lista = normalizarChat(raw);
            const atualizado = lista.map((item) => {
                if (!chatEhConversaDoCliente(item, username)) return item;
                const deletedFor = Array.isArray(item?.deletedFor) ? item.deletedFor.map((valor) => String(valor || '').toLowerCase()) : [];
                if (deletedFor.includes(username)) return item;
                return {
                    ...item,
                    deletedFor: [...deletedFor, username]
                };
            });
            await salvarDados('chat-messages', atualizado);
            res.json({ ok: true });
        } catch (error) {
            res.status(400).json({ ok: false, message: error.message });
        }
    });

    webApp.get('/cliente/api/chat/attachments/:id', autenticar, async (req, res) => {
        try {
            const id = limparTexto(req.params?.id);
            const username = String(req.portalClient?.username || '').trim().toLowerCase();
            const raw = await lerDados('chat-messages');
            const lista = normalizarChat(raw);
            const item = lista.find((entry) => String(entry?.id || '') === id && chatVisivelPara(entry, username));
            if (!item) {
                res.status(404).json({ ok: false, message: 'Anexo não encontrado.' });
                return;
            }
            const attachment = validarAttachmentPersistido(item?.attachment);
            if (!attachment) {
                res.status(404).json({ ok: false, message: 'Arquivo não encontrado.' });
                return;
            }
            res.setHeader('Content-Type', attachment.type || 'application/octet-stream');
            res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(attachment.name)}"`);
            fs.createReadStream(attachment.path).pipe(res);
        } catch (error) {
            res.status(400).json({ ok: false, message: error.message });
        }
    });

    webApp.use('/cliente', express.static(staticDir));
    webApp.get(['/cliente', '/cliente/'], (req, res) => {
        res.sendFile(path.join(staticDir, 'index.html'));
    });

    return {
        app: webApp,
        start() {
            return new Promise((resolve, reject) => {
                const server = webApp.listen(port, host, () => resolve(server));
                server.on('error', reject);
            });
        },
        listOnlineClients() {
            return listarClientesOnline();
        },
        async listClientUsers() {
            const config = await obterConfigPortal();
            return config.portalClients
                .filter((item) => item.active)
                .map((item) => ({
                    username: item.username,
                    nome: item.nome || item.email || item.username,
                    role: 'cliente'
                }))
                .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
        }
    };
}

module.exports = {
    createClientPortalServer
};

    function getChatAttachmentMimeType(ext) {
        const normalized = String(ext || '').trim().toLowerCase();
        if (normalized === '.png') return 'image/png';
        if (normalized === '.jpg' || normalized === '.jpeg') return 'image/jpeg';
        if (normalized === '.pdf') return 'application/pdf';
        return 'application/octet-stream';
    }

    function isChatAttachmentImage(ext) {
        const normalized = String(ext || '').trim().toLowerCase();
        return normalized === '.png' || normalized === '.jpg' || normalized === '.jpeg';
    }

    function normalizarAttachmentChat(attachment) {
        if (!attachment || typeof attachment !== 'object') return null;
        const name = limparTexto(attachment.name);
        const filePath = limparTexto(attachment.path);
        const ext = path.extname(filePath || name).toLowerCase();
        return {
            name,
            path: filePath,
            type: limparTexto(attachment.type) || getChatAttachmentMimeType(ext),
            size: Number(attachment.size || 0),
            extension: limparTexto(attachment.extension) || ext,
            kind: limparTexto(attachment.kind) || (isChatAttachmentImage(ext) ? 'image' : 'pdf')
        };
    }

    function validarAttachmentPersistido(attachment) {
        const normalized = normalizarAttachmentChat(attachment);
        if (!normalized) return null;
        const ext = String(normalized.extension || path.extname(normalized.path || normalized.name)).toLowerCase();
        if (!normalized.path || !normalized.name || !CHAT_ALLOWED_EXTENSIONS.has(ext) || !fs.existsSync(normalized.path)) {
            return null;
        }
        const stats = fs.statSync(normalized.path);
        if (!stats.isFile()) return null;
        return {
            ...normalized,
            type: getChatAttachmentMimeType(ext),
            size: Number(stats.size || normalized.size || 0),
            extension: ext,
            kind: isChatAttachmentImage(ext) ? 'image' : 'pdf'
        };
    }

    function salvarAttachmentBase64(attachment) {
        if (!attachment || typeof attachment !== 'object') return null;
        const name = limparTexto(attachment.name);
        const base64 = String(attachment.base64 || '').trim();
        const ext = path.extname(name).toLowerCase();
        if (!name || !base64 || !CHAT_ALLOWED_EXTENSIONS.has(ext)) {
            throw new Error('Formato de anexo inválido. Use PNG, JPG ou PDF.');
        }
        const buffer = Buffer.from(base64, 'base64');
        if (!buffer.length) {
            throw new Error('Anexo inválido.');
        }
        if (buffer.length > CHAT_ATTACHMENT_MAX_BYTES) {
            throw new Error('O anexo excede o limite de 8 MB.');
        }
        const uploadsDir = getChatUploadsDir();
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }
        const fileName = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
        const filePath = path.join(uploadsDir, fileName);
        fs.writeFileSync(filePath, buffer);
        return {
            name,
            path: filePath,
            type: getChatAttachmentMimeType(ext),
            size: Number(buffer.length || 0),
            extension: ext,
            kind: isChatAttachmentImage(ext) ? 'image' : 'pdf'
        };
    }
