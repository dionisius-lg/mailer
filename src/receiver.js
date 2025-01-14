const fs = require('fs');
const cp = require('child_process');
const path = require('path');
const imap = require('imapflow');
const mailparser = require('mailparser');
const dateFormat = require('dateformat');
const config = require('./config');
const dbQueryHelper = require('./helpers/db_query');
const valueHelper = require('./helpers/value');
const socketHelper = require('./helpers/socket');
const logger = require('./helpers/logger');

const { existsSync, mkdirSync, createWriteStream } = fs;
const { spawnSync } = cp;
const { ImapFlow } = imap;
const { simpleParser } = mailparser;
const { email_status, email_inbox_fetch_limit, email_file_dir } = config;
const { isEmpty, stripHtmlTags, randomString, sanitizeString } = valueHelper;

(async () => {
    const app_config = await dbQueryHelper.getData({
        table: 'configs',
        conditions: { code: 'APP' }
    });

    if (isEmpty(app_config)) {
        logger.error({
            from: 'receiver',
            message: 'App config not found'
        });
        process.exit(1);
    }

    try {
        const app_config_attr = JSON.parse(app_config[0].attributes);

        if (isEmpty(app_config_attr)) {
            throw new Error('App config attribute not valid');
        }

        if (app_config_attr?.active_email_inbound !== 'EMAIL_INBOUND') {
            throw new Error(`EMAIL_INBOUND is not selected as default sender. Current sender: ${app_config_attr?.active_email_inbound}`);
        }
    } catch (err) {
        logger.error({
            from: 'receiver',
            message: err?.message
        });
        process.exit(1);
    }

    const email_config = await dbQueryHelper.getData({
        table: 'configs',
        conditions: { code: 'EMAIL_INBOUND' }
    });

    if (isEmpty(email_config)) {
        logger.error({
            from: 'receiver',
            message: 'Email config not found'
        });
        process.exit(1);
    }

    let account = {};

    try {
        account = JSON.parse(email_config[0].attributes);
    } catch (err) {
        logger.error({
            from: 'receiver',
            message: 'Email config attribute not valid'
        });
        process.exit(1);
    }

    // create client
    const client = new ImapFlow({
        host: account?.host,
        port: parseInt(account?.port) || 993,
        secure: account.ssl === true,
        auth: {
            user: account?.username || '',
            pass: account?.password || ''
        }
    });

    await processEmail(client, account);
    process.exit(1);
})();

async function processEmail(client, account) {
    const now = new Date();
    const currentDate = dateFormat(now, 'yyyy-mm-dd HH:MM:ss');
    const blacklistContact = await getBlacklistContact();

    // wait until client connects and authorizes
    await client.connect();

    // select and lock a mailbox. Throws if mailbox does not exist
    let lock = await client.getMailboxLock('INBOX');

    try {
        let messageCount = 0;
        let sequences = [];

        for await (let email of client.fetch({ seen: false, since: new Date('2025-01-14') }, { source: true })) {
            if (messageCount >= email_inbox_fetch_limit) {
                continue;
            }

            let parsed = await simpleParser(email.source);
            let textContent = parsed.text;
            let htmlContent = parsed.html;

            let emailData = {
                email_date: dateFormat(parsed.date, 'yyyy-mm-dd HH:MM:ss'),
                email_from: parsed.from.value[0].address,
                email_to: parsed.to.value.map((row) => row.address).join(';'),
                email_cc: parsed?.cc && parsed.cc.value.map((row) => row.address).join(';') || null,
                email_bcc: parsed?.bcc && parsed.bcc.value.map((row) => row.address).join(';') || null,
                subject: parsed.subject,
                content: (textContent.trim()).length > 0 ? textContent : stripHtmlTags(htmlContent),
                content_html: (htmlContent.trim()).length > 0 ? htmlContent.replace(/<base(.*?)>/, '').replace(/<style>(.*?)<\/style>/gs, '') : textContent,
                email_status_id: email_status.unread,
                contact_name: parsed?.from?.value?.[0].name || null,
                uid: email?.id || 1,
                customer_id: 0,
                direction_id: 1,
                is_complete: 1,
            };

            // get or create customer
            if (!blacklistContact.includes(emailData.email_from)) {
                emailData.customer_id = await getCustomerId(emailData.email_from, emailData.contact_name);
            }

            // insert email inbox to database
            const emailId = await dbQueryHelper.insertData({
                table: 'emails',
                data: emailData
            });

            if (emailId === 0) {
                throw new Error('Failed to save email');
            }

            logger.info({
                from: 'receiver',
                message: `New email inserted. ID ${emailId}`,
                result: emailData
            });

            // check blacklist contact
            if (blacklistContact.includes(emailData.email_from)) {
                throw new Error('Email sender on blacklist contact');
            }

            // check ticket
            let tickets = await dbQueryHelper.getData({
                table: 'tickets',
                conditions: {
                    contact: emailData.email_from,
                    parent_id: 0, // look only parent ticket
                    sort: 'desc',
                    order: 'id',
                    limit: 1
                },
                customConditions: ['ticket_status_id != 6']
            });

            let ticket_id = tickets[0].id;
            let ticket_media_id = 0;
            let ticket_history_id = 0;

            // exist non close ticket
            if (tickets.length > 0) {
                // update ticket is_reply_customer
                await dbQueryHelper.updateData({
                    table: 'tickets',
                    data: {
                        is_reply_customer: 1,
                        subject: emailData.subject
                    },
                    conditions: { id: ticket_id }
                });

                // linked new email to existing non close ticket
                ticket_media_id = await dbQueryHelper.insertData({
                    table: 'ticket_medias',
                    data: {
                        ticket_id,
                        media_id: 2,
                        direction_id: 1,
                        record_id: emailId
                    }
                });

                if (ticket_media_id > 0) {
                    logger.info({
                        from: 'receiver',
                        message: `New Email linked with existing ticket. Email ID: ${emailId}`
                    });
                }
            } else {
                ticket_id = await dbQueryHelper.insertData({
                    table: 'tickets',
                    data: {
                        ticket_status_id: 1, // new
                        media_id: 2,
                        new_date: currentDate,
                        subject: emailData.subject,
                        customer_id: emailData.customer_id,
                        contact: emailData.email_from,
                        is_from_customer: 1,
                        is_active: 1
                    }
                });

                if (ticket_id > 0) {
                    logger.info({
                        from: 'receiver',
                        message: `New ticket inserted. ID ${ticket_id}`
                    });

                    tickets = await dbQueryHelper.getData({
                        table: 'tickets',
                        conditions: {
                            id: ticket_id,
                            limit: 1
                        }
                    });

                    ticket_history_id = await dbQueryHelper.insertData({
                        table: 'ticket_histories',
                        data: {
                            ticket_id,
                            ticket_status_id: 1,
                            note: 'Ticket Created by System'
                        }
                    });

                    ticket_media_id = await dbQueryHelper.insertData({
                        table: 'ticket_medias',
                        data: {
                            ticket_id,
                            media_id: 2,
                            direction_id: 1,
                            record_id: emailId,
                            is_ticket_source: 1
                        }
                    });

                    // autoreply new ticket
                    if (account.autoreply) {
                        emailAutoreply(emailData, tickets[0], account);
                    }

                    if (ticket_history_id > 0) {
                        logger.info({
                            from: 'receiver',
                            message: `Ticket history inserted. Ticket ID: ${ticket_id}`
                        });
                    }

                    if (ticket_media_id > 0) {
                        logger.info({
                            from: 'receiver',
                            message: `New Email linked with new ticket. Ticket ID: ${ticket_id}`
                        });
                    }
                }
            }

            if (parsed?.attachments && parsed.attachments.length > 0) {
                await saveAttachment(parsed.attachments, { ...emailData, id: emailId });
            }

            socketHelper.send('/email_notif');

            sequences.push(email.seq);
            messageCount++;
        }

        if (sequences.length > 0) {
            await client.messageFlagsAdd(sequences, ["\\Seen"]);
        }
    } catch (err) {
        logger.error({
            from: 'receiver',
            message: err?.message
        });

        if (err?.message === 'Failed to save email') {
            const exec = spawnSync('node', [path.join(__dirname, 'sender-alert'), 'receiver'], { encoding: 'utf-8'});

            if (exec?.stdout) {
                console.log(exec.stdout);
            }

            if (exec?.error) {
                console.log(exec.error);
            }
        }
    }

    lock.release();
    await client.close();
}

async function getBlacklistContact() {
    let result = [];

    const contacts = await dbQueryHelper.getData({
        table: 'blacklist_contacts',
        conditions: {
            media_id: 2,
            is_active: 1,
            sort: 'desc',
            order: 'id'
        }
    });

    if (contacts.length > 0) {
        result = contacts.map((row) => row.contact);
    }

    return result;
}

async function getCustomerId(contact = '', fullname = '') {
    const customerContacts = await dbQueryHelper.getData({
        table: 'customer_contacts',
        conditions: {
            contact,
            order: 'id',
            sort: 'desc',
            limit: 1
        }
    });

    if (customerContacts.length > 0) {
        return customerContacts[0].customer_id;
    }

    const customer_id = await dbQueryHelper.insertData({
        table: 'customers',
        data: {
            fullname: !isEmpty(fullname) ? fullname: contact,
            random_id: randomString(8, true)
        }
    });

    if (customer_id > 0) {
        dbQueryHelper.insertData({
            table: 'customer_contacts',
            data: {
                customer_id,
                customer_contact_type_id: 2,
                contact
            }
        });
    }

    return customer_id;
}

async function saveAttachment(attachments, email) {
    // define attachment path then replace multiple slash to single slash
    const filepath = (email_file_dir + '/' + dateFormat(new Date(), 'yyyy/mm/dd') + `/${email.id}`).replace(/\/+/g, '/');

    if (!existsSync(filepath)) {
        mkdirSync(filepath, { mode: 0o777, recursive: true });
    }

    let mediaAttachmentData = [];

    for (let attachment of attachments) {
        try {
            let filename = sanitizeString(attachment.filename);
            let stream = createWriteStream(`${filepath}/${filename}`);

            stream.write(attachment.content, (err) => {
                if (err) throw new Error(err?.message);
            });

            stream.end();

            mediaAttachmentData.push({
                media_id: 2,
                ref_id: email.id,
                path: filepath,
                file_name: filename,
                file_size: attachment.size,
                mime_type: attachment.contentType
            });
        } catch (err) {
            logger.error({
                from: 'receiver',
                message: `Error writing attachment ${attachment.filename}. ${err.message}`
            });
            continue;
        }
    }

    if (mediaAttachmentData.length > 0) {
        const media_attachment_ids = await dbQueryHelper.insertManyData({
            table: 'media_attachments',
            data: mediaAttachmentData
        });

        if (media_attachment_ids.length > 0) {
            logger.info({
                from: 'receiver',
                message: `Email attachment inserted. Total: ${media_attachment_ids.length} data`
            });
        }
    }
}

async function emailAutoreply(email, ticket, account) {
    let contentAutoreply = '';

    if (account.autoreply) {
        contentAutoreply = await getContentAutoreply();
    }

    if (isEmpty(contentAutoreply)) {
        logger.error({
            from: 'receiver',
            message: 'Content autoreply not found'
        });
        return {};
    }

    const search = ['[CUSTOMER_FULLNAME]', '[TICKET_NO]'];
    const replace = [email.contact_name || email.email_from, ticket?.ticket_no || ''];

    search.forEach((v, i) => {
        contentAutoreply = contentAutoreply.replace(new RegExp(v, 'g'), replace[i]);
    });

    const emailData = {
        email_date: dateFormat(new Date(), 'yyyy-mm-dd HH:MM:ss'),
        email_from: config.email.inbox.username,
        email_to: email.email_from,
        subject: `Auto Reply: ${email.subject}`,
        content: contentAutoreply,
        content_html: contentAutoreply,
        email_status_id: email_status.queued, // queue
        direction_id: 2, // outbound
        contact_name: email.contact_name || email.from,
        uid: email.uid,
        customer_id: email.customer_id,
        is_complete: 1,
        is_autoreply: 1
    };

    const emailId = await dbQueryHelper.insertData({
        table: 'emails',
        data: emailData
    });

    if (emailId > 0) {
        logger.info({
            from: 'receiver',
            message: `Email autoreply inserted. ID ${emailId}`
        });

        // linked new email to existing non close ticket
        const ticket_media_id = await dbQueryHelper.insertData({
            table: 'ticket_medias',
            data: {
                ticket_id: ticket.id,
                media_id: 2,
                direction_id: 2,
                record_id: emailId
            }
        });

        if (ticket_media_id > 0) {
            logger.info({
                from: 'receiver',
                message: `New email autoreply linked with existing ticket. Email ID: ${emailId}`
            });
        }

        return { emailData, id: emailId };
    }

    return {};
}

async function getContentAutoreply() {
    const now = new Date();
    const currentDate = dateFormat(now, 'yyyy-mm-dd');
    const currentDay = dateFormat(now, 'N');
    let result = '';

    const officeHours = await dbQueryHelper.getData({
        table: 'office_hours',
        conditions: { id: currentDay, limit: 1 }
    });

    const mediaAutoReplies = await dbQueryHelper.getData({
        table: 'media_autoreplies',
        condition: {
            sort: 'autoreply_type_id',
            order: 'desc'
        },
        customConditions: [
            `(autoreply_type_id IN (1,2,3) OR ( autoreply_type_id = 4 AND FIND_IN_SET(${currentDate}, event_date)))`,
            'media_id = 2',
            'is_active = 1'
        ]
    });

    for (let i in mediaAutoReplies) {
        let { autoreply_type_id, content } = mediaAutoReplies[i];

        // special day
        if (autoreply_type_id === 4) {
            result = content;
            break;
        }

        // full day
        if (autoreply_type_id === 3) {
            result = content;
            break;
        }

        if (officeHours.length > 0 && officeHours[0]?.cc_is_active === 1) {
            let start = new Date(`${currentDate}T${officeHours[0]?.cc_start_time}`);
            let end = new Date(`${currentDate}T${officeHours[0]?.cc_end_time}`);

            if (now.getTime() >= start.getTime() && now.getTime() <= end.getTime()) {
                // office
                if (autoreply_type_id === 2) {
                    result = content;
                    break;
                }
            } else {
                // after office
                if (autoreply_type_id === 2) {
                    result = content;
                    break;
                }
            }
        } else {
            // after office
            if (autoreply_type_id === 2) {
                result = content;
                break;
            }
        }
    }

    return result;
}