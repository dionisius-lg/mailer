const database = require('./../config/database');
const valueHelper = require('./value');

const { pool, escape } = database;
const { isEmpty, isNumeric, isArrayEqual } = valueHelper;

exports.getData = ({ table = '', conditions = {}, customConditions = [] }) => new Promise((resolve) => {
    if (isEmpty(table)) {
        return resolve([]);
    }

    let query = `SELECT * FROM ${table}`;
    let conditionQuery = [];
    let orderQuery = '';
    let limitQuery = '';

    if (!isEmpty(conditions)) {
        if (conditions?.order) {
            if (!isEmpty(conditions.order) && typeof conditions.order === 'string') {
                orderQuery = `ORDER BY ${conditions.order}`;
            }

            delete conditions.order;
        }

        if (conditions?.sort) {
            if (typeof conditions.sort === 'string' && ['ASC', 'DESC'].includes((conditions.sort).toUpperCase()) && !isEmpty(orderQuery)) {
                orderQuery += ` ${(conditions.sort).toUpperCase()}`;
            }

            delete conditions.sort;
        }

        if (conditions?.limit) {
            if (isNumeric(conditions.limit)) {
                limitQuery = `LIMIT ${conditions.limit}`;
            }

            delete conditions.limit;
        }

        Object.keys(conditions).forEach((key) => {
            let value = conditions[key];

            switch (true) {
                case !isEmpty(value) && ['string', 'number'].includes(typeof value):
                    conditionQuery.push(`${key} = ${escape(value)}`);
                    break;
                case !isEmpty(value) && Array.isArray(value):
                    conditionQuery.push(`${key} IN (${escape(value)})`);
                case isEmpty(value) && value === null:
                    conditionQuery.push(`${key} IS NULL`);
            };
        });
    }

    if (!isEmpty(customConditions)) {
        conditionQuery.push(...customConditions);
    }

    if (!isEmpty(conditionQuery)) {
        conditionQuery = conditionQuery.join(' AND ');
        query += ` WHERE ${conditionQuery}`;
    }

    if (!isEmpty(orderQuery)) {
        query += ` ${orderQuery}`;
    }

    if (!isEmpty(limitQuery)) {
        query += ` ${limitQuery}`;
    }
if (table === 'emails') console.log(query)
    pool.query(query, (err, res) => {
        if (err) return resolve([]);

        resolve(res);
    });
});

exports.insertData = ({ table = '', data = {} }) => new Promise((resolve) => {
    if (isEmpty(table) || isEmpty(data)) {
        return resolve(0);
    }

    let query = `INSERT INTO ${table}`;
    let dataQuery = [];

    Object.keys(data).forEach((key) => {
        let value = data[key];

        switch (true) {
            case !isEmpty(value) && ['string', 'number'].includes(typeof value):
                dataQuery.push(`${key} = ${escape(value)}`);
                break;
            case isEmpty(value) && value === null:
                dataQuery.push(`${key} = NULL`);
                break;
        };
    });

    if (isEmpty(dataQuery)) {
        return resolve(0);
    }

    dataQuery = dataQuery.join(', ');
    query += ` SET ${dataQuery}`;

    pool.query(query, (err, res) => {
        if (err) return resolve(0);

        resolve(res.insertId);
    });
});

exports.insertManyData = ({ table = '', data = [] }) => new Promise((resolve) => {
    if (isEmpty(table) || isEmpty(data)) {
        return resolve([]);
    }

    data = data.map((item) => Object.fromEntries(
        Object.entries(item)
            .filter(([key, value]) => value !== undefined && value !== false)
            .map(([key, value]) => [key, value === '' ? null : value])
        ));

    const keys = Object.keys(data[0]);
    const column = keys.join(', ');

    let query = `INSERT INTO ${table} (${column}) VALUES ?`;
    let values = [];

    for ( let i in data) {
        let tempKeys = Object.keys(data[i]);

        // if index and 'data order' on each object not the same
        if (!isArrayEqual(keys, tempKeys)) {
            continue;
        }

        let tempValue = tempKeys.map((k) => {
            let value = data[i][k];

            if (typeof value === 'string') {
                value = value.trim();
            }

            return value;
        });

        if (isEmpty(tempValue)) {
            continue;
        }

        values.push(tempValue);
    }

    if (values.length === 0) {
        return resolve([]);
    }

    pool.query(query, [values], (err, res) => {
        if (err) return resolve([]);

        let result = [];

        for (let j = 0; j < res.affectedRows; j++) {
            result.push({ id: parseInt(res.insertId) + j });
        }

        resolve(result);
    });
});

exports.updateData = ({ table = '', data = {}, conditions = {}, customConditions = [] }) => new Promise((resolve) => {
    if (isEmpty(table) || isEmpty(data)) {
        return resolve(0);
    }

    let query = `UPDATE ${table}`;
    let dataQuery = [];
    let conditionQuery = [];

    Object.keys(data).forEach((key) => {
        let value = data[key];

        switch (true) {
            case !isEmpty(value) && ['string', 'number'].includes(typeof value):
                dataQuery.push(`${key} = ${escape(value)}`);
                break;
            case isEmpty(value) && value === null:
                dataQuery.push(`${key} = NULL`);
        };
    });

    Object.keys(conditions).forEach((key) => {
        let value = conditions[key];

        switch (true) {
            case !isEmpty(value) && ['string', 'number'].includes(typeof value):
                conditionQuery.push(`${key} = ${escape(value)}`);
                break;
            case !isEmpty(value) && Array.isArray(value):
                conditionQuery.push(`${key} IN (${escape(value)})`);
            case isEmpty(value) && value === null:
                conditionQuery.push(`${key} IS NULL`);
        };
    });

    if (!isEmpty(customConditions)) {
        conditionQuery.push(...customConditions);
    }

    if (isEmpty(dataQuery) || isEmpty(conditionQuery)) {
        return resolve(0);
    }

    dataQuery = dataQuery.join(', ');
    conditionQuery = conditionQuery.join(' AND ');
    query += ` SET ${dataQuery} WHERE ${conditionQuery}`;

    pool.query(query, (err, res) => {
        if (err) return resolve(0);

        resolve(1);
    });
});

exports.deleteData = ({ table = '', conditions = {}, customConditions = [] }) => new Promise((resolve) => {
    if (isEmpty(table)) {
        return resolve(0);
    }

    let query = `DELETE FROM ${table}`;
    let conditionQuery = [];

    Object.keys(conditions).forEach((key) => {
        let value = conditions[key];

        switch (true) {
            case !isEmpty(value) && ['string', 'number'].includes(typeof value):
                conditionQuery.push(`${key} = ${escape(value)}`);
                break;
            case !isEmpty(value) && Array.isArray(value):
                conditionQuery.push(`${key} IN (${escape(value)})`);
            case isEmpty(value) && value === null:
                conditionQuery.push(`${key} IS NULL`);
        };
    });

    if (!isEmpty(customConditions)) {
        conditionQuery.push(...customConditions);
    }

    if (isEmpty(conditionQuery)) {
        return resolve(0);
    }

    conditionQuery = conditionQuery.join(' AND ');
    query += ` WHERE ${conditionQuery}`;

    pool.query(query, (err, res) => {
        if (err) return resolve(0);

        resolve(res.affectedRows);
    });
});

exports.executeQuery = ({ query = '' }) => new Promise((resolve) => {
    if (isEmpty(query)) {
        return resolve(null);
    }

    pool.query(query, (err, res) => {
        if (err) return resolve(null);

        resolve(res);
    });
});