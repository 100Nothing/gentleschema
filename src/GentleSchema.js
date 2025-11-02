'use strict';

const DEFAULT_OPTIONS = {
    failFast: false,
    removeUnknown: false,
    strict: false,
    valueOnly: false,
    coerceTypes: false,
    removeEmpty: false,
    nullable: false,
    strictEnum: false,
    maxRegexLength: 1000,
    conditionalsCacheSize: Infinity
};

function _isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
}
function _getType(v) {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    return typeof v;
}
function _arrayPath(prefix, index) {
    return prefix ? `${prefix}[${index}]` : `[${index}]`;
}
function _getByPath(obj, path) {
    if (!path) return obj;
    const parts = [];
    let cur = '';
    for (let i = 0; i < path.length; i++) {
        const ch = path[i];
        if (ch === '.') {
            if (cur.length) { parts.push(cur); cur = ''; }
        } else if (ch === '[') {
            if (cur.length) { parts.push(cur); cur = ''; }
            let j = i + 1, idx = '';
            while (j < path.length && path[j] !== ']') { idx += path[j]; j++; }
            if (idx.length) parts.push(Number(idx));
            i = j;
        } else cur += ch;
    }
    if (cur.length) parts.push(cur);
    let out = obj;
    for (let i = 0; i < parts.length; i++) {
        if (out == null) return undefined;
        out = out[parts[i]];
    }
    return out;
}
function _shallowCloneSchema(val) {
    if (val === null || typeof val !== 'object') return val;
    if (Array.isArray(val)) {
        const out = new Array(val.length);
        for (let i = 0; i < val.length; i++) out[i] = _shallowCloneSchema(val[i]);
        return out;
    }
    const out = {};
    const ks = Object.keys(val);
    for (let i = 0; i < ks.length; i++) {
        const k = ks[i];
        out[k] = _shallowCloneSchema(val[k]);
    }
    return out;
}
function _makeErrorObj(fieldName, reason, code, rawErr) {
    return {
        path: fieldName || '',
        message: `Invalid ${fieldName} field. ${reason}`,
        code: code || 'ERR_VALIDATION',
        rawError: rawErr || null
    };
}

function _enumMatch(enumArr, v, strictEnum) {
    if (!Array.isArray(enumArr)) return true;
    if (enumArr.length === 0) return true;
    for (let i = 0; i < enumArr.length; i++) {
        const e = enumArr[i];
        if (typeof e === 'function') {
            if (strictEnum) continue;
            try { if (e(v)) return true; } catch (_) { /* ignore */ }
        } else {
            if (e === v) return true;
        }
    }
    return false;
}

function _coerceToType(val, type) {
    try {
        const tname = typeof type === 'string' ? type : (typeof type === 'function' ? (type.name || '') : '');
        if (tname === 'number' || type === Number) {
            if (typeof val === 'number') return { coercedValue: val, coerced: true };
            if (val === '' || val == null) return { coercedValue: val, coerced: false, error: new Error('cannot coerce empty/null to number') };
            const n = Number(val);
            if (!Number.isNaN(n)) return { coercedValue: n, coerced: true };
            return { coercedValue: val, coerced: false, error: new Error('invalid number') };
        }
        if (tname === 'string' || type === String) {
            if (typeof val === 'string') return { coercedValue: val, coerced: true };
            return { coercedValue: String(val), coerced: true };
        }
        if (tname === 'boolean' || type === Boolean) {
            if (typeof val === 'boolean') return { coercedValue: val, coerced: true };
            if (val === 'true' || val === '1' || val === 1) return { coercedValue: true, coerced: true };
            if (val === 'false' || val === '0' || val === 0) return { coercedValue: false, coerced: true };
            return { coercedValue: val, coerced: false, error: new Error('invalid boolean') };
        }
        if (tname === 'array' || type === Array) {
            if (Array.isArray(val)) return { coercedValue: val, coerced: true };
            if (typeof val === 'string') {
                try {
                    const p = JSON.parse(val);
                    if (Array.isArray(p)) return { coercedValue: p, coerced: true };
                } catch (e) { return { coercedValue: val, coerced: false, error: e }; }
            }
            return { coercedValue: val, coerced: false, error: new Error('cannot coerce to array') };
        }
        if (tname === 'object' || type === Object) {
            if (_isPlainObject(val)) return { coercedValue: val, coerced: true };
            if (typeof val === 'string') {
                try {
                    const p = JSON.parse(val);
                    if (_isPlainObject(p)) return { coercedValue: p, coerced: true };
                } catch (e) { return { coercedValue: val, coerced: false, error: e }; }
            }
            return { coercedValue: val, coerced: false, error: new Error('cannot coerce to object') };
        }
        if (typeof type === 'function') {
            if (type === Date) {
                if (val instanceof Date) return { coercedValue: val, coerced: true };
                if (typeof val === 'string' || typeof val === 'number') {
                    const d = new Date(val);
                    if (!isNaN(d.getTime())) return { coercedValue: d, coerced: true };
                    return { coercedValue: val, coerced: false, error: new Error('invalid Date') };
                }
                return { coercedValue: val, coerced: false, error: new Error('cannot coerce to Date') };
            }
            if (type === RegExp) {
                if (val instanceof RegExp) return { coercedValue: val, coerced: true };
                if (typeof val === 'string') {
                    try { return { coercedValue: new RegExp(val), coerced: true }; } catch (e) { return { coercedValue: val, coerced: false, error: e }; }
                }
                return { coercedValue: val, coerced: false, error: new Error('cannot coerce to RegExp') };
            }
            if (type === Map) {
                if (val instanceof Map) return { coercedValue: val, coerced: true };
                if (_isPlainObject(val)) return { coercedValue: new Map(Object.entries(val)), coerced: true };
                if (Array.isArray(val)) return { coercedValue: new Map(val), coerced: true };
                return { coercedValue: val, coerced: false, error: new Error('cannot coerce to Map') };
            }
            if (type === Set) {
                if (val instanceof Set) return { coercedValue: val, coerced: true };
                if (Array.isArray(val)) return { coercedValue: new Set(val), coerced: true };
                if (_isPlainObject(val)) return { coercedValue: new Set(Object.values(val)), coerced: true };
                return { coercedValue: val, coerced: false, error: new Error('cannot coerce to Set') };
            }
            if (typeof URL !== 'undefined' && type === URL) {
                if (val instanceof URL) return { coercedValue: val, coerced: true };
                if (typeof val === 'string') {
                    try { return { coercedValue: new URL(val), coerced: true }; } catch (e) { return { coercedValue: val, coerced: false, error: e }; }
                }
                return { coercedValue: val, coerced: false, error: new Error('cannot coerce to URL') };
            }
            if (type === BigInt) {
                if (typeof val === 'bigint') return { coercedValue: val, coerced: true };
                if (typeof val === 'number' || typeof val === 'string') {
                    try { return { coercedValue: BigInt(val), coerced: true }; } catch (e) { return { coercedValue: val, coerced: false, error: e }; }
                }
                return { coercedValue: val, coerced: false, error: new Error('cannot coerce to BigInt') };
            }
            if (typeof Buffer !== 'undefined' && type === Buffer) {
                if (Buffer.isBuffer(val)) return { coercedValue: val, coerced: true };
                if (typeof val === 'string') return { coercedValue: Buffer.from(val), coerced: true };
                if (Array.isArray(val)) return { coercedValue: Buffer.from(val), coerced: true };
                return { coercedValue: val, coerced: false, error: new Error('cannot coerce to Buffer') };
            }
            if (val instanceof type) return { coercedValue: val, coerced: true };
            return { coercedValue: val, coerced: false, error: new Error('no safe coercion for constructor') };
        }
        return { coercedValue: val, coerced: false, error: new Error('no coercion rule') };
    } catch (e) {
        return { coercedValue: val, coerced: false, error: e };
    }
}
function _matchesType(expectedType, value) {
    if (expectedType === 'any') return true;
    if (typeof expectedType === 'string') {
        if (expectedType === 'date') return value instanceof Date;
        if (expectedType === 'regexp' || expectedType === 'regex') return value instanceof RegExp;
        if (expectedType === 'map') return value instanceof Map;
        if (expectedType === 'set') return value instanceof Set;
        if (expectedType === 'url') return (typeof URL !== 'undefined') ? value instanceof URL : false;
        if (expectedType === 'bigint') return typeof value === 'bigint';
        if (expectedType === 'buffer') return (typeof Buffer !== 'undefined') ? Buffer.isBuffer(value) : false;
        return _getType(value) === expectedType;
    }
    if (typeof expectedType === 'function') {
        try {
            if (expectedType === Date) return value instanceof Date;
            if (expectedType === RegExp) return value instanceof RegExp;
            if (expectedType === Map) return value instanceof Map;
            if (expectedType === Set) return value instanceof Set;
            if (typeof URL !== 'undefined' && expectedType === URL) return value instanceof URL;
            if (expectedType === BigInt) return typeof value === 'bigint';
            if (typeof Buffer !== 'undefined' && expectedType === Buffer) return Buffer.isBuffer(value);
            return value instanceof expectedType;
        } catch (e) { return false; }
    }
    return false;
}
function _expectedLabelForType(type) {
    if (typeof type === 'function') return `a valid instance of the ${type.name || 'Constructor'} class`;
    return `type ${type}`;
}

class SchemaError extends Error {
    constructor(errors) {
        super('Schema error');
        this.name = 'SchemaError';
        this.errors = errors || [];
        if (Error.captureStackTrace) Error.captureStackTrace(this, SchemaError);
    }
}
class ValidationError extends Error {
    constructor(errors = [], partialValue = undefined) {
        super('Validation failed');
        this.name = 'ValidationError';
        this.errors = errors;
        this.partialValue = partialValue;
        if (Error.captureStackTrace) Error.captureStackTrace(this, ValidationError);
    }
}

function normalizeEntry(raw, opts, keyName, pathForRegex) {
    if (typeof raw === 'string') return { type: raw };
    if (typeof raw === 'function') return { validator: raw };
    if (Array.isArray(raw)) {
        const a = raw[0], b = raw[1];
        const base = normalizeEntry(a, opts, keyName, pathForRegex);
        if (_isPlainObject(b)) {
            const out = Object.assign({}, base);
            const ks = Object.keys(b);
            for (let i = 0; i < ks.length; i++) out[ks[i]] = b[ks[i]];
            return out;
        }
        return base;
    }
    if (_isPlainObject(raw)) {
        if (typeof raw.$ref === 'string') return { __isRef: true, $ref: raw.$ref };
        const out = {};
        if ('type' in raw) out.type = raw.type;
        if ('required' in raw) out.required = !!raw.required;
        if ('nullable' in raw) out.nullable = !!raw.nullable;
        if ('default' in raw) out.default = raw.default;
        if ('validator' in raw) out.validator = raw.validator;
        if ('coerce' in raw) out.coerce = !!raw.coerce;
        out.strictType = !!(raw.forceType || raw.strictType);
        if ('enum' in raw) out.enum = raw.enum;
        if ('items' in raw) out.items = normalizeEntry(raw.items, opts, keyName, pathForRegex ? `${pathForRegex}.items` : `${keyName}.items`);
        if ('properties' in raw) {
            const props = {};
            const pks = Object.keys(raw.properties || {});
            for (let i = 0; i < pks.length; i++) props[pks[i]] = normalizeEntry(raw.properties[pks[i]], opts, pks[i], pathForRegex ? `${pathForRegex}.properties.${pks[i]}` : `${keyName}.properties.${pks[i]}`);
            out.properties = props;
        }
        if ('regex' in raw) {
            if (raw.regex instanceof RegExp) out.regex = raw.regex;
            else if (typeof raw.regex === 'string' && raw.regex.length) {
                if (opts && typeof opts.maxRegexLength === 'number' && raw.regex.length > opts.maxRegexLength) {
                    throw new SchemaError([{
                        path: pathForRegex || keyName,
                        message: `Regex string too long (${raw.regex.length} > ${opts.maxRegexLength}). Pass a RegExp instance instead.`,
                        code: 'ERR_REGEX_TOO_LONG'
                    }]);
                }
                out.regex = new RegExp(raw.regex);
            }
        }
        if ('min' in raw) out.min = raw.min;
        if ('max' in raw) out.max = raw.max;
        if ('throw' in raw) out.throw = !!raw.throw;
        if ('errorMessage' in raw) out.errorMessage = raw.errorMessage;
        const skip = { type: 1, required: 1, nullable: 1, default: 1, validator: 1, coerce: 1, forceType: 1, strictType: 1, enum: 1, items: 1, properties: 1, regex: 1, min: 1, max: 1, throw: 1, errorMessage: 1, $ref: 1 };
        const keys = Object.keys(raw);
        for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            if (!skip[k]) out[k] = raw[k];
        }
        return out;
    }
    return { validator: raw };
}

function normalizeSchema(schemaDef, opts = {}) {
    const out = {};
    const localDefs = {};
    const inlineMap = new Map();

    if (_isPlainObject(schemaDef) && _isPlainObject(schemaDef.$defs)) {
        const defKeys = Object.keys(schemaDef.$defs);
        for (let i = 0; i < defKeys.length; i++) {
            const k = defKeys[i];
            localDefs[k] = schemaDef.$defs[k];
        }
    }

    function resolveEntry(raw, keyName, pathForRegex) {
        if (_isPlainObject(raw) && typeof raw.$ref === 'string') {
            return { __isRef: true, $ref: raw.$ref };
        }
        if (_isPlainObject(raw) && inlineMap.has(raw)) return inlineMap.get(raw);
        const normalized = normalizeEntry(raw, opts, keyName, pathForRegex);
        if (_isPlainObject(raw)) inlineMap.set(raw, normalized);
        return normalized;
    }

    const keys = Object.keys(schemaDef || {});
    for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (k === '$defs') continue;
        out[k] = resolveEntry(schemaDef[k], k, k);
        if (!('required' in out[k])) out[k].required = false;
        if (!('nullable' in out[k])) out[k].nullable = undefined;
        if (!('coerce' in out[k])) out[k].coerce = undefined;
        if (!('strictType' in out[k])) out[k].strictType = undefined;
        if (!('throw' in out[k])) out[k].throw = undefined;
    }
    return { schema: out, inlineMap, localDefs };
}

function makeChecker(fieldName, entry, globalOptions) {
    const type = entry.type;
    const required = !!entry.required;
    const nullable = !!entry.nullable;
    const def = entry.default;
    const enumVals = entry.enum;
    const regex = entry.regex;
    const min = entry.min;
    const max = entry.max;
    const items = entry.items;
    const properties = entry.properties;
    const validator = entry.validator;
    const coerceField = !!entry.coerce;
    const strictType = !!entry.strictType;
    const throwField = !!entry.throw;
    const errorMessage = typeof entry.errorMessage === 'string' ? entry.errorMessage : null;

    let itemsChecker = null;
    if (items) itemsChecker = makeChecker(`${fieldName}[]`, items, globalOptions);

    let propertiesCheck = null;
    if (properties) {
        const pkeys = Object.keys(properties);
        const props = {};
        for (let i = 0; i < pkeys.length; i++) {
            const pk = pkeys[i];
            props[pk] = makeChecker(pk, properties[pk], globalOptions);
        }
        propertiesCheck = { keys: pkeys, props };
    }

    function makeErr(path, reason, code, raw) {
        const reasonMessage = errorMessage ? errorMessage : reason;
        return { path, message: `Invalid ${path} field. ${reasonMessage}`, code: code || 'ERR_VALIDATION', rawError: raw || null };
    }

    return function checker(value, ctx) {
        const path = ctx.path;
        const options = ctx.options;
        const errs = [];
        let out = value;
        const hasValue = !(typeof value === 'undefined');

        if (!hasValue) {
            if (typeof def !== 'undefined') out = (typeof def === 'function') ? def() : def;
            else if (required) {
                const e = makeErr(path, 'is required', 'ERR_REQUIRED', null);
                if (throwField) throw new ValidationError([e], undefined);
                errs.push(e);
                return [errs, out];
            } else return [errs, out];
        }

        if (out === null) {
            if (nullable || options.nullable || (type === 'null')) return [errs, out];
            const e = makeErr(path, 'must not be null', 'ERR_NULL', null);
            if (throwField) throw new ValidationError([e], undefined);
            errs.push(e);
            return [errs, out];
        }

        if (typeof validator === 'function' && typeof type === 'undefined') {
            try {
                const r = validator(out, { path });
                if (r === true) return [errs, out];
                if (r === false) {
                    const e = makeErr(path, 'custom validator failed', 'ERR_CUSTOM', null);
                    if (throwField) throw new ValidationError([e], out);
                    errs.push(e);
                    return [errs, out];
                }
                if (typeof r === 'string') {
                    const e = makeErr(path, r, 'ERR_CUSTOM', null);
                    if (throwField) throw new ValidationError([e], out);
                    errs.push(e);
                    return [errs, out];
                }
                if (Array.isArray(r) && r.length) {
                    for (let i = 0; i < r.length; i++) errs.push(makeErr(path, String(r[i]), 'ERR_CUSTOM', null));
                    if (throwField) throw new ValidationError(errs, out);
                    return [errs, out];
                }
                if (_isPlainObject(r)) {
                    if (r.valid === true) return [errs, out];
                    if (Array.isArray(r.errors)) {
                        for (let i = 0; i < r.errors.length; i++) errs.push(makeErr(path, String(r.errors[i]), 'ERR_CUSTOM', null));
                        if (throwField) throw new ValidationError(errs, out);
                        return [errs, out];
                    }
                }
                return [errs, out];
            } catch (err) {
                const e = makeErr(path, String(err), 'ERR_CUSTOM', err);
                if (throwField) throw new ValidationError([e], out);
                errs.push(e);
                return [errs, out];
            }
        }

        const shouldCoerce = !!(coerceField || options.coerceTypes);
        if (shouldCoerce && typeof type !== 'undefined') {
            const c = _coerceToType(out, type);
            if (c.coerced) out = c.coercedValue;
            else {
                if (typeof type === 'string' && ['number', 'string', 'boolean', 'array', 'object'].indexOf(type) !== -1) {
                    const e = makeErr(path, `coercion failed (${c.error ? c.error.message : 'unknown'})`, 'ERR_COERCE', c.error || null);
                    if (throwField) throw new ValidationError([e], out);
                    errs.push(e);
                    return [errs, out];
                }
            }
        }

        if (typeof type !== 'undefined') {
            if (type !== 'any') {
                if (!_matchesType(type, out)) {
                    const expectedLabel = _expectedLabelForType(type);
                    const e = makeErr(path, `expected ${expectedLabel}, received ${_getType(out)}`, 'ERR_TYPE', null);
                    if (strictType || options.strictType) {
                        if (throwField) throw new ValidationError([e], out);
                        errs.push(e);
                        return [errs, out];
                    } else {
                        if (throwField) throw new ValidationError([e], out);
                        errs.push(e);
                        return [errs, out];
                    }
                }
            }
        }

        if (Array.isArray(enumVals) && enumVals.length > 0) {
            if (!_enumMatch(enumVals, out, options.strictEnum)) {
                const friendly = enumVals.map(function (v) { if (typeof v === 'function') return `<fn:${v.name || 'anon'}>`; try { return JSON.stringify(v); } catch (e) { return String(v); } }).join(', ');
                const e = makeErr(path, `must be one of [${friendly}]`, 'ERR_ENUM', null);
                if (throwField) throw new ValidationError([e], out);
                errs.push(e);
                return [errs, out];
            }
        }

        if (regex) {
            if (!(regex instanceof RegExp)) {
                const e = makeErr(path, 'regex must be a RegExp instance', 'ERR_REGEX', null);
                if (throwField) throw new ValidationError([e], out);
                errs.push(e);
                return [errs, out];
            }
            if (typeof out !== 'string' || !regex.test(out)) {
                const e = makeErr(path, `String should follow regex pattern ${regex.toString()}`, 'ERR_REGEX', null);
                if (throwField) throw new ValidationError([e], out);
                errs.push(e);
                return [errs, out];
            }
        }

        if (typeof out === 'number') {
            if (typeof min === 'number' && out < min) {
                const e = makeErr(path, `must be >= ${min}`, 'ERR_MIN', null);
                if (throwField) throw new ValidationError([e], out);
                errs.push(e);
                return [errs, out];
            }
            if (typeof max === 'number' && out > max) {
                const e = makeErr(path, `must be <= ${max}`, 'ERR_MAX', null);
                if (throwField) throw new ValidationError([e], out);
                errs.push(e);
                return [errs, out];
            }
        } else if (typeof out === 'string' || Array.isArray(out)) {
            if (typeof min === 'number' && out.length < min) {
                const e = makeErr(path, `length must be >= ${min}`, 'ERR_MIN', null);
                if (throwField) throw new ValidationError([e], out);
                errs.push(e);
                return [errs, out];
            }
            if (typeof max === 'number' && out.length > max) {
                const e = makeErr(path, `length must be <= ${max}`, 'ERR_MAX', null);
                if (throwField) throw new ValidationError([e], out);
                errs.push(e);
                return [errs, out];
            }
        }

        if (Array.isArray(out) && itemsChecker) {
            const newArr = [];
            let hadErr = false;
            for (let i = 0; i < out.length; i++) {
                const childPath = _arrayPath(path, i);
                const [childErrs, childVal] = itemsChecker(out[i], { path: childPath, options });
                if (childErrs.length) {
                    hadErr = true;
                    for (let j = 0; j < childErrs.length; j++) errs.push(childErrs[j]);
                    if (options.failFast) {
                        if (throwField) throw new ValidationError(errs, undefined);
                        return [errs, out];
                    }
                } else newArr.push(childVal);
            }
            if (!hadErr) out = newArr;
        }

        if (_isPlainObject(out) && propertiesCheck) {
            const nk = propertiesCheck.keys;
            const props = propertiesCheck.props;
            const nestedResult = {};
            for (let i = 0; i < nk.length; i++) {
                const pk = nk[i];
                const ck = props[pk];
                const childPath = path ? `${path}.${pk}` : pk;
                const [childErrs, childVal] = ck(out[pk], { path: childPath, options });
                if (childErrs.length) {
                    for (let j = 0; j < childErrs.length; j++) errs.push(childErrs[j]);
                    if (options.failFast) {
                        if (throwField) throw new ValidationError(errs, undefined);
                        return [errs, out];
                    }
                } else nestedResult[pk] = childVal;
            }
            if (options.strict) {
                const objKs = Object.keys(out);
                for (let i = 0; i < objKs.length; i++) {
                    const k2 = objKs[i];
                    let found = false;
                    for (let j = 0; j < nk.length; j++) if (nk[j] === k2) { found = true; break; }
                    if (!found) {
                        if (options.removeUnknown) continue;
                        const e = makeErr(path ? `${path}.${k2}` : k2, 'unknown field', 'ERR_UNKNOWN', null);
                        errs.push(e);
                        if (options.failFast) {
                            if (throwField) throw new ValidationError(errs, undefined);
                            return [errs, out];
                        }
                    }
                }
            } else {
                const objKs = Object.keys(out);
                for (let i = 0; i < objKs.length; i++) {
                    const k2 = objKs[i];
                    let found = false;
                    for (let j = 0; j < nk.length; j++) if (nk[j] === k2) { found = true; break; }
                    if (!found) {
                        if (options.removeUnknown) continue;
                        nestedResult[k2] = out[k2];
                    }
                }
            }
            out = nestedResult;
        }

        if (typeof validator === 'function') {
            try {
                const r = validator(out, { path });
                if (r === true) {
                } else if (r === false) {
                    const e = makeErr(path, 'custom validator failed', 'ERR_CUSTOM', null);
                    if (throwField) throw new ValidationError([e], out);
                    errs.push(e);
                    return [errs, out];
                } else if (typeof r === 'string') {
                    const e = makeErr(path, r, 'ERR_CUSTOM', null);
                    if (throwField) throw new ValidationError([e], out);
                    errs.push(e);
                    return [errs, out];
                } else if (Array.isArray(r) && r.length) {
                    for (let i = 0; i < r.length; i++) errs.push(makeErr(path, String(r[i]), 'ERR_CUSTOM', null));
                    if (throwField) throw new ValidationError(errs, out);
                    return [errs, out];
                } else if (_isPlainObject(r)) {
                    if (r.valid === true) {
                    } else if (Array.isArray(r.errors)) {
                        for (let i = 0; i < r.errors.length; i++) errs.push(makeErr(path, String(r.errors[i]), 'ERR_CUSTOM', null));
                        if (throwField) throw new ValidationError(errs, out);
                        return [errs, out];
                    }
                }
            } catch (err) {
                const e = makeErr(path, String(err), 'ERR_CUSTOM', err);
                if (throwField) throw new ValidationError([e], out);
                errs.push(e);
                return [errs, out];
            }
        }

        return [errs, out];
    };
}

function mergeNormalizedEntry(base, frag) {
    if (!base) return frag;
    if (!frag) return base;
    const out = Object.assign({}, base, frag);
    if (base.items || frag.items) out.items = mergeNormalizedEntry(base.items || {}, frag.items || {});
    if (base.properties || frag.properties) {
        const bp = base.properties || {};
        const fp = frag.properties || {};
        const mergedProps = {};
        const keys = Object.keys(bp);
        for (let i = 0; i < keys.length; i++) mergedProps[keys[i]] = bp[keys[i]];
        const fk = Object.keys(fp);
        for (let i = 0; i < fk.length; i++) {
            const k = fk[i];
            mergedProps[k] = mergeNormalizedEntry(bp[k], fp[k]);
        }
        out.properties = mergedProps;
    }
    return out;
}

class Schema {
    constructor(schemaDef = {}, options = {}) {
        if (!_isPlainObject(schemaDef)) throw new TypeError('schemaDef must be an object');

        // options
        this.options = Object.assign({}, DEFAULT_OPTIONS, options || {});

        // refs storage (external refs) and caches MUST be initialized BEFORE any _loadExternalRefs call
        this.externalRefs = {};
        this._refCheckerCache = new Map();
        this._overrideCheckerCache = new Map();

        // pre-init stats
        this._stats = { counts: {}, totalNs: {} };

        // load external refs (if provided in options)
        if (this.options.refs) this._loadExternalRefs(this.options.refs);

        // raw schema + normalized
        this.rawSchema = _shallowCloneSchema(schemaDef);
        const normalized = normalizeSchema(schemaDef, { maxRegexLength: this.options.maxRegexLength });
        this._normalizedSchema = normalized.schema;
        this._inlineMap = normalized.inlineMap;
        this._localDefs = normalized.localDefs || {};

        // conditionals
        this._conditionals = [];

        // prebuilt checkers (or lazy wrappers for $ref placeholders)
        this._checkers = {};
        const keys = Object.keys(this._normalizedSchema);
        for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            const ent = this._normalizedSchema[k];
            if (ent && ent.__isRef) {
                this._checkers[k] = (value, ctx) => {
                    const checker = this._resolveRefChecker(ent.$ref, k);
                    return checker(value, ctx);
                };
            } else {
                this._checkers[k] = makeChecker(k, ent, this.options);
            }
        }

        // lint schema now and throw SchemaError on issues
        const lint = this._lintSchema();
        if (lint.length) throw new SchemaError(lint);
    }

    _loadExternalRefs(input) {
        if (!input) return;
        if (Array.isArray(input)) {
            for (let i = 0; i < input.length; i++) {
                const it = input[i];
                if (_isPlainObject(it)) {
                    const ks = Object.keys(it);
                    for (let j = 0; j < ks.length; j++) this.externalRefs[ks[j]] = it[ks[j]];
                }
            }
        } else if (_isPlainObject(input)) {
            const ks = Object.keys(input);
            for (let i = 0; i < ks.length; i++) this.externalRefs[ks[i]] = input[ks[i]];
        } else {
            throw new TypeError('refs must be an object map or array of maps');
        }
        // clear cache
        if (this._refCheckerCache && typeof this._refCheckerCache.clear === 'function') this._refCheckerCache.clear();
    }

    addRef(name, def) {
        if (typeof name !== 'string' || !name.length) throw new TypeError('ref name must be a non-empty string');
        if (Object.prototype.hasOwnProperty.call(this.externalRefs, name)) {
            throw new SchemaError([{ path: name, message: `Ref '${name}' already exists` }]);
        }
        this.externalRefs[name] = def;
        this._refCheckerCache.delete(name);
        return undefined;
    }

    addRefs(refs) {
        if (!refs) return undefined;
        const incoming = {};
        if (Array.isArray(refs)) {
            for (let i = 0; i < refs.length; i++) {
                const it = refs[i];
                if (!_isPlainObject(it)) continue;
                const ks = Object.keys(it);
                for (let j = 0; j < ks.length; j++) incoming[ks[j]] = it[ks[j]];
            }
        } else if (_isPlainObject(refs)) {
            const ks = Object.keys(refs);
            for (let i = 0; i < ks.length; i++) incoming[ks[i]] = refs[ks[i]];
        } else {
            throw new TypeError('refs must be an object map or array of maps');
        }
        // detect duplicates
        const dupes = [];
        const inKeys = Object.keys(incoming);
        for (let i = 0; i < inKeys.length; i++) {
            const k = inKeys[i];
            if (Object.prototype.hasOwnProperty.call(this.externalRefs, k)) dupes.push(k);
        }
        if (dupes.length) {
            const errs = dupes.map(d => ({ path: d, message: `Ref '${d}' already exists` }));
            throw new SchemaError(errs);
        }
        // merge
        for (let i = 0; i < inKeys.length; i++) {
            const k = inKeys[i];
            this.externalRefs[k] = incoming[k];
            this._refCheckerCache.delete(k);
        }
        return undefined;
    }

    overrideRef(name, def) {
        if (typeof name !== 'string' || !name.length) throw new TypeError('ref name must be a non-empty string');
        this.externalRefs[name] = def;
        this._refCheckerCache.delete(name);
        return undefined;
    }

    removeRef(name) {
        if (typeof name !== 'string' || !name.length) return false;
        const had = Object.prototype.hasOwnProperty.call(this.externalRefs, name);
        if (had) delete this.externalRefs[name];
        this._refCheckerCache.delete(name);
        return had;
    }

    resolveRef(name) {
        if (!name) return undefined;
        if (this.externalRefs && Object.prototype.hasOwnProperty.call(this.externalRefs, name)) {
            try {
                return normalizeEntry(this.externalRefs[name], { maxRegexLength: this.options.maxRegexLength }, name, name);
            } catch (e) { return undefined; }
        }
        if (this._localDefs && Object.prototype.hasOwnProperty.call(this._localDefs, name)) {
            try { return normalizeEntry(this._localDefs[name], { maxRegexLength: this.options.maxRegexLength }, name, name); } catch (e) { return undefined; }
        }
        const looked = _getByPath(this.rawSchema, name);
        if (typeof looked !== 'undefined') {
            try { return normalizeEntry(looked, { maxRegexLength: this.options.maxRegexLength }, name, name); } catch (e) { return undefined; }
        }
        return undefined;
    }

    _resolveRefChecker(refName, fieldNameForErrors) {
        if (this._refCheckerCache.has(refName)) return this._refCheckerCache.get(refName);
        // external refs
        if (this.externalRefs && Object.prototype.hasOwnProperty.call(this.externalRefs, refName)) {
            const raw = this.externalRefs[refName];
            try {
                const normalized = normalizeEntry(raw, { maxRegexLength: this.options.maxRegexLength }, refName, refName);
                const chk = makeChecker(fieldNameForErrors || refName, normalized, this.options);
                this._refCheckerCache.set(refName, chk);
                return chk;
            } catch (e) {
                const throwingChecker = (v, ctx) => {
                    const path = ctx.path;
                    const err = _makeErrorObj(path, `failed to normalize external ref '${refName}': ${String(e.message || e)}`, 'ERR_REF_NORMALIZE', e);
                    return [[err], v];
                };
                this._refCheckerCache.set(refName, throwingChecker);
                return throwingChecker;
            }
        }
        // local defs
        if (this._localDefs && Object.prototype.hasOwnProperty.call(this._localDefs, refName)) {
            try {
                const normalized = normalizeEntry(this._localDefs[refName], { maxRegexLength: this.options.maxRegexLength }, refName, refName);
                const chk = makeChecker(fieldNameForErrors || refName, normalized, this.options);
                this._refCheckerCache.set(refName, chk);
                return chk;
            } catch (e) {
                const throwingChecker = (v, ctx) => {
                    const path = ctx.path;
                    const err = _makeErrorObj(path, `failed to normalize local $defs ref '${refName}': ${String(e.message || e)}`, 'ERR_REF_NORMALIZE', e);
                    return [[err], v];
                };
                this._refCheckerCache.set(refName, throwingChecker);
                return throwingChecker;
            }
        }
        // rawSchema path-ref
        const looked = _getByPath(this.rawSchema, refName);
        if (typeof looked !== 'undefined') {
            try {
                const normalized = normalizeEntry(looked, { maxRegexLength: this.options.maxRegexLength }, refName, refName);
                const chk = makeChecker(fieldNameForErrors || refName, normalized, this.options);
                this._refCheckerCache.set(refName, chk);
                return chk;
            } catch (e) {
                const throwingChecker = (v, ctx) => {
                    const path = ctx.path;
                    const err = _makeErrorObj(path, `failed to normalize path-ref '${refName}': ${String(e.message || e)}`, 'ERR_REF_NORMALIZE', e);
                    return [[err], v];
                };
                this._refCheckerCache.set(refName, throwingChecker);
                return throwingChecker;
            }
        }
        // unresolved
        const unresolvedChecker = (v, ctx) => {
            const path = ctx.path;
            const err = _makeErrorObj(path, `unresolved ref '${refName}'`, 'ERR_REF_UNRESOLVED', null);
            return [[err], v];
        };
        this._refCheckerCache.set(refName, unresolvedChecker);
        return unresolvedChecker;
    }

    withOptions(opts = {}) {
        const merged = Object.assign({}, this.options, opts || {});
        const clone = new Schema(this.rawSchema, merged);
        clone.externalRefs = Object.assign({}, this.externalRefs);
        clone._refCheckerCache = new Map();
        return clone;
    }

    updateOptions(opts = {}) {
        Object.assign(this.options, opts || {});
        // clear caches if relevant options changed
        if (this._refCheckerCache && typeof this._refCheckerCache.clear === 'function') this._refCheckerCache.clear();
        this._invalidateOverrideCache();
        return this;
    }

    when(pathOrPredicate) {
        const self = this;
        const holder = { pathOrPredicate };
        return {
            is(isValOrFn) {
                holder.is = isValOrFn;
                return {
                    do(fragment) {
                        if (!_isPlainObject(fragment)) throw new TypeError('fragment must be an object');
                        const normalizedFragment = {};
                        const fk = Object.keys(fragment);
                        for (let i = 0; i < fk.length; i++) {
                            const key = fk[i];
                            normalizedFragment[key] = normalizeEntry(fragment[key], { maxRegexLength: self.options.maxRegexLength }, key, key);
                        }
                        self._conditionals.push({
                            pathOrPredicate: holder.pathOrPredicate,
                            is: holder.is,
                            fragment: normalizedFragment
                        });
                        self._invalidateOverrideCache();
                        return self;
                    }
                };
            }
        };
    }

    _invalidateOverrideCache() {
        this._overrideCheckerCache = new Map();
    }

    _lintSchema() {
        const issues = [];
        const keys = Object.keys(this._normalizedSchema);
        for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            const e = this._normalizedSchema[k];
            if (typeof e.type !== 'undefined') {
                const t = e.type;
                if (typeof t === 'string') {
                    const valid = ['string', 'number', 'object', 'array', 'boolean', 'bigint', 'function', 'symbol', 'null', 'undefined', 'any', 'date', 'regexp', 'regex', 'map', 'set', 'url', 'buffer'];
                    if (valid.indexOf(t) === -1) issues.push({ path: k, message: `Invalid type '${t}' for field '${k}'`, code: 'ERR_SCHEMA_TYPE' });
                } else if (typeof t !== 'function') {
                    issues.push({ path: k, message: `Type for field '${k}' must be a string or constructor`, code: 'ERR_SCHEMA_TYPE' });
                }
            }
            if (e.regex && !(e.regex instanceof RegExp)) issues.push({ path: k, message: `Field '${k}' has invalid regex; must be RegExp`, code: 'ERR_SCHEMA_REGEX' });
            if (e.enum && !Array.isArray(e.enum)) issues.push({ path: k, message: `Field '${k}' enum must be an array`, code: 'ERR_SCHEMA_ENUM' });
            if (e.properties && !_isPlainObject(e.properties)) issues.push({ path: k, message: `Field '${k}' properties must be an object`, code: 'ERR_SCHEMA_PROPERTIES' });
        }
        return issues;
    }

    _evaluateConditionals(obj) {
        const overrides = {};
        const conds = this._conditionals;
        for (let i = 0; i < conds.length; i++) {
            const rule = conds[i];
            let condResult = false;
            try {
                if (typeof rule.pathOrPredicate === 'function') condResult = !!rule.pathOrPredicate(obj);
                else {
                    const valueAtPath = _getByPath(obj, rule.pathOrPredicate);
                    if (typeof rule.is === 'function') condResult = !!rule.is(valueAtPath);
                    else condResult = (valueAtPath === rule.is);
                }
            } catch (_) { condResult = false; }
            if (condResult) {
                const fk = Object.keys(rule.fragment || {});
                for (let j = 0; j < fk.length; j++) {
                    const field = fk[j];
                    overrides[field] = rule.fragment[field];
                }
            }
        }
        return overrides;
    }

    _getOverrideCheckerFor(fieldName, fragmentEntry) {
        if (!this._overrideCheckerCache.has(fieldName)) this._overrideCheckerCache.set(fieldName, new WeakMap());
        const wmap = this._overrideCheckerCache.get(fieldName);
        if (fragmentEntry && typeof fragmentEntry === 'object' && wmap.has(fragmentEntry)) return wmap.get(fragmentEntry);
        const baseEntry = this._normalizedSchema[fieldName] || {};
        const merged = mergeNormalizedEntry(baseEntry, fragmentEntry);
        const checker = makeChecker(fieldName, merged, this.options);
        if (fragmentEntry && typeof fragmentEntry === 'object') {
            try { wmap.set(fragmentEntry, checker); } catch (e) { /* ignore */ }
        }
        return checker;
    }

    getStats() { return Object.assign({}, this._stats); }
    resetStats() { this._stats = { counts: {}, totalNs: {} }; }

    benchmark(obj, opts = {}) {
        const iterations = typeof opts.iterations === 'number' ? opts.iterations : 1000;
        const action = opts.action || 'validate';
        const start = process.hrtime.bigint();
        let last;
        for (let i = 0; i < iterations; i++) {
            if (action === 'validate') last = this.validate(obj, opts);
            else if (action === 'check') last = this.check(obj, opts);
            else if (action === 'assertTypes') last = this.assertTypes(obj, opts);
            else last = this.validate(obj, opts);
        }
        const end = process.hrtime.bigint();
        const totalNs = Number(end - start);
        const totalMs = totalNs / 1e6;
        return { iterations, totalMs, avgMs: totalMs / iterations, lastResult: last };
    }

    profile(items = [], opts = {}) {
        const action = opts.action || 'validate';
        const warmup = typeof opts.warmup === 'number' ? opts.warmup : 10;
        for (let i = 0; i < Math.min(warmup, items.length); i++) {
            if (action === 'validate') this.validate(items[i], opts);
            else if (action === 'check') this.check(items[i], opts);
            else if (action === 'assertTypes') this.assertTypes(items[i], opts);
            else this.validate(items[i], opts);
        }
        const results = [];
        for (let i = 0; i < items.length; i++) {
            const t0 = process.hrtime.bigint();
            let res;
            if (action === 'validate') res = this.validate(items[i], opts);
            else if (action === 'check') res = this.check(items[i], opts);
            else if (action === 'assertTypes') res = this.assertTypes(items[i], opts);
            else res = this.validate(items[i], opts);
            const t1 = process.hrtime.bigint();
            results.push({ index: i, ns: Number(t1 - t0), ok: res && res.valid });
        }
        let sum = 0;
        for (let i = 0; i < results.length; i++) sum += results[i].ns;
        const totalMs = sum / 1e6;
        return { items: items.length, totalMs, avgMs: totalMs / (items.length || 1), results };
    }

    validate(obj = {}, callOptions = {}) {
        if (!_isPlainObject(obj) && !Array.isArray(obj)) throw new TypeError('object must be an object or array');
        const opts = Object.assign({}, this.options, callOptions || {});
        const errors = [];
        const result = Array.isArray(obj) ? [] : {};

        const overrides = this._evaluateConditionals(obj);
        const schema = this._normalizedSchema;
        const keys = Object.keys(schema);
        for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            const path = opts.pathPrefix ? `${opts.pathPrefix}.${k}` : k;
            let checker = this._checkers[k];
            if (Object.prototype.hasOwnProperty.call(overrides, k)) checker = this._getOverrideCheckerFor(k, overrides[k]);
            const t0 = process.hrtime.bigint();
            const [entryErrors, coerced] = checker(obj[k], { path, options: opts });
            const t1 = process.hrtime.bigint();
            const ns = Number(t1 - t0);
            this._stats.counts[k] = (this._stats.counts[k] || 0) + 1;
            this._stats.totalNs[k] = (this._stats.totalNs[k] || 0) + ns;

            if (entryErrors.length) {
                for (let j = 0; j < entryErrors.length; j++) errors.push(entryErrors[j]);
                if (opts.failFast) {
                    const partial = result;
                    if (opts.valueOnly) throw new ValidationError(errors, partial);
                    return { valid: false, errors, value: partial };
                }
            }
            if (typeof coerced !== 'undefined') result[k] = coerced;
            else if (Object.prototype.hasOwnProperty.call(obj, k)) result[k] = obj[k];
        }

        const objectKeys = Object.keys(obj || {});
        if (opts.strict) {
            for (let i = 0; i < objectKeys.length; i++) {
                const k = objectKeys[i];
                if (!Object.prototype.hasOwnProperty.call(schema, k)) {
                    if (opts.removeUnknown) continue;
                    const path = opts.pathPrefix ? `${opts.pathPrefix}.${k}` : k;
                    errors.push(_makeErrorObj(path, 'unknown field', 'ERR_UNKNOWN', null));
                    if (opts.failFast) {
                        const partial = result;
                        if (opts.valueOnly) throw new ValidationError(errors, partial);
                        return { valid: false, errors, value: partial };
                    }
                }
            }
        } else {
            for (let i = 0; i < objectKeys.length; i++) {
                const k = objectKeys[i];
                if (!Object.prototype.hasOwnProperty.call(schema, k)) {
                    if (opts.removeUnknown) continue;
                    result[k] = obj[k];
                }
            }
        }

        if (opts.removeEmpty) {
            function clean(v) {
                if (v === '' || v === null || (Array.isArray(v) && v.length === 0) || (_isPlainObject(v) && Object.keys(v).length === 0)) return undefined;
                if (Array.isArray(v)) {
                    const tmp = [];
                    for (let i = 0; i < v.length; i++) {
                        const c = clean(v[i]);
                        if (typeof c !== 'undefined') tmp.push(c);
                    }
                    return tmp.length ? tmp : undefined;
                }
                if (_isPlainObject(v)) {
                    const o = {};
                    const ks = Object.keys(v);
                    for (let i = 0; i < ks.length; i++) {
                        const p = ks[i];
                        const c = clean(v[p]);
                        if (typeof c !== 'undefined') o[p] = c;
                    }
                    return Object.keys(o).length ? o : undefined;
                }
                return v;
            }
            const cleaned = {};
            const rk = Object.keys(result);
            for (let i = 0; i < rk.length; i++) {
                const k = rk[i];
                const v = clean(result[k]);
                if (typeof v !== 'undefined') cleaned[k] = v;
            }
            for (let i = 0; i < rk.length; i++) delete result[rk[i]];
            const ck = Object.keys(cleaned);
            for (let i = 0; i < ck.length; i++) result[ck[i]] = cleaned[ck[i]];
        }
        const final = { valid: errors.length === 0, errors, value: result };
        if (opts.valueOnly) return result;
        return final;
    }

    enforce(obj = {}, callOptions = {}) {
        const opts = Object.assign({}, this.options, callOptions || {});
        const res = this.validate(obj, opts);
        if (res && res.valid) return opts.valueOnly ? res.value : res.value;
        if (!res) throw new ValidationError([{ path: '', message: 'validation aborted' }], undefined);
        throw new ValidationError(res.errors, res.value);
    }

    sanitize(obj = {}, callOptions = {}) {
        const opts = Object.assign({}, this.options, callOptions || {});
        const res = this.validate(obj, opts);
        if (opts.valueOnly) return res.value;
        return { value: res.value, errors: res.errors };
    }

    check(obj = {}, callOptions = {}) {
        const opts = Object.assign({}, this.options, callOptions || {});
        const local = Object.assign({}, opts, { failFast: true });
        try {
            const res = this.validate(obj, local);
            return !!(res && res.valid);
        } catch (e) {
            if (e instanceof ValidationError) return false;
            throw e;
        }
    }

    assertTypes(obj = {}, callOptions = {}) {
        const opts = Object.assign({}, this.options, callOptions || {});
        const errors = [];
        const result = Array.isArray(obj) ? [] : {};
        const overrides = this._evaluateConditionals(obj);
        const schema = this._normalizedSchema;
        const keys = Object.keys(schema);
        for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            const path = opts.pathPrefix ? `${opts.pathPrefix}.${k}` : k;
            let checker = this._checkers[k];
            if (Object.prototype.hasOwnProperty.call(overrides, k)) checker = this._getOverrideCheckerFor(k, overrides[k]);
            const [entryErrs, coerced] = checker(obj[k], { path, options: opts });
            if (entryErrs.length) {
                for (let j = 0; j < entryErrs.length; j++) errors.push(entryErrs[j]);
                if (opts.failFast) return { valid: false, errors, value: undefined };
            }
            if (typeof coerced !== 'undefined') result[k] = coerced;
            else if (Object.prototype.hasOwnProperty.call(obj, k)) result[k] = obj[k];
        }

        const objectKeys = Object.keys(obj || {});
        if (opts.strict) {
            for (let i = 0; i < objectKeys.length; i++) {
                const k = objectKeys[i];
                if (!Object.prototype.hasOwnProperty.call(schema, k)) {
                    if (opts.removeUnknown) continue;
                    const path = opts.pathPrefix ? `${opts.pathPrefix}.${k}` : k;
                    errors.push(_makeErrorObj(path, 'unknown field', 'ERR_UNKNOWN', null));
                    if (opts.failFast) return { valid: false, errors, value: undefined };
                }
            }
        } else {
            for (let i = 0; i < objectKeys.length; i++) {
                const k = objectKeys[i];
                if (!Object.prototype.hasOwnProperty.call(schema, k)) {
                    if (opts.removeUnknown) continue;
                    result[k] = obj[k];
                }
            }
        }

        return { valid: errors.length === 0, errors, value: result };
    }

    batch(items = [], action = 'validate', callOptions = {}) {
        if (!Array.isArray(items)) throw new TypeError('items must be an array');
        const allowed = ['validate', 'enforce', 'sanitize', 'check', 'assertTypes'];
        if (allowed.indexOf(action) === -1) throw new TypeError(`action must be one of ${allowed.join(',')}`);
        const opts = Object.assign({}, this.options, callOptions || {});
        const results = [];
        let aggregatedValid = true;
        const aggregatedErrors = [];
        const aggregatedValues = [];

        for (let i = 0; i < items.length; i++) {
            const it = items[i];
            try {
                if (action === 'validate') {
                    const r = this.validate(it, opts);
                    results.push(r);
                    aggregatedValues.push(r.value);
                    if (!r.valid) {
                        aggregatedValid = false;
                        for (let j = 0; j < r.errors.length; j++) aggregatedErrors.push(r.errors[j]);
                        if (opts.failFast) return { results, aggregated: { valid: false, errors: aggregatedErrors, value: aggregatedValues } };
                    }
                } else if (action === 'sanitize') {
                    const r = this.sanitize(it, opts);
                    results.push(r);
                    aggregatedValues.push(r.value);
                    if (r.errors && r.errors.length) {
                        aggregatedValid = false;
                        for (let j = 0; j < r.errors.length; j++) aggregatedErrors.push(r.errors[j]);
                        if (opts.failFast) return { results, aggregated: { valid: false, errors: aggregatedErrors, value: aggregatedValues } };
                    }
                } else if (action === 'enforce') {
                    const v = this.enforce(it, opts);
                    results.push({ value: v, valid: true, errors: [] });
                    aggregatedValues.push(v);
                } else if (action === 'check') {
                    const ok = this.check(it, opts);
                    results.push({ ok });
                    if (!ok) { aggregatedValid = false; if (opts.failFast) return { results, aggregated: { valid: false, errors: aggregatedErrors, value: aggregatedValues } }; }
                } else if (action === 'assertTypes') {
                    const r = this.assertTypes(it, opts);
                    results.push(r);
                    aggregatedValues.push(r.value);
                    if (!r.valid) {
                        aggregatedValid = false;
                        for (let j = 0; j < r.errors.length; j++) aggregatedErrors.push(r.errors[j]);
                        if (opts.failFast) return { results, aggregated: { valid: false, errors: aggregatedErrors, value: aggregatedValues } };
                    }
                }
            } catch (err) {
                if (err instanceof ValidationError) {
                    results.push({ error: err.errors });
                    aggregatedValid = false;
                    for (let j = 0; j < (err.errors || []).length; j++) aggregatedErrors.push(err.errors[j]);
                    if (opts.failFast) return { results, aggregated: { valid: false, errors: aggregatedErrors, value: aggregatedValues } };
                } else {
                    throw err;
                }
            }
        }
        return { results, aggregated: { valid: aggregatedValid, errors: aggregatedErrors, value: aggregatedValues } };
    }
}

// Attach classes to Schema for consumer convenience
Schema.ValidationError = ValidationError;
Schema.SchemaError = SchemaError;

// Exports
module.exports = Schema;
module.exports.Schema = Schema;
module.exports.default = Schema;