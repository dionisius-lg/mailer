const imap = require('imapflow');
const dbQueryHelper = require('./helpers/db_query');
const valueHelper = require('./helpers/value');

const { ImapFlow } = imap;
const { isEmpty } = valueHelper;

const result = {
    success: (data = {}) => (console.log({ success: true, data })),
    error: (message = '') => (console.log({ success: false, message }))
};

(async () => {
    const email_config = await dbQueryHelper.getData({
        table: 'configs',
        conditions: { code: 'EMAIL_INBOUND' }
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

    try {
        let data = {};
        // wait until client connects and authorizes
        await client.connect();

        await client.mailboxOpen('INBOX');
        data.message = {
            total: (await client.search()).length,
            unread: (await client.search({ seen: false })).length,
        }
        await client.mailboxClose();

        const quota = await client.getQuota();
        data.storage = quota.storage;

        await client.logout();
        result.success(data);
    } catch (err) {
        result.error(err?.message);
    }

    process.exit(1);
})();