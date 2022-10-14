import {assert, assertThrow} from "./testFramework.js";
import {type, tupleOf} from "../lib/Type.js";

console.log("\n\n\n\ntests\n\n\n\n")

// same instance for same type
assert(type(String) === type(String))
assert(type(Number) === type(Number))
assert(type(String) !== type(Number))

const stringType = type(String)
assert(stringType === type(String))
assert(type(stringType) === stringType)

assert(stringType.isValid("dz"))

stringType.editValue(42)
stringType.editValue("42")

assert(tupleOf(String, String, Number) === tupleOf(String, String, Number))
