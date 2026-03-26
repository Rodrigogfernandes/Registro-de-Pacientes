const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');
const { MongoClient } = require('mongodb');
const { createClientPortalServer } = require('./src/scripts/clientPortalServer');

dotenv.config();

const PORT = Number(process.env.PORT || process.env.CLIENT_PORTAL_PORT || 3210);
const HOST = process.env.CLIENT_PORTAL_HOST || process.env.HOST || '0.0.0.0';
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const MONGO_DB_NAME = process.env.MONGODB_DB || 'registro_pacientes';
const APP_DATA_COLLECTION = 'app_data';
const AUTH_PRESENCE_TTL_MS = 45000;
const AUTH_PASSWORD_MIN_LENGTH = 8;
const AUTH_PASSWORD_MAX_ATTEMPTS = 5;
const AUTH_PASSWORD_LOCK_MINUTES = 15;
const AUTH_ROLES = ['admin', 'recepcao', 'tecnico'];

const authFailedAttempts = new Map();

let mongoClient;
let mongoDb;

function getDefaultValue(tipo) {
    if (tipo === 'ponto') return { funcionarios: [], registros: [] };
    if (tipo === 'config') return {};
    if (tipo === 'auth-presence') return [];
    if (tipo === 'audit-log') return [];
    if (tipo === 'data-meta') return { versions: {} };
    if (tipo === 'chat-messages') return [];
    return [];
}

function cpfSomenteDigitos(valor) {
    return String(valor || '').replace(/\D/g, '');
}

function normalizarProntuario(valor) {
    return String(valor || '').trim().toUpperCase();
}

function hashSenha(senha) {
    return crypto.createHash('sha256').update(String(senha || '')).digest('hex');
}

function validarSenhaForteOuFalhar(senha) {
    const valor = String(senha || '');
    if (valor.length < AUTH_PASSWORD_MIN_LENGTH) {
        throw new Error(`A senha deve ter ao menos ${AUTH_PASSWORD_MIN_LENGTH} caracteres.`);
    }
    if (!/[A-Z]/.test(valor) || !/[a-z]/.test(valor) || !/\d/.test(valor) || !/[^A-Za-z0-9]/.test(valor)) {
        throw new Error('Senha fraca: use letras maiusculas/minusculas, numero e simbolo.');
    }
}

function obterStatusTentativas(username) {
    const key = String(username || '').toLowerCase();
    const atual = authFailedAttempts.get(key) || { count: 0, lockedUntil: 0 };
    if (atual.lockedUntil && Date.now() > atual.lockedUntil) {
        authFailedAttempts.delete(key);
        return { count: 0, lockedUntil: 0 };
    }
    return atual;
}

function registrarFalhaLogin(username) {
    const key = String(username || '').toLowerCase();
    const atual = obterStatusTentativas(key);
    const proximo = { ...atual, count: atual.count + 1 };
    if (proximo.count >= AUTH_PASSWORD_MAX_ATTEMPTS) {
        proximo.lockedUntil = Date.now() + (AUTH_PASSWORD_LOCK_MINUTES * 60 * 1000);
    }
    authFailedAttempts.set(key, proximo);
    return proximo;
}

function limparTentativasLogin(username) {
    authFailedAttempts.delete(String(username || '').toLowerCase());
}

function normalizarRole(role) {
    const valor = String(role || '').trim().toLowerCase();
    return AUTH_ROLES.includes(valor) ? valor : 'recepcao';
}

function sanitizeAuthUser(user) {
    const passwordUpdatedAtRaw = String(user?.passwordUpdatedAt || '').trim();
    const passwordUpdatedAt = Number.isFinite(Date.parse(passwordUpdatedAtRaw))
        ? new Date(passwordUpdatedAtRaw).toISOString()
        : new Date().toISOString();
    return {
        id: String(user?.id || Date.now()),
        username: String(user?.username || '').trim().toLowerCase(),
        nome: String(user?.nome || user?.username || '').trim(),
        role: normalizarRole(user?.role),
        passwordHash: String(user?.passwordHash || ''),
        active: user?.active !== false,
        passwordUpdatedAt
    };
}

function sanitizePresenceSession(session, fallbackIso) {
    return {
        id: String(session?.id || ''),
        username: String(session?.username || '').trim().toLowerCase(),
        nome: String(session?.nome || session?.username || '').trim(),
        role: normalizarRole(session?.role),
        loginAt: Number.isFinite(Date.parse(String(session?.loginAt || ''))) ? new Date(session.loginAt).toISOString() : fallbackIso
    };
}

function sanitizePresenceEntry(item, fallbackIso) {
    const session = sanitizePresenceSession(item, fallbackIso);
    const lastSeen = Number.isFinite(Date.parse(String(item?.lastSeen || ''))) ? new Date(item.lastSeen).toISOString() : fallbackIso;
    return {
        sessionId: session.id,
        username: session.username,
        nome: session.nome,
        role: session.role,
        loginAt: session.loginAt,
        lastSeen,
        hostname: String(item?.hostname || ''),
        appInstanceId: String(item?.appInstanceId || '')
    };
}

function filtrarPresencasAtivas(items) {
    const now = Date.now();
    return (Array.isArray(items) ? items : [])
        .map((item) => sanitizePresenceEntry(item, new Date().toISOString()))
        .filter((entry) => entry.sessionId && entry.username)
        .filter((entry) => (now - Date.parse(entry.lastSeen)) <= AUTH_PRESENCE_TTL_MS);
}

async function connectMongo() {
    mongoClient = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    await mongoClient.connect();
    mongoDb = mongoClient.db(MONGO_DB_NAME);
    return mongoDb;
}

function getCollection() {
    if (!mongoDb) {
        throw new Error('MongoDB nao inicializado.');
    }
    return mongoDb.collection(APP_DATA_COLLECTION);
}

async function lerDados(tipo) {
    const doc = await getCollection().findOne({ _id: tipo });
    if (!doc || doc.payload === undefined || doc.payload === null) {
        return getDefaultValue(tipo);
    }
    return doc.payload;
}

async function salvarDados(tipo, payload) {
    await getCollection().updateOne(
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

async function obterConfigAuth() {
    const config = await lerDados('config');
    const seguro = (config && typeof config === 'object') ? config : {};
    if (!Array.isArray(seguro.authUsers)) {
        seguro.authUsers = [];
    }
    return seguro;
}

async function garantirUsuariosAuth() {
    const config = await obterConfigAuth();
    if (config.authUsers.length > 0) {
        return config;
    }
    config.authUsers = [{
        id: 'admin-default',
        username: 'admin',
        nome: 'Administrador',
        role: 'admin',
        passwordHash: hashSenha('admin123'),
        active: true,
        passwordUpdatedAt: new Date().toISOString()
    }];
    await salvarDados('config', config);
    return config;
}

async function bootstrap() {
    await connectMongo();

    const portal = createClientPortalServer({
        baseDir: __dirname,
        port: PORT,
        host: HOST,
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
        getMongoOnline: () => true
    });

    try {
        await portal.start();
    } catch (error) {
        if (error?.code !== 'EADDRINUSE') {
            throw error;
        }

        throw new Error(`A porta ${PORT} já está em uso. Feche a instância anterior do portal ou defina CLIENT_PORTAL_PORT para outra porta.`);
    }

    const publicHost = HOST === '0.0.0.0' ? '127.0.0.1' : HOST;
    console.log(`Portal do cliente publicado em http://${publicHost}:${PORT}/cliente/`);
}

bootstrap().catch(async (error) => {
    console.error('Falha ao iniciar portal standalone:', error);
    if (mongoClient) {
        await mongoClient.close().catch(() => {});
    }
    process.exit(1);
});

process.on('SIGINT', async () => {
    if (mongoClient) {
        await mongoClient.close().catch(() => {});
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    if (mongoClient) {
        await mongoClient.close().catch(() => {});
    }
    process.exit(0);
});
