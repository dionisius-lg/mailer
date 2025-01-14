const winston = require('winston');
require('winston-daily-rotate-file');
const path = require('path');
const valueHelper = require('./value');

const { resolve } = path;
const { isEmpty } = valueHelper;

exports.success = ({ from = 'server', message = '', result = null }) => {
    const transport = new winston.transports.DailyRotateFile({
        filename: resolve('./', 'logs/success/success-%DATE%.log'),
        datePattern: 'YYYY-MM-DD'
    });

    const logger = winston.createLogger({
        format: winston.format.combine(
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            winston.format.printf((info) => `${info.timestamp} ${JSON.stringify(info.message.log)}`)
        ),
        transports: [new winston.transports.Console(), transport]
    });

    let log = { status: 'success', from, message };

    if (!isEmpty(result)) {
        log.result = result;
    }

    return logger.info({ log });
};

exports.error = ({ from = 'server', message = '', result = null }) => {
    const transport = new winston.transports.DailyRotateFile({
        filename: resolve('./', 'logs/error/error-%DATE%.log'),
        datePattern: 'YYYY-MM-DD'
    });

    const logger = winston.createLogger({
        format: winston.format.combine(
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            winston.format.printf((error) => `${error.timestamp} ${JSON.stringify(error.message.log)}`)
        ),
        transports: [new winston.transports.Console(), transport]
    });

    let log = { status: 'error', from, message };

    if (!isEmpty(result)) {
        log.result = result;
    }

    return logger.error({ log });
};

exports.info = ({ from = 'server', message = '', result = null }) => {
    const transport = new winston.transports.DailyRotateFile({
        filename: resolve('./', 'logs/info/info-%DATE%.log'),
        datePattern: 'YYYY-MM-DD'
    });

    const logger = winston.createLogger({
        format: winston.format.combine(
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            winston.format.printf((info) => `${info.timestamp} ${JSON.stringify(info.message.log)}`)
        ),
        transports: [new winston.transports.Console(), transport]
    });

    let log = { status: 'info', from, message };

    if (!isEmpty(result)) {
        log.result = result;
    }

    return logger.info({ log });
};