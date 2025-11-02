// src/GentleSchema.d.ts
// TypeScript declarations for the GentleSchema validator (public surface).
// This file documents every public detail (constructor, methods, options, types, errors).

/**
 * Primitive type names supported when a field's `type` is a string.
 * - 'any' permits any value and skips type checking.
 * - Additional common aliases supported by the runtime: 'date', 'regexp'|'regex', 'map', 'set', 'url', 'buffer'
*/
declare type PrimitiveType =
    | 'string'
    | 'number'
    | 'object'
    | 'array'
    | 'boolean'
    | 'bigint'
    | 'function'
    | 'symbol'
    | 'null'
    | 'undefined'
    | 'any'
    | 'date'
    | 'regexp'
    | 'regex'
    | 'map'
    | 'set'
    | 'url'
    | 'buffer';

/** One entry of a validation error. */
declare type ValidationErrorEntry = {
    /** Dot/bracket path to the field (e.g. "user.email", "items[2].qty"). */
    path: string;
    /** Human-readable message. */
    message: string;
    /** Optional machine-readable code (string). */
    code?: string;
    /** Optional original Error instance or other raw error data for deeper handling. */
    rawError?: any;
};

/** Result returned by `validate`, `assertTypes`, and internal aggregated results. */
declare type ValidationResult = {
    /** True when no errors were produced. */
    valid: boolean;
    /** Array (possibly empty) of ValidationErrorEntry. */
    errors: ValidationErrorEntry[];
    /** Normalized/coerced value (object or array) produced by the validator. */
    value: any;
};

/**
 * Canonical shape of a single field in a schema map.
 * This is the shape supported by `GentleSchema` after normalization.
 *
 * Notes:
 * - `type` accepts either a PrimitiveType string, or a constructor (Date, Map, a custom class), or a validator function (see `validator`).
 * - `validator` can be used standalone (without `type`) to perform custom checks.
 * - `items` accepts the same forms as a GentleSchemaField (string shorthand, constructor, nested object).
 * - `properties` is a nested GentleSchemaMap used for object shapes.
*/
declare type GentleSchemaField = {
    /**
     * Type annotation or constructor. Examples:
     * - 'string', 'number', 'any'
     * - Date (constructor)
     * - Custom classes (constructor function)
    */
    type?: PrimitiveType | (new (...args: any[]) => any) | Function;

    /** Whether the field is required. Default: false.*/
    required?: boolean;

    /** If true this field accepts `null` values. Default: false. */
    nullable?: boolean;

    /**
     * Default value or default factory `() => value` to be used when the incoming value is `undefined`.
     * If a function is provided it will be invoked with no arguments to obtain the default.
    */
    default?: any | (() => any);

    /**
     * Custom validator function.
     * 
     * Returns one of:
     *
     * - return `true` to accept the value
     * - return `false` to indicate failure (generic message)
     * - return `string` or `string[]` to provide a custom error message(s)
     * - return `{ valid: boolean, errors?: string[] }` to return structured result
    */
    validator?: (
        /** Value to validate. */
        value: any,
        /** Contextual information about the field being validated. */
        ctx?: { path: string }
    ) =>
        | true
        | false
        | string
        | string[]
        | { valid: boolean; errors?: string[] };

    /**
     * Request best-effort coercion for this field (string->number, parse JSON for objects/arrays, parse Date, etc.)
     * Coercion happens only if either this property is `true` or the instance option `coerceTypes` is enabled.
     * Default: false.
    */
    coerce?: boolean;

    /**
     * If true, after coercion the value must match the declared type exactly; otherwise coercion failures become errors.
     * Default: false.
    */
    strictType?: boolean;

    /**
     * Allowed values for this field. Each element can be:
     * - a literal value (=== comparison), or
     * - a predicate function `(v) => boolean` (predicate functions are ignored when `strictEnum` option is true).
    */
    enum?: Array<any | ((v: any) => boolean)>;

    /**
     * For arrays: `items` describes the schema for every item.
     * For objects used as "map" shapes you may also use `items` to apply a schema to each property value.
     *
     * Accepts same forms as GentleSchemaField (string shorthand, constructor, or nested object).
    */
    items?: GentleSchemaField | PrimitiveType | Function;

    /**
     * Regular expression to validate strings. Accepts a RegExp instance or a string (string will be converted
     * to RegExp during schema normalization unless it exceeds the `maxRegexLength` option).
    */
    regex?: RegExp | string;

    /**
     * Minimum numeric value or minimum length (for strings/arrays).
     * Use min/max pair to represent length constraints (integers).
    */
    min?: number;

    /** Maximum numeric value or maximum length (for strings/arrays).*/
    max?: number;

    /** If true, a failure of this field will throw a ValidationError immediately when encountered. Default: false.*/
    throw?: boolean;

    /**
     * Custom user-facing error message for this field. When set, it will be used as the human readable portion
     * in error messages, e.g. "Invalid email field. + `errorMessage`".
    */
    errorMessage?: string;

    /** Nested object properties following the same GentleSchemaMap shape.*/
    properties?: GentleSchemaMap;

    /** Allow additional metadata to be present.*/
    [k: string]: any;
};

/** Top-level schema map: property name -> GentleSchemaField or shorthand.*/
declare type GentleSchemaMap = {
    /** Nested object properties following the same GentleSchemaMap shape.*/
    [key: string]: GentleSchemaField | PrimitiveType | Function | Array<any>;
};

/**
 * Options accepted by the GentleSchema constructor and per-call overrides.
 * These options control validation behavior and normalization details.
*/
declare type GentleSchemaOptions = {
    /** If true, stop on first error (fail-fast). Default: false.*/
    failFast?: boolean;

    /**
     * If true, unknown keys found on the input will be removed from the normalized result and will not produce errors.
     * Note: `removeUnknown` overrides `strict` (when both are set).
    */
    removeUnknown?: boolean;

    /**
     * If true, unknown keys are reported as errors (unless removeUnknown is true). Default: false.
    */
    strict?: boolean;

    /**
     * If true, methods that support it will return the normalized `value` directly instead of a ValidationResult object.
     * Example: `validate(obj)` returns `value` when `valueOnly` is true.
    */
    valueOnly?: boolean;

    /**
     * If true, attempt type coercion globally when a field does not request it explicitly.
     * Per-field `coerce` still takes precedence. Default: false.
    */
    coerceTypes?: boolean;

    /**
     * If true, removes empty strings, empty arrays, empty objects and `null` (if not allowed) from the resulting value.
     * Default: false.
    */
    removeEmpty?: boolean;

    /**
     * If true, all fields are considered nullable unless a field explicitly sets `nullable:false`.
     * Default: false.
    */
    nullable?: boolean;

    /**
     * If true, enum predicate functions are ignored and only literal matches are permitted.
     * Default: false.
    */
    strictEnum?: boolean;

    /**
     * Maximum allowed length for regex strings supplied in the schema. If a string regex exceeds this length,
     * the schema normalization will throw a GentleSchemaError. Default: 1000.
    */
    maxRegexLength?: number;

    /**
     * Optional path prefix that will be prepended to all error paths.
     * Useful when validating nested objects within a parent.
    */
    pathPrefix?: string;

    /**
     * External references (see "refs" methods). Accepts:
     * - object map: { name: definition, ... }
     * - array of maps: [ { name: def }, { other: def }, ... ]
     *
     * Each referenced definition may be a full GentleSchemaField or nested GentleSchemaMap (normalization will run).
    */
    refs?: { [name: string]: GentleSchemaField | GentleSchemaMap } | Array<{ [name: string]: GentleSchemaField | GentleSchemaMap }>;

    /**
     * Controls internal cache size for conditionals (implementation detail).
     * Pass `Infinity` to disable caching or a finite number to limit memory usage. Default: Infinity.
    */
    conditionalsCacheSize?: number;

    /** Any additional custom option is allowed and will be forwarded.*/
    [k: string]: any;
};

/**
 * ValidationError thrown by `enforce` and by any field-level `throw: true`.
 * - `errors`: array of ValidationErrorEntry (same format as ValidationResult.errors)
 * - `partialValue`: the partially normalized value collected so far (may be undefined)
*/
declare class ValidationError extends Error {
    /** Error entries describing validation failures.*/
    errors: ValidationErrorEntry[];

    /** Partially accumulated normalized value (if available).*/
    partialValue?: any;

    constructor(errors?: ValidationErrorEntry[], partialValue?: any);
}

/** GentleSchemaError thrown when the schema definition itself is invalid (instantiation-time linting). */
declare class GentleSchemaError extends Error {
    /** Error entries. */
    errors: Array<{ path?: string; message: string; code?: string }>;
    constructor(errors?: Array<{ path?: string; message: string; code?: string }>);
}

/** Micro-benchmark result returned by `benchmark`. */
declare type BenchmarkResult = {
    /** number of iterations executed*/
    iterations: number;
    /** total time in milliseconds for all iterations*/
    totalMs: number;
    /** average time in milliseconds per iteration*/
    avgMs: number;
    /** the last method result of the executed action*/
    lastResult: any;
};

/** Profile result returned by `profile`. */
declare type ProfileResult = {
    /** Number of items measured. */
    items: number;
    /** Total elapsed ms across all measured items. */
    totalMs: number;
    /** Average ms per item. */
    avgMs: number;
    /** Per-item timing entries { index, ns, ok }. */
    results: Array<{ index: number; ns: number; ok: boolean }>;
};

/**
 * The GentleSchema class - API for schema-driven validation and normalization.
 *
 * @example
 * const s = new GentleSchema({ id: { type: 'string', required: true } }, { failFast: false });
 * const res = s.validate({ id: 'u1' });
 * if (!res.valid) console.error(res.errors);
 * else console.log(res);
*/
declare class GentleSchema {
    /**
     * Instantiate a GentleSchema instance.
     * @throws GentleSchemaError when the provided schema definition is invalid (instantiation-time linting).
    */
    constructor(
        /** GentleSchemaMap describing the expected shape. The schema supports:
         *   - shorthand strings: `{ name: 'string' }`
         *   - constructors: `{ at: Date }` (or `{ at: Date }` in the `type` slot)
         *   - nested maps: `{ user: { type: 'object', properties: { name: 'string' } } }`
         *   - $defs: local definitions via `schemaDef.$defs = { name: { ... } }` (available for `$ref` resolution)
         *   - `$ref` placeholders in entries: `{ address: { $ref: 'addr' } }` */
        schemaDef: GentleSchemaMap,
        /** Options for the GentleSchema instance. */
        options?: GentleSchemaOptions
    );

    /**
     * Add a single external reference definition.
     * - `name` must be a non-empty string.
     * - Throws GentleSchemaError if a ref with the same `name` already exists.
     *
     * @example
     *   schema.addRef('Address', { type: 'object', properties: { city: 'string' } });
    */
    addRef(
        /** Name of the ref to add. */
        name: string,
        /** Definition for the ref. */
        def: GentleSchemaField | GentleSchemaMap
    ): void;

    /**
     * Add multiple refs at once. Accepts an object map `{ name: def }` or an array of such maps.
     * Throws GentleSchemaError if any incoming ref would duplicate an existing ref.
    */
    addRefs(
        /** Object map `{ name: def }` or array of such maps. */
        refs: { [name: string]: GentleSchemaField | GentleSchemaMap } | Array<{ [name: string]: GentleSchemaField | GentleSchemaMap }>
    ): void;

    /**
     * Override an existing ref (or add it if missing). Unlike addRef, this will replace without error.
    */
    overrideRef(
        /** Name of the ref to override. */
        name: string,
        /** New definition for the ref. */
        def: GentleSchemaField | GentleSchemaMap
    ): void;

    /**
     * Remove a previously registered ref by name. Returns true if a ref was removed, false otherwise.
    */
    removeRef(
        /** Name of the ref to remove. */
        name: string
    ): boolean;

    /**
     * Resolve a ref by name for debugging/inspection. Returns the normalized GentleSchemaField (as stored in the runtime)
     * or `undefined` if not found. This does not throw.
    */
    resolveRef(
        /** Name of the ref to resolve. */
        name: string
    ): GentleSchemaField | undefined;

    /**
     * Attach a conditional schema fragment:
     *   `schema.when(pathOrPredicate).is(valueOrPredicate).do(fragment)`
     *
     * The method returns a chainable helper; final `.do()` returns the GentleSchema instance.
    */
    when(
        /**
         * When it is:
         *    - a string path (e.g. 'type' or 'user.role') – the runtime reads the value at that path;
         *    - a predicate function `(root) => boolean` that receives the whole object.
         */
        pathOrPredicate: string | ((root: any) => boolean)
    ): {
        /** Accepts either a value to compare with `===` or a predicate `(v) => boolean`. */
        is: (
            /** Value or predicate to expect from path. */
            valOrFn: any | ((v: any) => boolean)
        ) => {
            /** Accept a schema fragment (object) that will be merged into the normalized schema if the condition is true for a given validation run. */
            do: (
                /** GentleSchema fragment to merge into the normalized schema if the condition is true for a given validation run. */
                fragment: GentleSchemaMap
            ) => GentleSchema
        };
    };

    /**
     * Create a new GentleSchema instance cloned from this one with merged options.
     * The returned GentleSchema is a fresh instance and does not mutate the original.
    */
    withOptions(
        /** Options to merge into the new instance. */
        opts?: GentleSchemaOptions
    ): GentleSchema;

    /**
     * Mutate this GentleSchema's options in place and return `this`.
     * Useful to change behavior without creating a new instance.
    */
    updateOptions(
        /** Options to merge into the current instance. */
        opts?: GentleSchemaOptions
    ): GentleSchema;

    /**
     * Validate an object fully according to the schema.
     * - Returns a `ValidationResult` object by default.
     * - If `options.valueOnly` is true (either passed here or set when the GentleSchema was constructed),
     *   `validate` returns the normalized `value` directly.
     *
     * @returns ValidationResult | any  (returns `value` directly when `valueOnly` is true)
     * @throws ValidationError when `failFast` + `valueOnly` combination triggers early abort while `valueOnly` was requested.
    */
    validate(
        /** Object to validate. */
        obj: any,
        /** Optional per-call overrides. */
        options?: GentleSchemaOptions
    ): ValidationResult | any;

    /**
     * Enforce validation and throw `ValidationError` on invalid values.
     * - On success returns the normalized value (or if `valueOnly` true, the same).
     * - On failure throws a ValidationError containing `errors` and `partialValue`.
    */
    enforce(
        /** Object to validate. */
        obj: any,
        /** Optional per-call overrides. */
        options?: GentleSchemaOptions
    ): any;

    /**
     * Sanitize: always returns `{ value, errors }` and never throws.
     * - If `valueOnly` is set, returns `value` directly.
    */
    sanitize(
        /** Object to sanitize. */
        obj: any,
        /** Optional per-call overrides. */
        options?: GentleSchemaOptions
    ): { value: any; errors: ValidationErrorEntry[] } | any;

    /**
     * Check: fast boolean validity test.
     * - Executes a fail-fast run under the hood for speed.
     * - Returns true when valid, false otherwise.
    */
    check(
        /** Object to validate. */
        obj: any,
        /** Optional per-call overrides. */
        options?: GentleSchemaOptions
    ): boolean;

    /**
     * assertTypes: perform only type/coercion checks (and basic structural checks).
     * - Returns a ValidationResult containing coerced/normalized values where possible.
     * - Useful when you want to ensure shapes and types without running full custom validators.
    */
    assertTypes(
        /** Object to validate. */
        obj: any,
        /** Optional per-call overrides. */
        options?: GentleSchemaOptions
    ): ValidationResult;

    /**
     * Batch processing over an array of items.
     *
     * **Return shape notes**:
     * - `results` is an array with per-item outputs depending on the action.
     * - `aggregated` is a ValidationResult summarizing the whole batch (aggregates all errors and values).
    */
    batch(
        /** Array of inputs. */
        items: any[],
        /** Action to run over each item. */
        action?: 'validate' | 'enforce' | 'sanitize' | 'check' | 'assertTypes',
        /** Optional per-call overrides. */
        options?: GentleSchemaOptions
    ): { results: any[]; aggregated: ValidationResult };

    /**
     * Run a micro-benchmark on a single representative object.
     * @returns BenchmarkResult with `iterations`, `totalMs`, `avgMs`, and `lastResult`.
    */
    benchmark(
        /** A representative input to run. */
        obj: any,
        /** Optional per-call overrides. */
        opts?: {
            /** Number of iterations to run. */
            iterations?: number;
            /** Action to run over each item. */
            action?: 'validate' | 'check' | 'assertTypes'
        }
    ): BenchmarkResult;

    /**
     * Profile a set of items to get per-item timings and basic summary.
     * @returns ProfileResult with per-item timings and averages.
     *
     * **Notes**:
     * - This method runs each item once (after optionally performing warmup runs).
     * - It's a developer tool for detecting slow/expensive inputs across a dataset.
    */
    profile(
        /** An array of inputs to run (the method will run `opts.action` over each item). */
        items: any[],
        /** Optional per-call overrides. */
        opts?: {
            /** Action to run over each item. */
            action?: 'validate' | 'check' | 'assertTypes';
            /** Number of warmup runs to perform. */
            warmup?: number
        }
    ): ProfileResult;

    /**
     * Return internal instrumentation stats object.
     * The structure is implementation specific but contains counts and totalNs per field key.
    */
    getStats(): any;

    /** Reset collected stats.*/
    resetStats(): void;

    /** Attached static ValidationError class (same as exported ValidationError type).*/
    static ValidationError: typeof ValidationError;

    /** Attached static GentleSchemaError class (schema-lint errors).*/
    static GentleSchemaError: typeof GentleSchemaError;
}


// exports
export = GentleSchema;
export as namespace GentleSchema;