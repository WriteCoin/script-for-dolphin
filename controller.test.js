let nodeConfig = require("./config")
const { getValue, isBAS, setValue } = require("./controller")

// console.log(typeof global.BAS_FUNCTION)

// console.log(getValue('PORT'))
console.log(isBAS)
// console.log(getValue('PROFILES', 0, 'id'))
// console.log(getValue("VAR"))

setValue(["VAR"], 30)

console.log(nodeConfig)
