const axios = require('axios');
const config = require('./../config');
// const logger = require('./logger');
const valueHelper = require('./value');

const { socket: { url, key } } = config;
const { isJson } = valueHelper;

const instance = axios.create({
    baseURL: url,
    headers: { 'Accept': 'application/json', 'App-Key': `${key}` }
});

const send = async (endpoint, body) => {
    const result = await instance.post(endpoint, body || {}).catch(handleError);

    return result.data;
};

const handleError = (err) => {
    if (err.response) {
        let request = response = null;

        if (err?.config?.data && isJson(err.config.data)) {
            request = JSON.parse(err.config.data);
        }

        if (err.response?.data && isJson(err.response.data)) {
            response = err.response.data;
        }

        // logger.error({
        //     from: 'socket-api',
        //     message: err?.message || 'socket api error',
        //     result: { request, response }
        // });

        return err.response;
    }

    // logger.error({
    //     from: 'socket-api',
    //     message: err?.message || 'Internal Server Error'
    // });

    return {
        status: 500,
        data: { error_message: err?.message || 'Internal Server Error' }
    };
};

module.exports = { send };