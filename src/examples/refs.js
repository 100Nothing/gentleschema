'use strict';

const GentleSchema = require('../GentleSchema');

// GentleSchema uses $ref to reference external definitions
const GentleSchemaDef = {
    billing: { $ref: 'address' },
    shipping: { $ref: 'address' },
    metadata: { $ref: 'meta' }
};

const s = new GentleSchema(GentleSchemaDef);

// addRef - will throw if ref already exists
s.addRef('address', {
    type: 'object',
    properties: {
        city: 'string',
        zip: { type: 'string', min: 3 }
    }
});
s.addRef('meta', { type: 'object', properties: { createdBy: 'string' } });

// show resolveRef
console.log('resolveRef(address) ->', s.resolveRef('address'));

// validate a good payload
const good = { billing: { city: 'NY', zip: '10001' }, shipping: { city: 'LA', zip: '90001' }, metadata: { createdBy: 'team' } };
console.log('validate good ->', s.validate(good));

// overrideRef (replace definition)
s.overrideRef('address', {
    type: 'object',
    properties: {
        city: 'string',
        zip: { type: 'string', min: 5 },
        country: { type: 'string', required: false }
    }
});

console.log('post-override validate ->', s.validate(good)); // fails zip length maybe

// removeRef
console.log('removeRef(meta) ->', s.removeRef('meta'));
console.log('resolveRef(meta) ->', s.resolveRef('meta'));