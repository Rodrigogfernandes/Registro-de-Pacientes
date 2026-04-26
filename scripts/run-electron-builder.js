const { spawn } = require('child_process');

const electronBuilderBin = require.resolve('electron-builder/cli.js');
const args = process.argv.slice(2);
const env = {
    ...process.env,
    CSC_IDENTITY_AUTO_DISCOVERY: 'false'
};

const child = spawn(process.execPath, [electronBuilderBin, ...args], {
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
    console.error('Falha ao iniciar o electron-builder:', error.message);
    process.exit(1);
});
