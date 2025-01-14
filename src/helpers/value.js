exports.isEmpty = (value) => {
    return (
        value === undefined ||
        value === null ||
        (Array.isArray(value) && value.length === 0) ||
        (typeof value === 'object' && Object.keys(value).length === 0) ||
        (typeof value === 'string' && value.trim().length === 0) ||
        (typeof value === 'number' && value < 1)
    );
};

exports.isNumeric = (value) => {
    return (
        value === undefined ||
        value === null ||
        !isNaN(Number(value.toString()))
    );
};

exports.isJson = (value) => {
    try {
        let result = typeof value !== 'string' ? JSON.stringify(value) : value;
            result = JSON.parse(result);

        if (typeof result === 'object' && !this.isEmpty(result)) {
            return result;
        }

        throw new Error(false);
    } catch (err) {
        return false;
    }
};

exports.isDomainAddress = (value = '') => {
    if (/^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(value) || value.includes('localhost')) {
        return false;
    }

    return true;
};

exports.randomString = (size = 32, numeric = false, specialchar = false ) => {
    let string = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    let result = '';

    if (numeric) {
        string += '1234567890';
    }

    if (specialchar) {
        string += '!@#$&';
    }

    for (let i = 0; i < size; i++) {
        let random = Math.floor(Math.random() * string.length);
        result += string.charAt(random);
    }

    return result;
};

exports.maskSensitiveData = (data = {}) => {
    let sensitiveKeys = ['secret', 'password'];

    for (let [key, value] of Object.entries(data)) {
        if (sensitiveKeys.includes(key.toLowerCase()) && typeof value === 'string') {
            data[key] = value.replace(/./g, '*');
        }
    }

    return data;
};

exports.parseJson = (value = null) => {
    let result = typeof value !== "string" ? JSON.stringify(value) : value;

    try {
        result = JSON.parse(result);

        if (typeof result === "object" && result !== null) {
            return result;
        }

        return this.parseJson(result);
    } catch (err) {
        return result;
    }
};

exports.nl2br = (value = '') => {
    return value.replace(/\n/g, '<br>');
};

exports.stripHtmlTags = (html) => {
    return html.replace(/<\/?[^>]+(>|$)/g, '');
};

exports.isArrayEqual = (array1 = [], array2 = []) => {
    if (array1.length !== array2.length) {
        return false;
    }

    for (let i in array1) {
        if (array1[i] !== array2[i]) {
            return false;
        }
    }

    return true;
}

exports.sanitizeString = (value = '', replacement = '-') => {
    const entries = ['\\', '/', '?', ':', '*', '"', '>', '<', '|'];

    let sanitized = entries.reduce((acc, entry) => acc.split(entry).join(replacement), value);
        sanitized.trim().replace(/\s+/g, '_');

    return sanitized;
}