const fs = require('fs');
const cp = require('child_process');
const nodemailer = require('nodemailer');
const dateFormat = require('dateformat');
const config = require('./config');
const dbQueryHelper = require('./helpers/db_query');
const valueHelper = require('./helpers/value');
const socketHelper = require('./helpers/socket');
const logger = require('./helpers/logger');

const { readFileSync, existsSync } = fs;
const { spawnSync } = cp;
const { email_status, email_template_status, email_template, ticket_url, domain_name } = config;
const { isEmpty, nl2br } = valueHelper;
const [nodepath, scriptpath, ...args] = process.argv;

(async () => {
    const [status] = args;

    const email_config = await dbQueryHelper.getData({
        table: 'configs',
        conditions: { code: 'EMAIL_NOTIFICATION' }
    });

    if (isEmpty(email_config)) {
        logger.error({
            from: 'sender-notification',
            message: 'Email config not found'
        });
        process.exit(1);
    }

    let account = {};

    try {
        account = JSON.parse(email_config[0].attributes);
    } catch (err) {
        logger.error({
            from: 'sender-notification',
            message: 'Email config attribute not valid'
        });
        process.exit(1);
    }

    const email_status_id = status && email_status?.[status] || email_status.queued;
    const emails = await dbQueryHelper.getData({
        table: 'emails',
        conditions: {
            is_complete: 1,
            direction_id: 2,
            email_from: account.username,
            email_status_id
        },
        customConditions: [`DATE(emails.email_date) = DATE(NOW())`]
    });

    if (!isEmpty(account) && !isEmpty(emails) && Array.isArray(emails)) {
        await processEmail(account, emails);
    }

    process.exit(1);
})();

async function processEmail(account, emails) {
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
            from: 'sender-notification',
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
            from: 'sender-notification',
            message: `Could not connect to SMPT server. Error: ${err?.message}`
        });
        return;
    }

    for (let row of emails) {
        const updateProcess = await dbQueryHelper.updateData({
            table: 'emails',
            data: { email_status_id: email_status.process },
            conditions: { id: row.id }
        });

        if (updateProcess === 0) {
            logger.error({
                from: 'sender-notification',
                message: `Email failed to process || Error to update status to PROCESS. Email ID: ${row.id}`
            });
            continue;
        }

        const mailContent = nl2br(row.content_html);
        let mailBody = mailContent;

        if (email_template_status && existsSync(email_template)) {
            // use html email template
            const message = readFileSync(email_template, 'utf-8');
            // replace keyword from email template
            const replacements = {
                '{{ticket_url}}': ticket_url,
                '{{domain_name}}': domain_name,
                '{{email_content}}': mailContent
            };

            mailBody = Object.keys(replacements).reduce((acc, key) => {
                return acc.replace(new RegExp(key, 'g'), replacements[key]);
            }, message);
        }

        let mail = {
            from: account.sender,
            sender: account.username,
            subject: row.subject,
            html: mailBody
        };

        const addressPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        // set recipient
        if (!isEmpty(row?.email_to)) {
            mail.to = row.email_to.split(';').map((value) => value.trim()).filter((address) => addressPattern.test(address)).join(', ');
        }

        // set carbon copy
        if (!isEmpty(row?.email_cc)) {
            mail.cc = row.email_cc.split(';').map((value) => value.trim()).filter((address) => addressPattern.test(address)).join(', ');
        }

        // set blind carbon copy
        if (!isEmpty(row?.email_bcc)) {
            mail.bcc = row.email_bcc.split(';').map((value) => value.trim()).filter((address) => addressPattern.test(address)).join(', ');
        }

        // attach file
        let attachments = getAttachments(row.id);

        if (!isEmpty(attachments)) {
            mail.attachments = attachments;
        }

        try {
            const send = await transporter.sendMail(mail);

            const updateSent = await dbQueryHelper.updateData({
                table: 'emails',
                data: { email_status_id: email_status.sent, email_sent_date: dateFormat(new Date, 'yyyy-mm-dd HH:MM:ss') },
                conditions: { id: row.id }
            });

            if (updateSent === 0) {
                logger.error({
                    from: 'sender-notification',
                    message: `Email successfully sent to: ${send.envelope.to.join(',')} || Error to update status to SENT. Email ID: ${row.id}`
                });
            } else {
                logger.info({
                    from: 'sender-notification',
                    message: `Email successfully sent to: ${send.envelope.to.join(',')}`
                });
            }

            socketHelper.send('/email_notif');
        } catch (err) {
            const updateError = await dbQueryHelper.updateData({
                table: 'emails',
                data: { email_status_id: email_status.error, error_info: err?.message },
                conditions: { id: row.id }
            });

            if (updateError > 0) {
                logger.error({
                    from: 'sender-notification',
                    message: `Email failed to send || Error to update status to ERROR. Email ID: ${row.id}. Error: ${err?.message}`
                });
            } else {
                logger.error({
                    from: 'sender-notification',
                    message: `Email failed to send. Email ID: ${row.id}. Error: ${err?.message}`
                });
            }

            const exec = spawnSync('node', [path.join(__dirname, 'sender-alert'), 'sender', row.id], { encoding: 'utf-8'});

            if (exec?.stdout) {
                console.log(exec.stdout);
            }

            if (exec?.error) {
                console.log(exec.error);
            }
        }
    }

    // close transporter
    transporter.close();
    return;
}

async function getAttachments(email_id) {
    const attachments = await dbQueryHelper.getData({
        table: 'media_attachments',
        conditions: {
            media_id: 2,
            ref_id: email_id
        }
    });

    if (attachments.length > 0) {
        const result = attachments.map((row) => ({ filename: row.file_name, path: row.path }));

        return result;
    }

    return [];
}