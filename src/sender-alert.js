const fs = require('fs');
const nodemailer = require('nodemailer');
const config = require('./config');
const dbQueryHelper = require('./helpers/db_query');
const valueHelper = require('./helpers/value');
const logger = require('./helpers/logger');

const { readFileSync, existsSync } = fs;
const { email_template, ticket_url, domain_name } = config;
const { isEmpty } = valueHelper;
const [nodepath, scriptpath, ...args] = process.argv;

(async () => {
    const email_config = await dbQueryHelper.getData({
        table: 'configs',
        conditions: { code: 'EMAIL_NOTIFICATION' }
    });

    if (isEmpty(email_config)) {
        logger.error({
            from: 'sender-alert',
            message: 'Email config not found'
        });
        process.exit(1);
    }

    let account = {};

    try {
        account = JSON.parse(email_config[0].attributes);
    } catch (err) {
        logger.error({
            from: 'sender-alert',
            message: 'Email config attribute not valid'
        });
        process.exit(1);
    }

    await processEmail(account);

    process.exit(1);
})();

async function processEmail(account) {
    const [type, id] = args;

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
        logger.error({
            from: 'sender-alert',
            message: `Transporter creation failed. Error: ${err?.message}`
        });
        return;
    }

    try {
        // verify transporter connection
        await transporter.verify();
    } catch (err) {
        // close transporter
        transporter.close();
        logger.error({
            from: 'sender-alert',
            message: `Could not connect to SMPT server. Error: ${err?.message}`
        });
        return;
    }

    let mail = {
        from: account.sender,
        sender: account.username,
        subject: `[Synergix ALERT] ${domain_name}`,
        to: 'developers@jsm.co.id'
    };

    let mailContent = `There was an error for email ${type}`;

    if (id) {
        mailContent += `. ID:  ${id}`;
    }

    mail.text = mailContent;

    if (existsSync(email_template)) {
        const message = readFileSync(email_template, 'utf-8');
        // replace keyword from email template
        const replacements = {
            '{{ticket_url}}': ticket_url,
            '{{domain_name}}': domain_name,
            '{{email_content}}': mailContent
        };

        mail.html = Object.keys(replacements).reduce((acc, key) => {
            return acc.replace(new RegExp(key, 'g'), replacements[key]);
        }, message);

        delete mail.text;
    }

    try {
        const send = await transporter.sendMail(mail);

        logger.info({
            from: 'sender-alert',
            message: `Email successfully sent to: ${send.envelope.to.join(',')}`
        });
    } catch (err) {
        logger.error({
            from: 'sender-alert',
            message: `Message could not be sent. Error: ${err?.message}`
        });
    }

    // close transporter
    transporter.close();
    return;
}