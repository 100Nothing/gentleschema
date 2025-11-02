'use strict';

const GentleSchema = require('../GentleSchema');

// pretend Express middleware usage
const GentleSchemaDef = {
    username: { type: 'string', required: true },
    age: { type: 'number', coerce: true, min: 0 },
    meta: { type: 'object', properties: { createdBy: 'string' } }
};

const s = new GentleSchema(GentleSchemaDef, { coerceTypes: true, removeUnknown: true, valueOnly: false });

function expressLikeValidate(reqBody) {
    const res = s.validate(reqBody);
    if (!res.valid) {
        // mimic express response
        return { status: 400, body: res.errors };
    }
    return { status: 200, body: res.value };
}

// example
console.log('valid payload:', expressLikeValidate({ username: 'x', age: '21', extra: 'drop it' }));
console.log('invalid payload:', expressLikeValidate({ username: 'x', age: '-1' }));

// before-save hook (sanitize then persist)
function beforeSaveHook(record) {
    const sanitized = s.sanitize(record);
    if (sanitized.errors && sanitized.errors.length) throw new Error('Record invalid: ' + JSON.stringify(sanitized.errors));
    return sanitized.value;
}
console.log('beforeSaveHook returns sanitized value:', beforeSaveHook({ username: 'A', age: '18', meta: { createdBy: 'me' } }));