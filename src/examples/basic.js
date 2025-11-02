'use strict';

const GentleSchema = require('../GentleSchema');

const GentleSchemaDef = {
    name: { type: 'string', required: true },
    age: { type: 'number', required: true, min: 0, errorMessage: 'Age must be a non-negative number' },
    email: { type: 'string', regex: /^[^@]+@[^@]+\.[^@]+$/, required: true }
};

const s = new GentleSchema(GentleSchemaDef, { removeUnknown: false });

const ok = { name: 'Alice', age: 30, email: 'a@b.com' };
const bad = { name: 'Bob', age: -1, email: 'nope', extra: 123 };

console.log('--- basic validate ok ---');
console.log(s.validate(ok));

console.log('\n--- basic validate bad ---');
console.log(s.validate(bad));

console.log('\n--- enforce throws on invalid (catching) ---');
try {
    s.enforce(bad);
} catch (err) {
    console.log('enforce threw ValidationError:', err.name);
    console.log(err.errors);
}