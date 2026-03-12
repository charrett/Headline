/**
 * OpenAPI spec parser and JSON Schema validator for consumer contract tests.
 *
 * Reads the shared OpenAPI consumer spec, resolves $ref pointers,
 * converts OpenAPI 3.0 nullable to JSON Schema draft-07, and
 * returns ajv validate functions for request/response shapes.
 */
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const Ajv = require('ajv');

/**
 * Deep clone a plain object/array.
 */
function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Recursively resolve all $ref pointers in a schema.
 * Only handles local refs of the form #/components/schemas/Name.
 */
function resolveRefs(schema, definitions) {
    if (!schema || typeof schema !== 'object') return schema;

    if (Array.isArray(schema)) {
        return schema.map(item => resolveRefs(item, definitions));
    }

    if (schema.$ref) {
        const refName = schema.$ref.replace('#/components/schemas/', '');
        const resolved = definitions[refName];
        if (!resolved) throw new Error(`Unresolved $ref: ${schema.$ref}`);
        return resolveRefs(deepClone(resolved), definitions);
    }

    const result = {};
    for (const [key, value] of Object.entries(schema)) {
        result[key] = resolveRefs(value, definitions);
    }
    return result;
}

/**
 * Recursively convert OpenAPI 3.0 `nullable: true` to JSON Schema draft-07.
 *
 * - {type: "string", nullable: true}  ->  {type: ["string", "null"]}
 * - {allOf: [...], nullable: true}    ->  {oneOf: [...resolved, {type: "null"}]}
 */
function convertNullable(schema) {
    if (!schema || typeof schema !== 'object') return schema;
    if (Array.isArray(schema)) return schema.map(convertNullable);

    const result = {};
    for (const [key, value] of Object.entries(schema)) {
        if (key === 'nullable') continue; // strip nullable, handle below
        result[key] = convertNullable(value);
    }

    if (schema.nullable === true) {
        if (result.allOf) {
            // {allOf: [resolved], nullable: true} -> {oneOf: [merged, {type: "null"}]}
            const merged = Object.assign({}, ...result.allOf);
            delete result.allOf;
            return { oneOf: [convertNullable(merged), { type: 'null' }] };
        } else if (result.type && !Array.isArray(result.type)) {
            result.type = [result.type, 'null'];
        } else if (!result.type) {
            // No type specified, just allow null as well
            result.oneOf = [
                ...(result.oneOf || [{ type: 'object' }]),
                { type: 'null' }
            ];
        }
    }

    return result;
}

/**
 * Load and parse the OpenAPI spec, returning validator functions.
 *
 * @param {string} [specPath] - Path to the YAML spec. Defaults to the
 *   sibling qchb_chat repo's consumer contract.
 * @returns {{ validateRequest, validateResponse, getSchema }}
 */
function createValidator(specPath) {
    const resolvedPath = specPath || path.resolve(
        __dirname, '..', '..', '..', 'qchb_chat', 'backend', 'contract', 'openapi_consumer.yaml'
    );

    const specText = fs.readFileSync(resolvedPath, 'utf8');
    const spec = YAML.parse(specText);
    const definitions = spec.components?.schemas || {};

    const ajv = new Ajv({ allErrors: true, unknownFormats: 'ignore' });

    /**
     * Get a fully resolved + nullable-converted schema by component name.
     */
    function getSchema(schemaName) {
        const raw = definitions[schemaName];
        if (!raw) throw new Error(`Schema not found: ${schemaName}`);
        const resolved = resolveRefs(deepClone(raw), definitions);
        return convertNullable(resolved);
    }

    /**
     * Compile and cache an ajv validate function for a named schema.
     */
    const cache = {};
    function compile(schemaName) {
        if (!cache[schemaName]) {
            cache[schemaName] = ajv.compile(getSchema(schemaName));
        }
        return cache[schemaName];
    }

    /**
     * Get the request body schema for a path + method from the spec.
     */
    function getRequestBodySchemaName(pathStr, method) {
        const pathObj = spec.paths?.[pathStr]?.[method];
        if (!pathObj) throw new Error(`Path not found: ${method.toUpperCase()} ${pathStr}`);
        const ref = pathObj.requestBody?.content?.['application/json']?.schema?.$ref;
        if (ref) return ref.replace('#/components/schemas/', '');
        return null;
    }

    /**
     * Get the response schema for a path + method + status from the spec.
     */
    function getResponseSchemaName(pathStr, method, status) {
        const pathObj = spec.paths?.[pathStr]?.[method];
        if (!pathObj) throw new Error(`Path not found: ${method.toUpperCase()} ${pathStr}`);
        const responseObj = pathObj.responses?.[String(status)];
        if (!responseObj) return null;
        const schemaOrRef = responseObj.content?.['application/json']?.schema;
        if (!schemaOrRef) return null;
        if (schemaOrRef.$ref) return schemaOrRef.$ref.replace('#/components/schemas/', '');
        // Inline schema (e.g. array type) - return the resolved schema directly
        return schemaOrRef;
    }

    /**
     * Validate data against the request body schema for an endpoint.
     * Returns { valid: boolean, errors: array|null }
     */
    function validateRequest(pathStr, method, data) {
        const schemaName = getRequestBodySchemaName(pathStr, method);
        if (!schemaName) return { valid: true, errors: null };
        const validate = compile(schemaName);
        const valid = validate(data);
        return { valid, errors: validate.errors };
    }

    /**
     * Validate data against the response schema for an endpoint + status.
     * Returns { valid: boolean, errors: array|null }
     */
    function validateResponse(pathStr, method, status, data) {
        const schemaRef = getResponseSchemaName(pathStr, method, status);
        if (!schemaRef) return { valid: true, errors: null };

        let validate;
        if (typeof schemaRef === 'string') {
            validate = compile(schemaRef);
        } else {
            // Inline schema (e.g. array of MessageResponse)
            const resolved = resolveRefs(deepClone(schemaRef), definitions);
            const converted = convertNullable(resolved);
            validate = ajv.compile(converted);
        }

        const valid = validate(data);
        return { valid, errors: validate.errors };
    }

    return { validateRequest, validateResponse, getSchema, compile };
}

module.exports = { createValidator };
