const cp = require('child_process');
const cron = require('node-cron');
const path = require('path');

const { spawn } = cp;

let isReceiving = false;
let isSending = false;
let isResending = false;

cron.schedule('*/2 * * * *', async () => {
    const script = path.join(__dirname, 'src', 'receiver.js');

    if (isReceiving) {
        console.log(`[receiver] task already running`);
        return;
    }

    console.log(`[receiver] task starting...`);
    isReceiving = true;

    const exec = spawn('node', [script]);

    exec.stdout.on('data', (data) => {
        const buffer = Buffer.from(data);
        console.log(buffer.toString('utf-8'));
    });

    exec.stderr.on('data', (data) => {
        const buffer = Buffer.from(data);
        console.log(buffer.toString('utf-8'));
    });

    exec.on('close', () => {
        console.log(`[receiver] task finished`);
        isReceiving = false;
    });

    exec.on('error', (err) => {
        console.log(`[receiver] task error. ${err?.message}`);
        isReceiving = false;
    });
});

cron.schedule('*/2 * * * *', async () => {
    const script = path.join(__dirname, 'src', 'sender.js');

    if (isSending) {
        console.log(`[sender] task already running`);
        return;
    }

    console.log(`[sender] task starting...`);
    isSending = true;

    const exec = spawn('node', [script]);

    exec.stdout.on('data', (data) => {
        const buffer = Buffer.from(data);
        console.log(buffer.toString('utf-8'));
    });

    exec.stderr.on('data', (data) => {
        const buffer = Buffer.from(data);
        console.log(buffer.toString('utf-8'));
    });

    exec.on('close', () => {
        console.log(`[sender] task finished`);
        isSending = false;
    });

    exec.on('error', (err) => {
        console.log(`[sender] task error. ${err?.message}`);
        isSending = false;
    });
});

cron.schedule('*/3 * * * *', async () => {
    const script = path.join(__dirname, 'src', 'sender.js');

    if (isResending) {
        console.log(`[resender] task already running`);
        return;
    }

    console.log(`[resender] task starting...`);
    isResending = true;

    const exec = spawn('node', [script, 'error']);

    exec.stdout.on('data', (data) => {
        const buffer = Buffer.from(data);
        console.log(buffer.toString('utf-8'));
    });

    exec.stderr.on('data', (data) => {
        const buffer = Buffer.from(data);
        console.log(buffer.toString('utf-8'));
    });

    exec.on('close', () => {
        console.log(`[resender] task finished`);
        isResending = false;
    });

    exec.on('error', (err) => {
        console.log(`[resender] task error. ${err?.message}`);
        isResending = false;
    });
});