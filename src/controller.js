let nodeConfig = require("../config/config")
const jsonConfig = require("config")
const fs = require("fs")

const isBAS =
    typeof BAS_FUNCTION !== "undefined" && typeof BAS_FUNCTION !== null

const jsonConfigPath = "config/default.json"

const getConfig = (isRAM = false) =>
    isBAS || isRAM
        ? nodeConfig
        : JSON.parse(fs.readFileSync(jsonConfigPath, "utf-8"))

const setConfig = (obj, isRAM = false) => {
    if (isBAS || isRAM) {
        nodeConfig = obj
    } else {
        fs.writeFileSync(jsonConfigPath, JSON.stringify(obj), "utf-8")
    }
}

const fromConfig = (key) => (isBAS ? nodeConfig[key] : jsonConfig.get(key))

const getValue = (...keys) => {
    let fisrtKey = keys[0]
    return keys.slice(1).reduce((res, key) => res[key], fromConfig(fisrtKey))
}

const setData = (obj, key) => {
    if (typeof key === "string") {
        obj[key] = {}
    } else if (typeof key === "number") {
        obj[key] = []
    }
    return obj
}

const setValue = (key, value, isRAM = false) => {
    // let firstKey = keys[0]
    // let lastKey = keys[keys.length - 1]
    // let obj = keys
    //     .slice(1, -1)
    //     .reduce((res, key) => setData(res, key), setData(getConfig(), firstKey))
    // obj[lastKey] = value
    let obj = getConfig(isRAM)
    obj[key] = value
    setConfig(obj, isRAM)
}

module.exports = {
    isBAS,
    getConfig,
    setConfig,
    fromConfig,
    getValue,
    setValue,
}
