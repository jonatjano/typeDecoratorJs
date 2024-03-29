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

class Type {
    static #null = new Type(() => {throw new TypeError("can't set value on a type null")}, "null", null)
    static get null() { return Type.#null }

    static #undefined = new Type(() => true, "undefined", undefined)
    static get undefined() { return Type.#undefined }

    static #boolean = new Type(value => value === true || value === false || value instanceof Boolean, "boolean", false)
    static get boolean() { return Type.#boolean }

    static #number = new Type(value => typeof value === "number" || value instanceof Number, "number", 0)
    static get number() { return Type.#number }

    static #string = new Type(value => typeof value === "string" || value instanceof String, "string", "")
    static get string() { return Type.#string }

    static #object = new Type(value => typeof value === "object" && !Array.isArray(value) && value !== null, "object", {})
    static get object() { return Type.#object }

    static #array = new Type(value => typeof value === "object" && Array.isArray(value), "array", [])
    static get array() { return Type.#array }

    static #symbol = new Type(value => typeof value === "symbol", "symbol", Symbol())
    static get symbol() { return Type.#symbol }

    static #function = new Type(value => typeof value === "function", "function", _=>_)
    static get function() { return Type.#function }

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
     * * => boolean
     */
    #validationFunction
    /**
     * @type {string}
     */
    #name
    #initialValue

    constructor(validationFunction = () => false, name = "", initialValue = undefined) {
        this.#validationFunction = validationFunction
        this.#name = name
        this.#initialValue = initialValue
    }

    isValid(value) {
        return this.#validationFunction(value)
    }

    isValidAt(index, value) {
        return false
    }

    subtypeAt(index) {
        return undefined
    }

    editValue(value) {
        return value
    }

    initialize() {
        return this.#initialValue
    }

    toString() {
        return this.#name
    }

    static getFor(typeHint) {
        if (typeHint instanceof Type) {
            return typeHint
        } else if (Type.#known.has(typeHint)) {
            return Type.#known.get(typeHint)
        } else if (typeof typeHint === "object") {
            if (Array.isArray(typeHint)) {
                return TupleOf.getFor(...typeHint)
            } else {
                if (typeHint.__proto__?.constructor === Object) {
                    return RecordOf.getFor(typeHint)
                } else {
                    return Instance.getFor(typeHint)
                }
            }
        } else if (typeof typeHint === "function") {
            this.#known.set(typeHint, new Type(value => value instanceof typeHint, typeHint.name))
            return this.#known.get(typeHint)
        } else {
            return Primitive.getFor(typeHint)
        }
    }
}

class Primitive extends Type {
    static #known = new Map()
    #value

    constructor(value) {
        super()
        this.#value = value
    }

    isValid(value) {
        return this.#value === value
    }

    initialize() {
        return this.#value;
    }

    toString() {
        if (typeof this.#value === "string") {
            return '"' + this.#value + '"'
        }
        return this.#value.toString()
    }

    static getFor(value) {
        if (! this.#known.has(value)) {
            this.#known.set(value, new Primitive(value))
        }
        return this.#known.get(value)
    }
}

class Instance extends Type {
    static #known = new WeakMap()
    #value

    constructor(value) {
        super()
        this.#value = value
    }

    isValid(value) {
        return this.#value === value
    }

    initialize() {
        return this.#value;
    }

    toString() {
        return this.#value.toString()
    }

    static getFor(value) {
        if (! this.#known.has(value)) {
            this.#known.set(value, new Instance(value))
        }
        return this.#known.get(value)
    }
}

class OneOf extends Type {
    static #known = new Map()
    #subTypes = []

    constructor(...types) {
        super()
        this.#subTypes = [...types]
    }

    isValid(value) {
        return this.#subTypes.find(t => t.isValid(value)) !== undefined
    }

    isValidAt(index, value) {
        return this.#subTypes.find(t => t.isValidAt(index, value)) !== undefined
    }

    subtypeAt(index) {
        return oneOf(...this.#subTypes.map(t => t.subtypeAt(index)))
    }

    initialize() {
        return this.#subTypes[0].initialize()
    }

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

    toString() {
        return this.#subTypes.map(t => t.toString()).join(" | ")
    }

    static getFor(...types) {
        types = new ComparableSet(types.map(t => t instanceof OneOf ? t.#subTypes : type(t)).flat())
        if (types.size === 1) {
            return Type.getFor([...types][0])
        }

        for (const [key, value] of this.#known.entries()) {
            if (types.equals(key)) {
                return value
            }
        }
        this.#known.set(types, new OneOf(...types))
        return this.#known.get(types)
    }
}

class ArrayOf extends Type {
    static #known = new Map()
    #type = Type.null

    constructor(type) {
        super()
        this.#type = type
    }

    isValid(value) {
        return Array.isArray(value) && value.every((v) => this.#type.isValid(v))
    }

    isValidAt(index, value) {
        return this.#type.isValid(value)
    }

    subtypeAt(index) {
        return this.#type;
    }

    editValue(value) {
        const that = this
        const proxyHandler = {
            set(obj, prop, value) {
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

class TupleOf extends Type {
    static #leaf = Symbol()
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

class RecordOf extends Type {
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

class Nullable extends Type {
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

class TypedFunction extends Type {
    static #known = new Map()
    #overloads

    constructor(overloads) {
        super()
        this.#overloads = overloads
    }


    isValid(value) {
        return typeof value === "function"
    }

    isValidAt(index, value) {
        if (index === "return") {
            return this.#overloads.some(overload => overload.return.isValid(value))
        }
        return this.#overloads.some(overload => overload.params[index]?.isValid(value))
    }

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

    initialize() {
        return _ => this.subtypeAt("return").initialize();
    }

    toString() {
        return this.#overloads.map(overload => `(${overload.params.map(param => param.toString()).join(", ")}) => ${overload.return.toString()}`).join(" | ")
    }

    static getKnown() {
        return this.#known
    }

    static getFor(...typeHints) {

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
        if (! knownOverloads) {
            const newTypedFunction = new TypedFunction(overloads)
            this.#known.set(overloads, newTypedFunction)
            return newTypedFunction
        }
        return this.#known.get(knownOverloads)
    }
}

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
export function newBaseType(validationFunction, name, initialValue) {
    return new Type(validationFunction, name, initialValue)
}

export const int = newBaseType(val => typeof val === "number" && Math.round(val) === val, "int", 0)

