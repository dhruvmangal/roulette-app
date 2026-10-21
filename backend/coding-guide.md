# Coding guide
This doc is a guide for writing consistent and aesthetically pleasing Node.js code. It is inspired by what is popular within the community, and also features some personal opinions.


## Naming conventions
- Use `PascalCase` for types, classes, constants and enum values.
- Use `camelCase` for variables, properties, functions, socket channel names and socket rooms
- Use `CAPITAL_SNAKE_CASE` for constants
- Use `small-kebab-case` for route and socket namespace
- If it is default export than make sure the file name and export should match with each other
  ```
  demo.controller.js -> DemoController
  demo.service.js -> DemoService
  demo.middleware.js -> DemoMiddleware
  ```
- Use `/forward-slash` as prefix in namespace and channel names
- Use `/camelCase` for socket channel and room names and attach namespace name as prefix like this and for one to one append unique id after `:`
  ```javascript
   const DEMO = '/demo';
   const DEMO_CHANNEL_HELLO = DEMO + '/hello';
   const DEMO_CHANNEL_HELLO_WORLD = DEMO + '/hello-world';
   const DEMO_CHANNEL_HELLO_USER_ROOM = DEMO + '/hello:1';
  ```
- In JSON Schema use `/forward-slash` as prefix for id of the schema

## File Naming conventions
- Use `.config.js` as suffix in files under configs folder
- Use `.controller.js` as suffix in files under controllers folder
- Use `.model.js` as suffix in files under models folder
- Use `.migration.js` as suffix in files under migrations folder
- Use `.seeder.js` as suffix in files under seeders folder
- Use `.middleware.js` as suffix in files under middlewares folder
- Use `.routes.js` as suffix in files under routes folder
- Use `.service.js` as suffix in files under services folder
- Use `.schema.js` as suffix in files under schemas folder
- Use `.helpers.js` as suffix in files under helpers folder
- Use `.emitter.js` as suffix in files under emitters folder
- Use `.namespace.js` as suffix in files under namespaces folder
- Use `.handler.js` as suffix in files under handlers folder
- Use `.utils.js` as suffix in files under utils folder
- Use `.error.js` as suffix in files under errors folder
- Use `.template.js` as suffix in files under templates folder
- Use `.parent-folder-name.js` in file name
    ```
    demo.controller.js || demo.middleware.js || demo.routes.js
    ```

### Database Naming Convention
- Use `smallcase` for column names.
- Use `_` to separate column name
- Model name will be singular.


## Ordering
- Withing a file import should come first
- Within a class, these priorities should be respected:
  * Properties comes before functions
  * Static symbols comes before instance symbols
  * Public symbols comes before private symbols

## Coding rules
- Use single quotes `'` for strings
- Always use strict equality checks: `===` and `!==` instead of `==` or `!=` to avoid comparison pitfalls (see
  [JavaScript equality table](https://dorey.github.io/JavaScript-Equality-Table/)).
  The only accepted usage for `==` is when you want to check a value against `null` or `undefined`.
- Use `[]` instead of `Array` constructor
- Use `{}` instead of `Object` constructor
- Do not export variables/functions unless you need to share it across multiple components
- Use arrow functions over anonymous function expressions
- Only surround arrow function parameters when necessary.
  For example, `(x) => x + x` is wrong but the following are correct:
  * `x => x + x`
  * `(x, y) => x + y`
  * `<T>(x: T, y: T) => x === y`


## Formatting
- Use 2 spaces for indenting your code and swear an oath to never mix tabs and spaces — a special kind of hell awaits otherwise.
- Use UNIX-style newlines (\n), and a newline character as the last character of a file. Windows-style newlines (\r\n) are forbidden inside any repository.
- Just like you brush your teeth after every meal, you clean up any trailing white space in your .js files before committing. Otherwise the rotten smell of careless neglect will eventually drive away contributors and/or co-workers.
- Limit your lines to 80 characters. Yes, screens have gotten much bigger over the last few years, but your brain has not. Use the additional room for split screen, your editor supports that, right?
- Use single quotes, unless you are writing JSON. This helps you separate your objects’ strings from normal strings.

## Comments
- Use slashes for both single line and multi line comments. Try to write comments that explain higher level mechanisms or clarify difficult segments of your code. Don’t use comments to restate trivial things.


## Enforcement
- Coding rules are enforced in this project via [Standardjs](https://standardjs.com).
- Commit rules are enforced in this project via [husky](https://github.com/typicode/husky)
