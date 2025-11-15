/**
 * specific error used by the type checker
 */
export class TypeError extends Error {
    /**
     * @typed(String, _=>TypeError)
     */
    constructor(message) {
        super(message);
    }
}

/**
 * like a native Set but with an equals Method
 */
class ComparableSet extends Set {
    /**
     * @param {unknown} otherSet
     * @return {boolean}
     */
    equals(otherSet) {
        if (otherSet === this) {
            return true
        }
        if ( ! (otherSet instanceof Set) ) {
            return false
        }
        if ([...this.values()].length !== [...otherSet.values()].length) {
            return false
        }
        for (const val of this.values()) {
            if (! otherSet.has(val)) {
                return false
            }
        }
        return true
    }
}

/**
 * deep equals 2 objects using strict equals
 */
function deepEqual(obj1, obj2) {
    if (obj1 === obj2) {
        return true
    }
    if (typeof obj1 !== typeof obj2) {
        return false
    }
    if (typeof obj1 === "object") {
        if (Object.entries(obj1).length !== Object.entries(obj2).length) {
            return false
        }
        for (const key of Object.keys(obj1)) {
            if (! deepEqual(obj1[key], obj2[key])) {
                return false
            }
        }
    }
    return true
}

/**
 * the base class for all types
 */
class Type {
    /**
     * the null type accepts nothing, the typescript equivalent is `never`
     * @type {Type}
     */
    static #null = new Type(() => {throw new TypeError("can't set value on a type null")}, "null", null)
    static get null() { return Type.#null }

    /**
     * the undefined type accepts everything, the typescript equivalent is `any` or `unknown`
     * @type {Type}
     */
    static #undefined = new Type(() => true, "undefined", undefined)
    static get undefined() { return Type.#undefined }

    /**
     * accepts any boolean
     * @type {Type}
     */
    static #boolean = new Type(value => value === true || value === false || value instanceof Boolean, "boolean", false)
    static get boolean() { return Type.#boolean }

    /**
     * accepts any number
     * @type {Type}
     */
    static #number = new Type(value => typeof value === "number" || value instanceof Number, "number", 0)
    static get number() { return Type.#number }

    /**
     * accepts any string
     * @type {Type}
     */
    static #string = new Type(value => typeof value === "string" || value instanceof String, "string", "")
    static get string() { return Type.#string }

    /**
     * accepts any object
     * @type {Type}
     */
    static #object = new Type(value => typeof value === "object" && !Array.isArray(value) && value !== null, "object", {})
    static get object() { return Type.#object }

    /**
     * accepts any array
     * @type {Type}
     */
    static #array = new Type(value => typeof value === "object" && Array.isArray(value), "array", [])
    static get array() { return Type.#array }

    /**
     * accepts any symbol
     * @type {Type}
     */
    static #symbol = new Type(value => typeof value === "symbol", "symbol", Symbol())
    static get symbol() { return Type.#symbol }

    /**
     * accepts any function
     * @type {Type}
     */
    static #function = new Type(value => typeof value === "function", "function", _=>_)
    static get function() { return Type.#function }

    /**
     * maps known primitive types to their corresponding Type instances
     * @type {Map<unknown, Type>}
     */
    static #known = new Map([
        [null, Type.null],
        [undefined, Type.undefined],
        [Boolean, Type.boolean],
        [Number, Type.number],
        [String, Type.string],
        [Object, Type.object],
        [Array, Type.array],
        [Symbol, Type.symbol],
        [Function, Type.function]
    ])

    /**
     * the fonction that confirms a value is of the type
     * @type {(value: any) => boolean}
     */
    #validationFunction
    /**
     * @type {string}
     */
    #name
    /**
     * the default value for the type
     * @type {unknown}
     */
    #initialValue

    /**
     * @param {(value: any) => boolean} validationFunction
     * @param name
     * @param initialValue
     */
    constructor(validationFunction = () => false, name = "", initialValue = undefined) {
        this.#validationFunction = validationFunction
        this.#name = name
        this.#initialValue = initialValue
    }

    /**
     * check the validity of a value using the validation function
     * @param {unknown} value
     * @return {boolean}
     */
    isValid(value) {
        return this.#validationFunction(value)
    }

    /**
     * check the validity of a value at a specific index in an array, tuple, or object
     * @param {unknown} index
     * @param {unknown} value
     * @return {boolean}
     */
    isValidAt(index, value) {
        return false
    }

    /**
     * return the type of value at a specific index in an array, tuple, or object
     * @param {unknown} index
     * @return {Type | unknown}
     */
    subtypeAt(index) {
        return undefined
    }

    /**
     * modify the value to make it compatible with the type
     * @param {unknown} value
     * @return {any}
     */
    editValue(value) {
        return value
    }

    /**
     * return the default value for the type
     * @return {unknown}
     */
    initialize() {
        return this.#initialValue
    }

    /**
     * return a string representation of the type
     * @return {string}
     */
    toString() {
        return this.#name
    }

    /**
     * return a Type instance corresponding to the given type hint
     * @param {unknown} typeHint
     * @return {Type}
     */
    static getFor(typeHint) {
        if (typeHint instanceof Type) {
            // if it is already a Type instance, return it as is
            return typeHint
        } else if (Type.#known.has(typeHint)) {
            // if it is a known type, return the corresponding Type instance
            return Type.#known.get(typeHint)
        } else if (typeof typeHint === "object") {
            // if it is an object, check if it is a tuple, a record or an instance
            if (Array.isArray(typeHint)) {
                // if the type hint is an array, it corresponds to a tuple. Array types MUST use ArrayType.getFor
                return TupleOf.getFor(...typeHint)
            } else {
                // if the type hint is an object, it can be a record or an instance.
                // we check its prototype to determine the type.
                if (typeHint.__proto__?.constructor === Object) {
                    return RecordOf.getFor(typeHint)
                } else {
                    return Instance.getFor(typeHint)
                }
            }
        } else if (typeof typeHint === "function") {
            // function
            this.#known.set(typeHint, new Type(value => value instanceof typeHint, typeHint.name))
            return this.#known.get(typeHint)
        } else {
            // the only left are primitives
            return Primitive.getFor(typeHint)
        }
    }
}

/**
 * A Type that represents a primitive value, such as a string, number, boolean, or null.
 */
class Primitive extends Type {
    /**
     * map of known instances of primitives allows returning the same instance for the same value
     * @type {Map<unknown, Primitive>}
     */
    static #known = new Map()
    /**
     * the value of the primitive type
     * @type {unknown}
     */
    #value

    constructor(value) {
        super()
        this.#value = value
    }

    /**
     * primitive types validate only the value itself
     * @param {unknown} value
     * @return {boolean}
     */
    isValid(value) {
        return this.#value === value
    }

    /**
     * since there is only one value for a primitive type, we initialize it to that value
     * @return {any}
     */
    initialize() {
        return this.#value;
    }

    /**
     * return a string representation of the primitive type
     * strings are wrapped in quotes to make them easier to read
     * @return {string}
     */
    toString() {
        if (typeof this.#value === "string") {
            return '"' + this.#value + '"'
        }
        return this.#value.toString()
    }

    /**
     * return the corresponding Type instance for a given primitive value
     * if one already exists for that value, it is returned, otherwise a new instance is created
     * @param {unknown} value
     * @return {Primitive}
     */
    static getFor(value) {
        if (! this.#known.has(value)) {
            this.#known.set(value, new Primitive(value))
        }
        return this.#known.get(value)
    }
}

/**
 * A Type that represents an instance of a class or object.
 */
class Instance extends Type {
    /**
     * using a memory map to clean Instance objects from memory when they are no longer referenced
     * @type {WeakMap<unknown, Instance>}
     */
    static #known = new WeakMap()
    #value

    constructor(value) {
        super()
        this.#value = value
    }

    /**
     * since we validate the instance itself, we only need to check using equals
     * @param {unknown} value
     * @return {boolean}
     */
    isValid(value) {
        return this.#value === value
    }

    /**
     * since we initialize the instance to itself, we don't need to do anything special
     * @return {unknown}
     */
    initialize() {
        return this.#value;
    }

    /**
     * return a string representation of the instance
     * @return {string}
     */
    toString() {
        return this.#value.toString()
    }

    /**
     * check for an existing instance in the memory map, or create a new one if none exists
     * @param {unknown} value
     * @return {Instance}
     */
    static getFor(value) {
        if (! this.#known.has(value)) {
            this.#known.set(value, new Instance(value))
        }
        return this.#known.get(value)
    }
}

/**
 * A Type that represents a union of other types.
 */
class OneOf extends Type {
    /**
     * map of known OneOf types allows returning the same instance for the same set of subtypes
     * @type {Map<ComparableSet<Type>, OneOf>}
     */
    static #known = new Map()
    /**
     * @type {Type[]}
     */
    #subTypes = []

    constructor(...types) {
        super()
        this.#subTypes = [...types]
    }

    /**
     * isValid is implemented by checking if the value is valid for any of the subtypes
     * @param {unknown} value
     * @return {boolean}
     */
    isValid(value) {
        return this.#subTypes.find(t => t.isValid(value)) !== undefined
    }

    /**
     * isValidAt is implemented by checking if the value is valid for the subtype at the specified index
     * @param {unknown} index
     * @param {unknown} value
     * @return {boolean}
     */
    isValidAt(index, value) {
        return this.#subTypes.find(t => t.isValidAt(index, value)) !== undefined
    }

    /**
     * return the set of possible subtypes at the specified index
     * @param {unknown} index
     * @return {OneOf}
     */
    subtypeAt(index) {
        return oneOf(...this.#subTypes.map(t => t.subtypeAt(index)))
    }

    /**
     * initialize the value to the default value of the first subtype
     * @return {unknown}
     */
    initialize() {
        return this.#subTypes[0].initialize()
    }

    /**
     * modify the value to make it compatible with the type
     * @param {unknown} value
     * @return {unknown}
     */
    editValue(value) {
        if (typeof value !== "object") {
            return value
        }

        const subTypes = this.#subTypes

        const proxyHandler = {
            set(obj, prop, value) {
                let possibleTypes = subTypes.filter(t => t.isValid(value))
                let newObject
                if (Array.isArray(obj)) {
                    newObject = [...obj]
                    newObject[prop] = value
                } else {
                    newObject = {...obj, [prop]: value}
                }
                // find the types compatible with the new value
                const compatibleTypes = subTypes.filter(t => t.isValid(newObject))
                if (compatibleTypes.length === 0) {
                    console.error(`Can't set value of`, obj, `[${prop}] to`, value, `, incompatible with any of ${subTypes.map(t => t.toString()).join(" | ")}`)
                    return false
                }
                possibleTypes = compatibleTypes
                const isSafe = ! possibleTypes.some(t => {
                    const subt = t.subtypeAt(prop)
                    return subt instanceof ArrayOf ||
                        subt instanceof TupleOf ||
                        subt instanceof RecordOf
                })
                if (isSafe) {
                    obj[prop] = value
                    return true
                }
                console.error(`Ambiguous type for`, obj, `[${prop}], can be any of ${possibleTypes.map(t => t.subtypeAt(prop).toString()).join(" | ")}, please be more specific`)
                return false
            }
        }
        return new Proxy(value, proxyHandler)
    }

    /**
     * return a string representation of the type
     * @return {string}
     */
    toString() {
        return this.#subTypes.map(t => t.toString()).join(" | ")
    }

    /**
     *
     * @param types
     * @return {Type}
     */
    static getFor(...types) {
        // get the set of subtypes for the union
        types = new ComparableSet(types.map(t => t instanceof OneOf ? t.#subTypes : type(t)).flat())
        // if the set of type size is one, then it's not a union, so we return the first type
        if (types.size === 1) {
            return Type.getFor([...types][0])
        }

        // look for an existing OneOf instance with the same set of subtypes
        for (const [key, value] of this.#known.entries()) {
            if (types.equals(key)) {
                return value
            }
        }
        // if no existing instance is found, create a new one
        this.#known.set(types, new OneOf(...types))
        return this.#known.get(types)
    }
}

/**
 * A Type that represents an array of a specific type.
 */
class ArrayOf extends Type {
    /**
     * @type {Map<unknown, ArrayOf>}
     */
    static #known = new Map()
    #type = Type.null

    constructor(type) {
        super()
        this.#type = type
    }

    /**
     * @param {unknown[]} value
     * @return {boolean}
     */
    isValid(value) {
        return Array.isArray(value) && value.every((v) => this.#type.isValid(v))
    }

    /**
     * @param {unknown} index
     * @param {unknown} value
     * @return {boolean}
     */
    isValidAt(index, value) {
        return this.#type.isValid(value)
    }

    /**
     * @param {unknown} index
     * @return {Type}
     */
    subtypeAt(index) {
        return this.#type;
    }

    /**
     * @param {unknown} value
     * @return {unknown[]}
     */
    editValue(value) {
        const that = this
        // making a proxy allows checking the validity of the new value inside the array
        const proxyHandler = {
            set(obj, prop, value) {
                // check the validity of the new value
                if (that.#type.isValid(value)) {
                    obj[prop] = that.#type.editValue(value)
                    return true
                } else {
                    console.error(`invalid value`, value, `of type ${typeof value}, expected ${that.#type}`)
                    return false
                }
            }
        }
        return new Proxy(value, proxyHandler)
    }

    initialize() {
        return [];
    }

    toString() {
        return `ArrayOf(${this.#type.toString()})`
    }

    static getFor(...types) {
        const ty = type(...types)
        if (! this.#known.has(ty)) {
            this.#known.set(ty, new ArrayOf(ty))
        }
        return this.#known.get(ty)
    }
}

/**
 * A Type that represents a tuple of specific types.
 */
class TupleOf extends Type {
    static #leaf = Symbol()
    /** @type {Map<unknown, TupleOf>} */
    static #known = new Map()
    #types = []

    constructor(...types) {
        super()
        this.#types = types.map(t => type(t))
    }

    isValid(value) {
        return (
            Array.isArray(value) && value.every((v, i) => this.#types[i]?.isValid(v))
        )
    }

    isValidAt(index, value) {
        return index < this.#types.length && this.#types[index].isValid(value)
    }

    subtypeAt(index) {
        return this.#types[index];
    }

    editValue(value) {
        const that = this
        const proxyHandler = {
            set(obj, prop, value) {
                if (! that.#types[prop]) {
                    console.error(`Can't insert at index ${prop} into tuple`)
                    return false
                }
                if (that.#types[prop].isValid(value)) {
                    obj[prop] = that.#types[prop].editValue(value)
                    return true
                } else {
                    console.error(`invalid value`, value, `of type ${typeof value}, expected ${that.#types[prop]}`)
                    return false
                }
            }
        }
        return new Proxy(value, proxyHandler)
    }

    initialize() {
        return this.#types.map(t => t.initialize());
    }

    toString() {
        return `Tuple[${this.#types.map(t => t.toString()).join(", ")}]`
    }

    /**
     *
     * @param {unknown[]} types
     * @return {TupleOf}
     */
    static getFor(...types) {
        let val = types.reduce((map, key) => map?.get(key), this.#known)
        if (! val?.has(this.#leaf)) {
            let map = this.#known
            for (const ty of types) {
                if (! map.has(ty)) {
                    map.set(ty, new Map())
                }
                map = map.get(ty)
            }
            map.set(this.#leaf, new TupleOf(...types))
            val = map
        }
        return val.get(this.#leaf)
    }
}

/**
 * A Type that represents a record of specific types.
 */
class RecordOf extends Type {
    /** @type {Map<unknown, RecordOf>} */
    static #known = new Map()
    #types = {}

    constructor(types) {
        super()
        this.#types = [...Object.getOwnPropertySymbols(types), ...Object.getOwnPropertyNames(types)]
            .reduce((acc, key) => {
                acc[key] = type(types[key])
                return acc
            }, {})
    }

    isValid(value) {
        if (typeof value !== "object" || Array.isArray(value)) {
            return false
        }
        return [...Object.getOwnPropertySymbols(value), ...Object.getOwnPropertyNames(value)]
            .every(key => this.#types[key]?.isValid(value[key]))
    }

    isValidAt(index, value) {
        return this.#types[index].isValid(value)
    }

    subtypeAt(index) {
        return this.#types[index];
    }

    /**
     * add a proxy around the value to check the validity of inner values
     * @param {unknown} value
     * @return {Proxy<unknown>}
     */
    editValue(value) {
        const that = this
        const proxyHandler = {
            set(obj, prop, value) {
                if (! that.#types[prop]) {
                    console.error(`Can't insert with key ${prop} into record`)
                    return false
                }
                if (that.#types[prop].isValid(value)) {
                    obj[prop] = that.#types[prop].editValue(value)
                    return true
                } else {
                    console.error(`invalid value`, value, `of type ${typeof value}, expected ${that.#types[prop]}`)
                    return false
                }
            }
        }
        return new Proxy(value, proxyHandler)
    }

    initialize() {
        return Object.fromEntries(
            [...Object.getOwnPropertySymbols(this.#types), ...Object.getOwnPropertyNames(this.#types)]
                .map(key => ([key, this.#types[key].initialize()]))
        )
    }

    toString() {
        return `{ ${
            [
                ...Object.getOwnPropertySymbols(this.#types),
                ...Object.getOwnPropertyNames(this.#types)
            ]
                .map(key => `${key.toString()}: ${this.#types[key].toString()}`)
                .join(", ")
        } }`
    }

    /**
     *
     * @param {Record<unknown, unknown>} shape
     * @param {unknown[]} ignoredArgs
     * @return {RecordOf}
     */
    static getFor(shape, ...ignoredArgs) {
        if (ignoredArgs.length !== 0) {
            console.error(`RecordOf.getFor can only take one argument, others will be ignored`)
        }
        if (typeof shape !== "object" || Array.isArray(shape)) {
            throw new TypeError("Type RecordOf can only accept an object as argument")
        }

        for (const [key, value] of this.#known.entries()) {
            if (deepEqual(key, shape)) {
                return value
            }
        }
        const newRecordOf = new RecordOf(shape)
        this.#known.set(shape, newRecordOf)
        return newRecordOf
    }
}

/**
 * A Type that represents a nullable value of a specific type.
 */
class Nullable extends Type {
    /** @type {Map<unknown, Nullable>} */
    static #known = new Map()
    #type = Type.null

    constructor(subtype) {
        super()
        this.#type = subtype
    }

    isValid(value) {
        return value === null || value === undefined || this.#type.isValid(value)
    }

    isValidAt(index, value) {
        return this.#type.isValidAt(index, value)
    }

    subtypeAt(index) {
        return this.#type.subtypeAt(index);
    }

    editValue(value) {
        return value
    }

    initialize() {
        return null;
    }

    toString() {
        return `${this.#type.toString()}?`
    }

    static getFor(typeHint = null) {
        const ty = type(typeHint)
        if (! this.#known.has(ty)) {
            this.#known.set(ty, new Nullable(ty))
        }
        return this.#known.get(ty)
    }
}

/**
 * A Type that represents a function with a specific return type and parameters.
 */
class TypedFunction extends Type {
    /** @type {Map<unknown, TypedFunction>} */
    static #known = new Map()
    #overloads

    constructor(overloads) {
        super()
        this.#overloads = overloads
    }

    /**
     * we can't check the validity of the function without executing it, so we just return true if it is a function
     * @param {unknown} value
     * @return {boolean}
     */
    isValid(value) {
        return typeof value === "function"
    }

    /**
     *
     * @param {unknown | "return"} index
     * @param {unknown} value
     * @return {boolean}
     */
    isValidAt(index, value) {
        if (index === "return") {
            return this.#overloads.some(overload => overload.return.isValid(value))
        }
        return this.#overloads.some(overload => overload.params[index]?.isValid(value))
    }

    /**
     *
     * @param {unknown | "return"} index
     * @return {OneOf}
     */
    subtypeAt(index) {
        if (this.#overloads.length === 1) {
            if (index === "return") {
                return this.#overloads[0].return
            }
            return this.#overloads[0].params[index]
        } else {
            if (index === "return") {
                return oneOf(...this.#overloads.map(overload => overload.return))
            }
            return oneOf(...this.#overloads.map(overload => overload.params[index]))
        }
    }

    /**
     *
     * @param {unknown} value
     * @return {Function}
     */
    editValue(value) {
        const overloads = this.#overloads
        return function(...args) {
            let possibleOverloads = overloads
            for (let i = 0; i < args.length; i++) {
                const newOverloads = possibleOverloads.filter(overload => overload.params[i].isValid(args[i]))
                if (newOverloads.length === 0) {
                    // todo make error message more useful with some context
                    throw new TypeError(`invalid value ${args[i]} of type ${typeof args[i]}, expected ${possibleOverloads.map(overload => overload.params[i]).join(" or ")}`)
                }
                possibleOverloads = newOverloads
            }
            const returnValue = value.call(this, ...args)
            if (! possibleOverloads.some(overload => overload.return.isValid(returnValue))) {
                // todo make error message more useful with some context
                throw new TypeError(`invalid return value ${returnValue} of type ${typeof returnValue}, expected ${possibleOverloads.map(overload => overload.return).join(" or ")}`)
            }
            return returnValue
        }
    }

    /**
     * initialize to a function that always returns the default value of the return type
     * @return {function(): unknown}
     */
    initialize() {
        return () => this.subtypeAt("return").initialize();
    }

    /**
     * return a string representation of the type
     * @return {string}
     */
    toString() {
        return this.#overloads.map(overload => `(${overload.params.map(param => param.toString()).join(", ")}) => ${overload.return.toString()}`).join(" | ")
    }

    static getKnown() {
        return this.#known
    }

    /**
     * get a TypedFunction instance for the specified type hints
     * @param {unknown[]} typeHints
     * @return {TypedFunction}
     */
    static getFor(...typeHints) {
        // look for the function in the type hints to split the different overloads
        let overloads = typeHints.reduce((acc, hint, index) => {
            const currentOverload = acc.at(-1)
            if (typeof hint === "function" && hint.prototype === undefined) {
                currentOverload.return = type(hint())
                if (index !== typeHints.length - 1) {
                    acc.push({params: [], return: Type.null})
                }
            } else {
                currentOverload.params.push(type(hint))
            }
            return acc
        }, [{params: [], return: Type.null}])

        // looks for an existing TypedFunction instance with the same set of parameters and return type
        const knownOverloads = [...this.#known.keys()].find(key => {
            if (key.length !== overloads.length) {
                return false
            }
            for (const over of overloads) {
                const existInKey = key.find(keyOver => {
                    return keyOver.return === over.return &&
                        keyOver.params.reduce((acc, paramType, index) => acc && over.params[index] === paramType, true)
                })
                if (! existInKey) {
                    return false
                }
            }
            return true
        })
        // if no existing instance is found, create a new one
        if (! knownOverloads) {
            const newTypedFunction = new TypedFunction(overloads)
            this.#known.set(overloads, newTypedFunction)
            return newTypedFunction
        }
        return this.#known.get(knownOverloads)
    }
}

// helper functions to make the API more readable
export function type(...typeHints) {
    if (typeHints.length === 0) {
        typeHints = [null]
    } else if (typeHints.length !== 1) {
        return OneOf.getFor(...typeHints)
    }
    return Type.getFor(typeHints[0])
}
export function oneOf(...typeHints) {
    return type(...typeHints)
}
export function arrayOf(...typeHints) {
    return ArrayOf.getFor(...typeHints)
}
export function tupleOf(...typesHints) {
    return TupleOf.getFor(...typesHints)
}
export function recordOf(shape) {
    return RecordOf.getFor(shape)
}
export function _null(typeHint) {
    return Nullable.getFor(typeHint)
}
export function func(...typeHints) {
    return TypedFunction.getFor(...typeHints)
}

// helper function to create a new Type constraint
export function newBaseType(validationFunction, name, initialValue) {
    return new Type(validationFunction, name, initialValue)
}

// an example of a custom type constraint
export const int = newBaseType(val => typeof val === "number" && Math.round(val) === val, "int", 0)

/**
 * the actual decorator function
 * @param {unknown} typeHints
 * @return {(function(unknown, *): ({set(*): (*|undefined), init(*): (*|undefined)}|undefined))|*}
 */
export function typed(...typeHints) {
    return function (value, context) {
        if (context.kind === "accessor") {
            const ty = type(...typeHints)
            return {
                set(val) {
                    if (ty.isValid(val)) {
                        return value.set.call(this, ty.editValue(val))
                    } else {
                        console.error(`invalid value`, value, `of type ${typeof value}, expected ${ty.toString()}`)
                    }
                },
                init(val) {
                    if (val === undefined) {
                        return ty.initialize()
                    } else if (ty.isValid(val)) {
                        return val
                    }
                    throw new TypeError(`Cannot initialize ${this}[${context.name}] to ${val}, expected type ${ty.toString()} got ${typeof val}`)
                }
            }
        } else if (context.kind === "method") {
            const ty = func(...typeHints)
            return ty.editValue(value)
        } else {
            throw new SyntaxError(`kind "${context.kind}" is not supported by @typed decorator`)
        }
    }
}