'use strict';

const assert = require('assert');
const GentleSchema = require('../src/GentleSchema');

function run() {
    console.log('Running tests...');

    // 1. basic validate success
    const s1 = new GentleSchema({ name: 'string', age: { type: 'number', min: 0 } });
    const r1 = s1.validate({ name: 'T', age: 5 });
    assert.strictEqual(r1.valid, true);
    assert.strictEqual(r1.value.name, 'T');

    // 2. required / missing
    const s2 = new GentleSchema({ x: { type: 'string', required: true } });
    const r2 = s2.validate({});
    assert.strictEqual(r2.valid, false);
    assert.strictEqual(r2.errors[0].message.includes('is required'), true);

    // 3. refs add/override/remove
    const sr = new GentleSchema({ a: { $ref: 'R' } });
    sr.addRef('R', { type: 'string' });
    assert.strictEqual(typeof sr.resolveRef('R') !== 'undefined', true);
    sr.overrideRef('R', { type: 'number' });
    // now validation of 'a' with number should pass
    const r3 = sr.validate({ a: 1 });
    assert.strictEqual(r3.valid, true);
    sr.removeRef('R');
    assert.strictEqual(typeof sr.resolveRef('R') === 'undefined', true);

    // 4. conditionals
    const sc = new GentleSchema({ type: 'string', data: 'object' }, { refs: { small: { type: 'object', properties: { a: 'string' } } } });
    sc.when('type').is('small').do({ data: { $ref: 'small' } });
    const r4 = sc.validate({ type: 'small', data: { a: 'x' } });
    assert.strictEqual(r4.valid, true);

    // 5. batch aggregated
    const sb = new GentleSchema({ id: 'string', qty: { type: 'number', min: 1 } });
    const batch = sb.batch([{ id: 'a', qty: 1 }, { id: 'b', qty: 0 }], 'validate');
    assert.strictEqual(batch.aggregated.valid, false);
    assert.ok(batch.results.length === 2);

    console.log('All tests passed.');
}

try {
    run();
} catch (err) {
    console.error('Test failure:', err);
    process.exit(1);
}