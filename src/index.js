class TypeError extends Error {
    constructor(message) {
        super(message);
    }
}

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

    static #known = new Map([
        [null, Type.null],
        [undefined, Type.undefined],
        [Number, new Type(value => typeof value === "number", "number", 0)],
        [String, new Type(value => typeof value === "string", "string", "")],
        [
            Object,
            new Type(value => typeof value === "object" && !Array.isArray(value), "object", {})
        ],
        [
            Array,
            new Type(value => typeof value === "object" && Array.isArray(value), "array", [])
        ]
    ])

    /**
     * * => boolean
     */
    #validationFunction
    /**
     * @type {string}
     */
    #name
    #minimalValue

    constructor(validationFunction = () => false, name = "", minimalValue = undefined) {
        this.#validationFunction = validationFunction
        this.#name = name
        this.#minimalValue = minimalValue
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
        return this.#minimalValue
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
                return RecordOf.getFor(typeHint)
            }
        } else if (typeof typeHint === "function") {
            /*
            (class A).prototype !== undefined
            {}.prototype === undefined
            typeof (() => {}) === function
             */
            /*
            function test(val) {
                return {
                    "instanceof Function": val instanceof Function,
                    "prototype": val.prototype,
                    "val": val,
                    "arguments !== undefined": val.arguments !== undefined,
                    "prototype === undefined": val.prototype === undefined
                }
            }

            console.table({
                "class A {}": test(class A {}),
                "function() {}": test(function() {}),
                "() => {}": test(() => {}),
                "Number": test(Number)
            })
             */
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
        return this.#value
    }

    static getFor(value) {
        if (! this.#known.has(value)) {
            this.#known.set(value, new Primitive(value))
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
        return this.#subTypes.find(t => t.isValid(value))
    }

    isValidAt(index, value) {
        return this.#subTypes.find(t => t.isValidAt(index, value))
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
            .reduce((acc,key ) => {
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

    constructor(...typeHints) {
        super()

        this.#overloads = typeHints.reduce((acc, hint, index) => {
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
    }
    /*
    constructor(overloads) {
        super()
        this.#overloads = overloads
    }
     */

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
        return this.subtypeAt("return").initialize();
    }

    toString() {
        return this.#overloads.map(overload => `(${overload.params.map(param => param.toString()).join(", ")}) => ${overload.return.toString()}`).join(" | ")
    }

    static getKnown() {
        return this.#known
    }

    static getFor(...typeHints) {
        return new TypedFunction(...typeHints)
    }
/*
    TODO do
    static getFor(...typeHints) {
        const overloads = typeHints.reduce((acc, hint, index) => {
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

        for (const [key, value] of this.#known.entries()) {
            console.log(key, overloads, deepEqual(key, overloads))
            if (deepEqual(key, overloads)) {
                return value
            }
        }
        const newTypedFunction = new TypedFunction(overloads)
        this.#known.set(overloads, newTypedFunction)
        return newTypedFunction
    }
*/
}

function type(...typeHints) {
    if (typeHints.length === 0) {
        typeHints = [null]
    } else if (typeHints.length !== 1) {
        return OneOf.getFor(...typeHints)
    }
    return Type.getFor(typeHints[0])
}
function oneOf(...typeHints) {
    return type(...typeHints)
}
function arrayOf(...typeHints) {
    return ArrayOf.getFor(...typeHints)
}
function tupleOf(...typesHints) {
    return TupleOf.getFor(...typesHints)
}
function recordOf(shape) {
    return RecordOf.getFor(shape)
}
function _null(typeHint) {
    return Nullable.getFor(typeHint)
}
function func(...typeHints) {
    return TypedFunction.getFor(...typeHints)
}
/*
const myType = type({a: 42, b: _null(666)})
const obj = myType.editValue({})

obj.a = 42

console.log(myType.toString())
console.log(obj)

const arr = arrayOf({a: Number}).editValue([])
arr[0] = {a: 42}
arr[2] = {a: 42}
arr[3] = {a: 42}
arr[1] = {a: 42}
*/
/*
console.log(
    func({
        b: {
            c: {
                d: type(42)
            }
        },
        a: 1
    }, Number, _=> null) ===
    func({
        b: {
            c: {
                d: type(42)
            }
        },
        a: 1
    }, Number, _=> null),
    true
)
console.log(
    func(String, Number, _=> null, Number, String, _=> String) ===
    func(Number, String, _=> String, String, Number, _=> null), true
)
console.log(
    func(String, Number, _=> null) === func(Number, String, _=> String), false
)
console.log(TypedFunction.getKnown())
*/
/*
function myLog(string) {
    console.log(string, eval(string))
}

myLog('type(Number).isValid("12")')
myLog("type(Number).isValid(12)")
myLog("type(Number).isValid({})")

myLog('type(String).isValid("12")')
myLog("type(String).isValid(12)")
myLog("type(String).isValid({})")

myLog('type(String, Number).isValid("12")')
myLog("type(String, Number).isValid(12)")
myLog("type(String, Number).isValid({})")

myLog("type(arrayOf(Number)).isValid([12, 34])")
myLog("type(arrayOf(Number)).isValid([12, '34'])")
myLog("type(arrayOf(Number, String)).isValid([12, '34'])")
myLog("type(arrayOf(type(Number), type(String))).isValid([12, '34'])")
myLog("type(arrayOf(type(Number, String))).isValid([12, '34'])")

myLog("type() instanceof Type")
*/

/*
function typed(...typeHints) {
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

class A {
    @typed(Number)
    static accessor a = 42

    @typed([Number, arrayOf(String), _null(Number)])
    static accessor b

    @typed(
        Number, Number, _=> Number,
        String, String, _=> String
    )
    static add(a, b) {
        return a + b
    }

    @typed(Number, Number, _=> Number)
    static sub(a, b) {
        return this.add(a, -b)
    }
}

console.log(A.add("1", "2"))
console.log(A.sub(1, 2))
console.log(A.sub.call({add(a, b) {return 42}}, 1, 2))
// console.log(A)
// A.a = 42
// A.b[1][2] = "42"
// A.b[2] = "42"
// console.log(A.a, A.b)
*/
