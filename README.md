[Current: v1.0.0](https://github.com/100Nothing/gentleschema/releases/tag/v1.0.0)

# GentleSchema

A compact, safe, fast, developer-friendly JavaScript **GentleSchema validator**.
Define schemas, validate objects, sanitize input, use conditionals, coercion, refs, and get excellent error messages — all without heavy dependencies.

## Install

```
npm install gentleschema
```

## Quick Start

```js
const GentleSchema = require('gentleschema');

const user = new GentleSchema({
  name: { type: 'string', required: true },
  age:  { type: 'number', min: 0 },
  email: { type: 'string', regex: /^[^@]+@[^@]+\.[^@]+$/ }
});

console.log(user.validate({ name: "Alice", age: 20 }));
// -> { valid: true, value: { name:"Alice", age:20 }, errors: [] }

console.log(user.validate({ name: 123 }));
// -> { valid:false, errors:[{ path:"name", message:"Invalid name field. expected type string, received number" }], value:{name:123} }
```

## Why this module?

* **Simple**: No overbuilt JSON GentleSchema complexity.
* **Clear errors**: Friendly messages, useful for debugging or API responses.
* **Refs**: Share schema fragments across instances.
* **Conditionals**: `when().is().do()` for dynamic rules.
* **Fast**: Micro-optimized where it matters.
* **Safe**: Defensive checks, strong null rules, hard regex length limit.
* **Real-world ready**: Works great in APIs, DB layers, services, workers.


# API Summary (Concise but Complete)

## Constructor

### `new GentleSchema(schemaDef, options?)`

* `schemaDef` — Object defining fields and validation rules.
  Supports nested properties, arrays, constructors (Date), `$ref`, `$defs`, shorthand `"string"` etc.
* `options` — Instance options:

  * `failFast`
  * `removeUnknown`
  * `strict`
  * `valueOnly`
  * `coerceTypes`
  * `removeEmpty`
  * `nullable`
  * `strictEnum`
  * `maxRegexLength`
  * `refs` (object or array with `{ name, def }`)
  * `conditionalsCacheSize`

# Core Methods

### `validate(obj, options?)`

Returns:

```
{ valid: boolean, errors: [...], value: sanitizedValue }
```

### `enforce(obj, options?)`

Returns the sanitized object OR throws a `ValidationError`.

### `sanitize(obj, options?)`

Returns `{ value, errors }` or just value if `valueOnly` is enabled.

### `check(obj, options?)`

Boolean shorthand for “valid?”.

### `assertTypes(obj, options?)`

Type-only check — structure-safe, ignores business rules like min, regex, validators.

### `batch(array, action?, options?)`

Runs `validate`, `sanitize`, or `enforce` on arrays in bulk.

# Conditional Rules

### `when(pathOrPredicate).is(valueOrFn).do(fragment)`

Dynamically alters the compiled schema when a condition is true.

```js
const s = new GentleSchema({
  mode: { type: 'string', required: true },
  data: { type: 'object', properties: { base: 'string' } }
});

s.when('mode').is('advanced').do({
  data: {
    properties: {
      extra: { type: 'number', required: true }
    }
  }
});

s.validate({ mode:"advanced", data:{ base:"x" } });
// -> missing extra
```

# Options Cloning

### `withOptions(opts)`

Returns a **new GentleSchema instance** with merged options.

### `updateOptions(opts)`

Mutates instance options.

# Ref Management

Refs allow schemas to share reusable fragments.

### `addRef(name, def)`

Adds a new ref (non-overriding).

### `addRefs([...])`

Adds many.

### `overrideRef(name, def)`

Replaces an existing ref definition.

### `removeRef(name)`

Deletes a ref.

### `resolveRef(name)`

Debug helper: returns the normalized ref definition.

**Usage example**:

```js
const sharedAddress = {
  street: "string",
  zip: { type: "string", min: 5 }
};

const user = new GentleSchema(
  {
    name: "string",
    address: { $ref: "address" }
  },
  {
    refs: { address: sharedAddress }
  }
);

user.validate({ name:"A", address:{ street:"Main", zip:"12345" } });
```

# Built-in Error Classes

* `GentleSchemaError` — thrown at schema construction time (bad schema, invalid refs).
* `ValidationError` — thrown by `enforce()` or any property with `throw: true`.

# Additional Examples

## 1. Coercion Example

```js
const s = new GentleSchema({
  count: { type: 'number', coerce: true }
}, { coerceTypes: true });

s.validate({ count: "42" }).value;   // -> { count: 42 }
```

## 2. Array + Nested Properties

```js
const s = new GentleSchema({
  tags: {
    type: 'array',
    items: { type:'string', min:1 }
  }
});

s.validate({ tags:["a","b",""] });
```

## 3. Throwing validations

```js
const s = new GentleSchema({
  id: { type: 'string', required: true, throw: true }
});

try {
  s.enforce({});
} catch (err) {
  console.log(err instanceof ValidationError); // true
}
```

## 4. Removing unknown fields

```js
const s = new GentleSchema(
  { x: "number" },
  { removeUnknown: true }
);

s.validate({ x:1, junk:99 }).value;
// -> { x:1 }
```

## 5. Batch processing

```js
const s = new GentleSchema({ n:"number" });

const out = s.batch([{n:1},{n:"x"},{n:3}], "validate");

console.log(out.results);
console.log(out.aggregated.successCount);
```

## Links

* [My GitHub (@100Nothing)](https://github.com/100Nothing)
* [GitHub Repo](https://github.com/100Nothing/gentleschema)

  * [Issues](https://github.com/100Nothing/gentleschema/issues)
* [NPM Package](https://www.npmjs.com/package/gentleschema)