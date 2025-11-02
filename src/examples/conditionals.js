'use strict';

const GentleSchema = require('../GentleSchema');

const GentleSchema = {
    kind: { type: 'string', required: true },
    payload: { type: 'object' }
};

const refs = {
    small: { type: 'object', properties: { a: { type: 'string', required: true } } },
    large: { type: 'object', properties: { a: 'string', b: { type: 'number', required: true } } }
};

const s = new GentleSchema(GentleSchema, { refs: refs, removeUnknown: true });

// conditional fragments: if kind === 'small' apply small ref, if 'large' apply large ref
s.when('kind').is('small').do({
    payload: { $ref: 'small' }
});
s.when('kind').is('large').do({
    payload: { $ref: 'large' }
});

console.log('small valid ->', s.validate({ kind: 'small', payload: { a: 'hello' } }));
console.log('small invalid ->', s.validate({ kind: 'small', payload: { b: 1 } })); // missing `a`
console.log('large invalid ->', s.validate({ kind: 'large', payload: { a: 'x' } })); // missing b
console.log('large valid ->', s.validate({ kind: 'large', payload: { a: 'x', b: 5 } }));