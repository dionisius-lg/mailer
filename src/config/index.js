const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: './.env' });

const config = {
    env: process.env.NODE_ENV || 'development',
    database: {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT)  || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        name: process.env.DB_NAME || 'test'
    },
    socket: {
        url: process.env.SOCKET_URL || 'http://localhost:8002',
        key: process.env.SOCKET_KEY || ''
    },
    email_status: {
        unread: 1,
        read: 2,
        queued: 3,
        process: 4,
        sent: 5,
        error: 6,
        broadcast_queued: 35,
        broadcast_process: 36,
        broadcast_sent: 37,
        broadcast_error: 38 
    },
    email_inbox_fetch_limit: parseInt(process.env.EMAIL_INBOX_FETCH_LIMIT) || 20,
    email_file_dir: process.env.EMAIL_FILE_DIR || '/',
    email_template_status: parseInt(process.env.EMAIL_TEMPLATE_STATUS) === 1,
    email_template: path.join(__dirname,  '..', 'templates', 'email.html'),
    ticket_url: process.env.TICKET_URL || '',
    domain_name: process.env.DOMAIN_NAME || '',
};

module.exports = config;