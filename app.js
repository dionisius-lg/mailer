const cp = require('child_process');
const cron = require('node-cron');
const path = require('path');

const { spawn } = cp;

let isReceiving = false;
let isSending = false;

cron.schedule('*/1 * * * *', async () => {
    const script = path.join(__dirname, 'src', 'receiver.js');

    if (isReceiving) {
        console.log(`Task is already running ${script}`);
        return;
    }

    console.log(`Starting task ${script}`);
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
        console.log(`Finish task ${script}`);
        isReceiving = false;
    });

    exec.on('error', (err) => {
        console.log(`Error task ${script}. ${err?.message}`);
        isReceiving = false;
    });
});

cron.schedule('*/2 * * * *', async () => {
    const script = path.join(__dirname, 'src', 'sender.js');

    if (isSending) {
        console.log(`Task is already running ${script}`);
        return;
    }

    console.log(`Starting task ${script}`);
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
        console.log(`Finish task ${script}`);
        isSending = false;
    });

    exec.on('error', (err) => {
        console.log(`Error task ${script}. ${err?.message}`);
        isSending = false;
    });
});