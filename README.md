# Type decorators
Unless specified, in this document `typeHint` is either `null`, `undefined`, `Number`, `String`, `Object`, `Array`, an instance of `Type`, an object literal (`{}`) or an array literal (`[]`)

## how to use
(syntax will evolve as the decorator proposal evolve)
```js
class A {
	#a = 42
	@typed(Number)
	get a() { return this.#a }
    set a(val) { this.#a = val }
}
```
the `@typed` decorator can take one or multiple `typeHint` as parameter
```js
function typed(...typeHint) {/*...*/}
```
If some of the `typeHints` are not instances of `Type`, it will be transformed into one by calling the `type` function

## Type creation functions
### `type(...typeHints)`
If there is no type hint (`type()`) will return `Type.null`, \
if there are multiple type hints, call `oneOf` with the same arguments, \
if the hint is an object literal (`{}`), call `recordOf` with it, \
if the hint is an array literal (`[]`), call `tupleOf` with it, \
any other hint means only value of the same type will be accepted, \
e.g. String only accept strings; Number only accept numbers

------
#### comparison with Typescript
```js
// decorator
@typed(Number)
let a

// Typescript
let a: number
```

### `oneOf(...typeHints)`
Will accept any of the specified typeHints

------
#### comparison with Typescript
```js
// decorator
@typed(oneOf(Number, String))
// or
@typed(Number, String)
let a

// Typescript
let a: number | string
```

### `arrayOf(...typeHints)`
When there are multiple typeHints, is equivalent to `arrayOf(anyOf(...typeHints))`

------
#### comparison with Typescript
```js
// decorator
@typed(arrayOf(Number, String))
let a

// Typescript
let a: Array<number | string>
```

### `tupleOf(...typeHints)`
Will accept an array with the specified size and type at positions

------
#### comparison with Typescript
```js
// decorator
@typed(tupleOf(Number, Number, String))
// or
@typed([Number, Number, String])
let a

// Typescript
let a: [number, number, string]
```

### `recordOf(shape)`
Will accept an object with the same shape
(Unlike other function, this one only accept one argument)

------
#### comparison with Typescript
```js
// decorator
@typed(recordOf({a: Number, b: String}))
// or
@typed({a: Number, b: String})
let a

// Typescript
let a: {a: Number, b: String}
```

### `_null(...typeHints)`
Accept `null` and `undefined` in addition to specified type
When there are multiple typeHints, is equivalent to `_null(anyOf(...typeHints))`

------
#### comparison with Typescript
```js
// decorator
@typed(_null(Number))
let a

// Typescript
let a?: number
```

## Special types
### `Type.null`
Will throw when trying to change it's value

Same as `never` in typescript

### `Type.undefined`
Will accept any value

Same as `any` in typescript