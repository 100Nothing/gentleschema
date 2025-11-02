'use strict';

const GentleSchema = require('../GentleSchema');

const GentleSchemaDef = {
    id: { type: 'string', required: true },
    qty: { type: 'number', min: 1, coerce: true }
};

const s = new GentleSchema(GentleSchemaDef, { coerceTypes: false });

const items = [
    { id: 'a', qty: 2 },
    { id: 'b', qty: '0' },
    { id: 'c', qty: '10' }
];

console.log('--- batch validate (default) ---');
console.log(s.batch(items, 'validate'));

console.log('\n--- batch assertTypes (coercion off, show failures) ---');
console.log(s.batch(items, 'assertTypes'));

console.log('\n--- run benchmark on a single item (1000 iterations) ---');
console.log(s.benchmark({ id: 'x', qty: 99 }, { iterations: 1000, action: 'validate' }));

console.log('\n--- profile the set (warmup=1) ---');
console.log(s.profile(items, { action: 'validate', warmup: 1 }));