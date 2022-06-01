class mTypeError extends Error {
    constructor(message) {
        super(message);
    }
}

class Type {
    // static #null = new Type(() => false, "null")
    static #null = new Type(() => {throw new TypeError("can't set value on a type null")}, "null", null)
    static get null() { return Type.#null }

    static #undefined = new Type(() => true, "undefined", undefined)
    static get undefined() { return Type.#undefined }

    static #known = new Map<any, Type>([
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

    #validationFunction: (any) => boolean
    #name
    #minimalValue

    constructor(validationFunction: (any) => boolean = () => false, name = "", minimalValue = undefined) {
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

    static getFor(typeHint = null) {
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
        } else {
            return Primitive.getFor(typeHint)
        }
    }
}

class Primitive extends Type {
    #value

    constructor(value) {
        super()
        console.log("primitive", value)
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
        return new Primitive(value)
    }
}

class OneOf extends Type {
    #subTypes = []
    #possibleTypes = []

    constructor(...types) {
        super()
        this.#subTypes = [...(new Set(types.map(t => t instanceof OneOf ? t.#subTypes : type(t)).flat()))]
        this.#possibleTypes = [...this.#subTypes]
    }

    isValid(value) {
        return this.#subTypes.find(t => t.isValid(value))
    }

    isValidAt(index, value) {
        return this.#possibleTypes.find(t => t.isValidAt(index, value))
    }

    subtypeAt(index) {
        return this.#possibleTypes[0].subtypeAt(index)
    }

    initialize() {
        throw new TypeError("Initialisation value for oneOf is not implemented");
    }

    editValue(value) {
        console.log("edit value to", value)
        if (typeof value !== "object") {
            return value
        }
        this.#possibleTypes = this.#subTypes.filter(t => t.isValid(value))

        const that = this
        const proxyHandler = {
            set(obj, prop, value) {
                let newObject
                if (Array.isArray(obj)) {
                    newObject = [...obj]
                    newObject[prop] = value
                } else {
                    newObject = {...obj, [prop]: value}
                }
                const compatibleTypes = that.#subTypes.filter(t => t.isValid(newObject))
                if (compatibleTypes.length === 0) {
                    console.error(`Can't set value of`, obj, `[${prop}] to`, value, `, incompatible with any of ${that.toString()}`)
                    return false
                }
                that.#possibleTypes = compatibleTypes
                const isSafe = ! that.#possibleTypes.some(t => {
                    const subt = t.subtypeAt(prop)
                    return subt instanceof ArrayOf ||
                        subt instanceof TupleOf ||
                        subt instanceof RecordOf
                })
                if (isSafe) {
                    obj[prop] = value
                    return true
                }
                console.error(`Ambiguous type for`, obj, `[${prop}], can be any of ${that.#possibleTypes.map(t => t.subtypeAt(prop).toString()).join(" | ")}, please be more specific`)
                return false
            }
        }
        return new Proxy(value, proxyHandler)
    }

    toString() {
        return `${this.#subTypes.map(t => t.toString()).join(" | ")} (reduced to ${this.#possibleTypes.map(t => t.toString()).join(" | ")})`
    }

    static getFor(...types) {
        return new OneOf(...types)
    }
}

class ArrayOf extends Type {
    #type = Type.null

    constructor(...types) {
        super()
        this.#type = type(...types)
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
        return new ArrayOf(...types)
    }
}

class TupleOf extends Type {
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
        return new TupleOf(...types)
    }
}

class RecordOf extends Type {
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
        return new RecordOf(shape)
    }
}

class Nullable extends Type {
    #type = Type.null
    #isNull = false

    constructor(subtype) {
        super()
        this.#type = type(subtype)
    }

    isValid(value) {
        return value === null || value === undefined || this.#type.isValid(value)
    }

    isValidAt(index, value) {
        return ! this.#isNull && this.#type.isValidAt(index, value)
    }

    subtypeAt(index) {
        return this.#isNull ? undefined : this.#type.subtypeAt(index);
    }

    editValue(value) {
        this.#isNull = value === undefined || value === null
        return value
    }

    initialize() {
        return null;
    }

    toString() {
        return `${this.#type.toString()}?`
    }

    static getFor(typeHint = null) {
        return new Nullable(typeHint)
    }
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


function typed(...typeHints: any) {
    const ty = type(...typeHints)

    return function (
        target: any,
        propertyKey: string,
        descriptor: PropertyDescriptor
    ) {
        const value = target[propertyKey]
        if (value === undefined) {
            target[propertyKey] = ty.initialize()
        } else if (! ty.isValid(value)) {
            throw new TypeError(`${value} is not valid for type ${ty.toString()}`)
        }

        if (descriptor !== undefined) {
            const oldSet = descriptor.set
            descriptor.set = function set(value) {
                if (ty.isValid(value)) {
                    return oldSet.call(this, ty.editValue(value))
                } else {
                    console.error(`invalid value`, value, `of type ${typeof value}, expected ${ty.toString()}`)
                }
            }
        }
    }
}

const stringOrNumber = type(String, Number)
const myType2 = type([Number, stringOrNumber])
console.log("myType : ", myType2.toString())

class A {
    static b
    @typed(Number)
    static set a(value: any) {
        this.b = value
    }
    static get a(): any {
        return this.b
    }

    static d
    @typed([Number, arrayOf(String), _null(Number)])
    static set c(value: any) {
        this.d = value
    }
    static get c(): any {
        return this.d
    }
}

console.log(A)
A.a = 42
A.c[1][2] = "42"
A.c[2] = "42"
console.log(A)

