const nodemailer = require('nodemailer');
const dbQueryHelper = require('./helpers/db_query');
const valueHelper = require('./helpers/value');

const { isEmpty } = valueHelper;

const result = {
    success: (data = {}) => (console.log({ success: true, data })),
    error: (message = '') => (console.log({ success: false, message }))
};

(async () => {
    const email_config = await dbQueryHelper.getData({
        table: 'configs',
        conditions: { code: 'EMAIL_OUTBOUND' }
    });

    if (isEmpty(email_config)) {
        result.error('Email config not found');
        process.exit(1);
    }

    let account = {};

    try {
        account = JSON.parse(email_config[0].attributes);
    } catch (err) {
        result.error('Email config attribute not valid');
        process.exit(1);
    }

    let transporter = null;

    try {
        // create transporter
        transporter = nodemailer.createTransport({
            host: account.host,
            port: parseInt(account.port),
            secure: parseInt(account.port) === 465,
            auth: {
                user: account.username,
                pass: account.password
            },
            tls: {
                rejectUnauthorized: false, // do not fail on invalid certs
            },
            logger: true, // enable logging for debugging
            debug: true // show debug output
        });
    } catch (err) {
        result.error(`Transporter creation failed. Error: ${err?.message}`);
        process.exit(1);
    }

    try {
        // verify transporter connection
        await transporter.verify();
    } catch (err) {
        // close transporter
        transporter.close();
        result.error(`Could not connect to SMPT server. Error: ${err?.message}`);
        process.exit(1);
    }

    // close transporter
    transporter.close();
    result.success({
        host: `${account.layer}://${account.host}`,
        port: account.port,
        username: account.username
    });
    process.exit(1);
})();