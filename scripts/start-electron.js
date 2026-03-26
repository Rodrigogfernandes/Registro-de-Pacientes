const { spawn } = require('child_process');

const electronModule = require('electron');
const electronBinary = typeof electronModule === 'string'
    ? electronModule
    : electronModule?.default || electronModule;

if (!electronBinary || typeof electronBinary !== 'string') {
    throw new Error('Nao foi possivel localizar o executavel do Electron.');
}

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronBinary, ['.'], {
    stdio: 'inherit',
    env,
    windowsHide: false
});

child.on('exit', (code, signal) => {
    if (signal) {
        process.kill(process.pid, signal);
        return;
    }
    process.exit(code ?? 0);
});

child.on('error', (error) => {
    console.error('Falha ao iniciar o Electron:', error.message);
    process.exit(1);
});
