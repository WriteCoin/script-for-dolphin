// const API = require("../anty")
// const API = require("./API")
let API = require('./API_playwright')
let express = require("express")
let app = express()
let { PORT } = require("../config/config")

app.listen(PORT, () => {
    console.log("node server launched")
})

process.on("uncaughtException", function (err) {
    console.error(err)
})

app.get("/getProfiles", async (req, res) => {
    let profiles = await API.getProfiles(req.query.authToken)
    res.send(profiles)
})

app.get("/runBrowser", async (req, res) => {
    let browser_id = await API.runBrowser(req.query.profileName)
    res.send(browser_id)
})

app.get("/closeBrowser", async (req, res) => {
    let result = await API.closeBrowser(req.query.browserId)
    res.send(result)
})

app.get("/waitLoad", async (req, res) => {
    let result = await API.waitLoad(
        req.query.browserId,
        req.query.pageId,
        req.query.maxTimeout
    )
    res.send(result)
})

app.get("/openPage", async (req, res) => {
    let result = await API.openPage(
        req.query.browserId,
        req.query.url,
        req.query.waitLoad
    )
    res.send(result)
})

app.get("/closePage", async (req, res) => {
    let result = await API.closePage(req.query.browserId, req.query.pageId)
    res.send(result)
})

app.get("/getPages", async (req, res) => {
    let result = await API.getPages(req.query.browserId)
    res.send(result)
})

app.get("/pageClick", async (req, res) => {
    let result = await API.pageClick(
        req.query.browserId,
        req.query.pageId,
        req.query.selector,
        req.query.selectorType,
        req.query.mouseButton,
        req.query.clickCount,
        req.query.delay
    )
    res.send(result)
})

app.get("/pageInputText", async (req, res) => {
    let result = await API.pageInputText(
        req.query.browserId,
        req.query.pageId,
        req.query.selector,
        req.query.selectorType,
        req.query.text,
        req.query.delay
    )
    res.send(result)
})

app.get("/pageEmulateIdleState", async (req, res) => {
    let result = await API.pageEmulateIdleState(
        req.query.browserId,
        req.query.pageId,
        req.query.time,
        req.query.isUserActive,
        req.query.isScreenUnlocked
    )
    res.send(result)
})

app.get("/isElementExists", async (req, res) => {
    let result = await API.isElementExists(
        req.query.browserId,
        req.query.pageId,
        req.query.selector,
        req.query.selectorType
    )
    res.send(result)
})

app.get("/pageMoveAndClick", async (req, res) => {
    console.log("Запрос двинуть мышь и кликнуть на элемент")
    let result = await API.pageMoveAndClick(
        req.query.browserId,
        req.query.pageId,
        req.query.selector,
        req.query.selectorType,
        req.query.waitForSelector,
        req.query.moveDelay,
        req.query.maxTries,
        req.query.moveSpeed,
        req.query.mouseButton,
        req.query.clickCount,
        req.query.delay
    )
    res.send(result)
})

const waitEval = async (ev) => {
    return eval(ev)
}

app.get("/testEval", async (req, res) => {
    //var data = await _eval('(async () => { await API.runBrowser("10") })()', true)
    var data = await (async (o) =>
        await eval('(async () => { return await o.runBrowser("10") })()')).call(
        null,
        API
    )

    res.send(data)
})

app.get("/pageEvalCode", async (req, res) => {
    let result = await API.pageEvalCode(
        req.query.browserId,
        req.query.pageId,
        Buffer.from(req.query.code, "base64").toString()
    )
    res.send(result)
})

app.get('/test', async (req, res) => {
    let result = await API.test(req.query.browserId, req.query.pageId)
    res.send(result)
})
