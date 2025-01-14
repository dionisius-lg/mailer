const mysql = require('mysql2');
const config = require('./index');

const { database: { host, port, user, password, name } } = config;

const options = {
    host,
    port,
    user,
    password,
    database: name,
    connectionLimit: 5,
    charset: 'utf8mb4_general_ci', 
    multipleStatements: true,
    dateStrings: true
};

const pool = mysql.createPool(options);

pool.getConnection((err, conn) => {
    if (err) {
        console.error(err);
        return;
    }

    console.log(`[pool] is connected. Thread ID: ${conn.threadId}`);
});

module.exports = { pool, escape: mysql.escape };