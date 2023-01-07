const puppeteer = require("puppeteer-core")
const axios = require("axios")
var _eval = require("eval")
const { TOKEN, PROFILES } = require("./config")
const { createCursor } = require("ghost-cursor")

process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0 // for sniffer

const delay = (ms) => {
    return new Promise((r) => setTimeout(() => r(), ms))
}

module.exports = new (class API {
    constructor() {
        this.profiles = new Map()
        this.instanses = new Map()
        this.cursors = new Map()
        this.authToken
    }

    _sleep = (ms) => new Promise((r) => setTimeout(r, ms))

    compileResult(success, params) {
        let result = {}
        if (success != null) result["success"] = success
        if (typeof params === "object") {
            Object.keys(params).forEach(function (key) {
                result[key] = params[key]
            })
        } else {
            result["message"] = params
        }
        return result
    }

    getProfile = (profileName) => {
        let profile = this.profiles.get(profileName)
        if (profile == null) throw `profile ${profileName} not found`
        return profile
    }

    getBrowserInfo = (browserId) => {
        let browserInfo = this.instanses.get(parseInt(browserId))
        if (browserInfo == null) throw `browser id ${browserId} not found`
        return browserInfo
    }

    getProfiles = async (authToken) => {
        try {
            this.authToken = authToken || TOKEN
            let data

            if (!authToken) {
                data = PROFILES
            } else {
                const options = {
                    url: "https://anty-api.com/browser_profiles",
                    headers: {
                        Authorization: `Bearer ${authToken}`,
                    },
                    validateStatus: function (status) {
                        return true
                    },
                }
                const response = await axios(options)

                if (response.status == 401) throw "Auth token is invalid"
                else if (response.status != 200)
                    throw "error connect to anty-api.com"

                data = response.data.data

                console.log(data)
            }

            if (data.length > 0) {
                this.profiles.clear()
                let self = this
                data.forEach(function (obj) {
                    self.profiles.set(obj.name, obj.id)
                })
                return this.compileResult(true, {
                    profiles: Array.from(this.profiles.keys()),
                })
            }
            throw "profiles not found"
        } catch (err) {
            return this.compileResult(false, err.stack || err)
        }
    }

    runBrowser = async (profileName) => {
        try {
            let profileId = this.getProfile(profileName)

            const response = await axios(
                `http://localhost:3001/v1.0/browser_profiles/${profileId}/start?automation=1`,
                {
                    validateStatus: function (status) {
                        return true
                    },
                }
            )
            let data = response.data

            if (data.errorObject != null) {
                throw data.errorObject.text
            }

            let port = data.automation.port,
                wsEndpoint = data.automation.wsEndpoint
            const browser = await puppeteer.connect({
                browserWSEndpoint: `ws://127.0.0.1:${port}${wsEndpoint}`,
                defaultViewport: null,
            })

            let pages = await browser.pages()
            await browser.newPage()
            for (const page of pages) await page.close()

            let instanse = {}
            instanse["browser"] = browser
            this.instanses.set(port, instanse)

            return this.compileResult(true, { browserId: port })
        } catch (err) {
            return this.compileResult(false, err || err.stack)
        }
    }

    closeBrowser = async (browserId) => {
        try {
            let browserInfo = this.getBrowserInfo(browserId)
            await browserInfo["browser"].close()
            return this.compileResult(true, "OK")
        } catch (err) {
            return this.compileResult(false, err || err.stack)
        }
    }

    _getPageForUrl = async (browser, url) => {
        let pages = await browser.pages()
        for (const page of pages) {
            if (page.url() == url) return page
        }
        return null
    }

    _getPageById = async (browserId, pageId) => {
        let browserInfo = this.getBrowserInfo(browserId)
        let pages = await browserInfo["browser"].pages()
        let page = Array.from(pages).at(parseInt(pageId))
        if (page == null) {
            throw `Страницы с индексом ${pageId} не существует`
        }
        return page
    }

    openPage = async (browserId, url, waitLoad) => {
        try {
            let browserInfo = this.getBrowserInfo(browserId)

            let opts = null
            if (waitLoad == "1") {
                opts = { waitUntil: "load" }
            }

            let page = await this._getPageForUrl(
                browserInfo["browser"],
                "about:blank"
            )
            if (page == null) page = await browserInfo["browser"].newPage()

            try {
                await page.goto(url, opts)
            } catch (err) {
                await page.close()
                throw err
            }

            const pageId =
                Array.from(await browserInfo["browser"].pages()).length - 1

            if (!this.cursors.has(pageId)) {
                this.cursors.set(pageId, createCursor(page))
            }

            return this.compileResult(true, {
                pageId: pageId,
            })
        } catch (err) {
            return this.compileResult(false, err || err.stack)
        }
    }

    closePage = async (browserId, pageId) => {
        try {
            let browserInfo = this.getBrowserInfo(browserId)
            let page = await this._getPageById(browserId, pageId)
            page.close()
            return this.compileResult(true, "OK")
        } catch (err) {
            return this.compileResult(false, err || err.stack)
        }
    }

    waitLoad = async (browserId, pageId, maxTimeout = 60000) => {
        try {
            let page = await this._getPageById(browserId, pageId)

            await page.waitForNavigation({ timeout: maxTimeout })

            return this.compileResult(true, "OK")
        } catch (err) {
            return this.compileResult(false, err || err.stack)
        }
    }

    getPages = async (browserId) => {
        try {
            let browserInfo = this.getBrowserInfo(browserId)
            let openPages = []
            let pages = await browserInfo["browser"].pages()
            for (var i = 0; i < pages.length; i++) {
                openPages.push({ id: i, "url:": pages[i].url() })
            }
            return openPages
        } catch (err) {
            return this.compileResult(false, err || err.stack)
        }
    }

    isElementExists = async (browserId, pageId, selector, selectorType) => {
        try {
            // let browserInfo = this.getBrowserInfo(browserId)
            let page = await this._getPageById(browserId, pageId)

            if (typeof selectorType === "string") {
                selectorType = selectorType.toLowerCase()
            } else {
                selectorType = "css"
            }
            let sel
            if (selectorType === "css" || selectorType === "xpath") {
                // return this.compileResult(true, { selector: selector })
                sel = await page.$x(selector)
                // if (sel.length === 0) {
                //     throw `Элемента с селектором ${selector} на странице с индексом ${pageId} не существует`
                // }
                sel = sel[0]
                // sel = await page.evaluate((selector) => {
                //     return document.querySelector(selector)
                // }, selector)
            } else if (selectorType === "match" || selectorType === "text") {
                sel = await page.evaluate((selector) => {
                    // console.log(selector)
                    let allElements = document.querySelectorAll("*")
                    let filteredElements = []
                    let resultElement
                    for (let i = 0; i < allElements.length; i++) {
                        let el = allElements[i]
                        if (
                            el.childElementCount === 0 &&
                            el.tagName !== "STYLE" &&
                            el.tagName !== "SCRIPT" &&
                            el.tagName !== "META" &&
                            el.tagName !== "LINK" &&
                            el.tagName !== "NOSCRIPT" &&
                            el.tagName !== "TITLE"
                        ) {
                            filteredElements.push(el)
                        }
                    }
                    for (let i = 0; i < filteredElements.length; i++) {
                        let el = filteredElements[i]
                        let markup = new XMLSerializer().serializeToString(el)
                        let cond = markup.includes(selector)
                        while (!cond) {
                            el = el.parentElement
                            markup = new XMLSerializer().serializeToString(el)
                            cond = markup.includes(selector)
                            if (
                                el.tagName === "BODY" ||
                                el.tagName === "HEAD" ||
                                el.tagName === "DIV" ||
                                el.tagName === "UL"
                            ) {
                                cond = false
                                break
                            }
                        }
                        if (cond) {
                            resultElement = el
                            break
                        }
                    }
                    return resultElement
                }, selector)
            }

            // const elements = await page.$x(selector)

            return this.compileResult(true, { isExists: !!sel })
        } catch (err) {
            return this.compileResult(false, err || err.stack)
        }
    }

    //MouseButtons = (left, right, middle, back)
    pageClick = async (
        browserId,
        pageId,
        selector,
        selectorType = "css",
        mouseButton = "left",
        clickCount = 1,
        delay = 100
    ) => {
        try {
            let page = await this._getPageById(browserId, pageId)
            if (typeof selectorType === "string") {
                selectorType = selectorType.toLowerCase()
            } else {
                selectorType = "css"
            }
            let sel
            if (selectorType === "css" || selectorType === "xpath") {
                // return this.compileResult(true, { selector: selector })
                sel = await page.$x(selector)
                if (sel.length === 0) {
                    throw `Элемента с селектором ${selector} на странице с индексом ${pageId} не существует`
                }
                sel = sel[0]
            } else if (selectorType === "match" || selectorType === "text") {
                sel = await page.evaluate((selector) => {
                    // console.log(selector)
                    let allElements = document.querySelectorAll("*")
                    let filteredElements = []
                    let resultElement
                    for (let i = 0; i < allElements.length; i++) {
                        let el = allElements[i]
                        if (
                            el.childElementCount === 0 &&
                            el.tagName !== "STYLE" &&
                            el.tagName !== "SCRIPT" &&
                            el.tagName !== "META" &&
                            el.tagName !== "LINK" &&
                            el.tagName !== "NOSCRIPT" &&
                            el.tagName !== "TITLE"
                        ) {
                            filteredElements.push(el)
                        }
                    }
                    for (let i = 0; i < filteredElements.length; i++) {
                        let el = filteredElements[i]
                        let markup = new XMLSerializer().serializeToString(el)
                        let cond = markup.includes(selector)
                        while (!cond) {
                            el = el.parentElement
                            markup = new XMLSerializer().serializeToString(el)
                            cond = markup.includes(selector)
                            if (
                                el.tagName === "BODY" ||
                                el.tagName === "HEAD" ||
                                el.tagName === "DIV" ||
                                el.tagName === "UL"
                            ) {
                                cond = false
                                break
                            }
                        }
                        if (cond) {
                            resultElement = el
                            break
                        }
                    }
                    return resultElement
                }, selector)
            }
            console.log(sel)
            if (typeof sel === "string") {
                await page.click(sel, {
                    delay: parseInt(delay),
                    button: mouseButton,
                    clickCount: parseInt(clickCount),
                })
            } else {
                await sel.click({
                    delay: parseInt(delay),
                    button: mouseButton,
                    clickCount: parseInt(clickCount),
                })
            }
            return this.compileResult(true, "OK")
        } catch (err) {
            return this.compileResult(false, err || err.stack)
        }
    }

    pageMoveAndClick = async (
        browserId,
        pageId,
        selector,
        selectorType,
        waitForSelector = 30000,
        moveDelay = 2000,
        maxTries = 10,
        moveSpeed = undefined,
        mouseButton = "left",
        clickCount = 1,
        delay = 100
    ) => {
        try {
            let page = await this._getPageById(browserId, pageId)
            if (typeof selectorType === "string") {
                selectorType = selectorType.toLowerCase()
            } else {
                selectorType = "css"
            }
            let sel
            if (selectorType === "css" || selectorType === "xpath") {
                // return this.compileResult(true, { selector: selector })
                sel = await page.$x(selector)
                if (sel.length === 0) {
                    throw `Элемента с селектором ${selector} на странице с индексом ${pageId} не существует`
                }
                sel = sel[0]
            } else if (selectorType === "match" || selectorType === "text") {
                sel = await page.evaluate((selector) => {
                    // console.log(selector)
                    let allElements = document.querySelectorAll("*")
                    let filteredElements = []
                    let resultElement
                    for (let i = 0; i < allElements.length; i++) {
                        let el = allElements[i]
                        if (
                            el.childElementCount === 0 &&
                            el.tagName !== "STYLE" &&
                            el.tagName !== "SCRIPT" &&
                            el.tagName !== "META" &&
                            el.tagName !== "LINK" &&
                            el.tagName !== "NOSCRIPT" &&
                            el.tagName !== "TITLE"
                        ) {
                            filteredElements.push(el)
                        }
                    }
                    for (let i = 0; i < filteredElements.length; i++) {
                        let el = filteredElements[i]
                        let markup = new XMLSerializer().serializeToString(el)
                        let cond = markup.includes(selector)
                        while (!cond) {
                            el = el.parentElement
                            markup = new XMLSerializer().serializeToString(el)
                            cond = markup.includes(selector)
                            if (
                                el.tagName === "BODY" ||
                                el.tagName === "HEAD" ||
                                el.tagName === "DIV" ||
                                el.tagName === "UL"
                            ) {
                                cond = false
                                break
                            }
                        }
                        if (cond) {
                            resultElement = el
                            break
                        }
                    }
                    return resultElement
                }, selector)
            }

            // const cursor = this.cursors.get(pageId)
            const cursor = createCursor(page)

            const moveOpt = {}
            if (waitForSelector) {
                moveOpt.waitForSelector = waitForSelector
            }
            if (moveDelay) {
                moveOpt.moveDelay = moveDelay
            }
            if (maxTries) {
                moveOpt.maxTries = maxTries
            }
            if (moveSpeed !== 0 || moveSpeed) {
                moveOpt.moveSpeed = moveSpeed
            }

            // return this.compileResult(true, { cursor: cursor })

            // const csr = createCursor(page)
            // csr.move

            await cursor.move(selector, moveOpt)

            // let clickOpt = {
            //     delay: parseInt(delay),
            //     button: mouseButton,
            //     clickCount: parseInt(clickCount),
            // }

            // if (typeof sel === "string") {
            //     await page.click(sel, clickOpt)
            // } else {
            //     await sel.click(clickOpt)
            // }
            if (typeof sel === "string") {
                await page.click(sel, {
                    delay: parseInt(delay),
                    button: mouseButton,
                    clickCount: parseInt(clickCount),
                })
            } else {
                await sel.click({
                    delay: parseInt(delay),
                    button: mouseButton,
                    clickCount: parseInt(clickCount),
                })
            }
            return this.compileResult(true, "OK")
        } catch (err) {
            return this.compileResult(false, { error: err || stack })
        }
    }

    pageInputText = async (
        browserId,
        pageId,
        selector,
        selectorType,
        text,
        delay = 100
    ) => {
        try {
            let page = await this._getPageById(browserId, pageId)

            if (typeof selectorType === "string") {
                selectorType = selectorType.toLowerCase()
            } else {
                selectorType = "css"
            }
            let sel
            if (selectorType === "css" || selectorType === "xpath") {
                // return this.compileResult(true, { selector: selector })
                sel = await page.$x(selector)
                if (sel.length === 0) {
                    throw `Элемента с селектором ${selector} на странице с индексом ${pageId} не существует`
                }
                sel = sel[0]
            } else if (selectorType === "match" || selectorType === "text") {
                sel = await page.evaluate((selector) => {
                    // console.log(selector)
                    let allElements = document.querySelectorAll("*")
                    let filteredElements = []
                    let resultElement
                    for (let i = 0; i < allElements.length; i++) {
                        let el = allElements[i]
                        if (
                            el.childElementCount === 0 &&
                            el.tagName !== "STYLE" &&
                            el.tagName !== "SCRIPT" &&
                            el.tagName !== "META" &&
                            el.tagName !== "LINK" &&
                            el.tagName !== "NOSCRIPT" &&
                            el.tagName !== "TITLE"
                        ) {
                            filteredElements.push(el)
                        }
                    }
                    for (let i = 0; i < filteredElements.length; i++) {
                        let el = filteredElements[i]
                        let markup = new XMLSerializer().serializeToString(el)
                        let cond = markup.includes(selector)
                        while (!cond) {
                            el = el.parentElement
                            markup = new XMLSerializer().serializeToString(el)
                            cond = markup.includes(selector)
                            if (
                                el.tagName === "BODY" ||
                                el.tagName === "HEAD" ||
                                el.tagName === "DIV" ||
                                el.tagName === "UL"
                            ) {
                                cond = false
                                break
                            }
                        }
                        if (cond) {
                            resultElement = el
                            break
                        }
                    }
                    return resultElement
                }, selector)
            }

            let textData = text
            let pressKeys = []
            let inputParams = text.split("|")
            if (inputParams.length > 1) {
                textData = inputParams[0]
                pressKeys = inputParams[1].split(",")
            }
            let opt = { delay }
            if (typeof sel === "string") {
                await page.click(sel, opt)
            } else {
                await sel.click(opt)
            }

            if (textData.length > 0)
                await page.keyboard.type(textData, { delay: parseInt(delay) })

            for (const key of pressKeys) await page.keyboard.press(key)

            return this.compileResult(true, "OK")
        } catch (err) {
            return this.compileResult(false, err || err.stack)
        }
    }

    pageEmulateIdleState = async (
        browserId,
        pageId,
        time,
        isUserActive,
        isScreenUnlocked
    ) => {
        try {
            let page = await this._getPageById(browserId, pageId)

            let optObj = {
                isUserActive: isUserActive === "1" ? true : false,
                isScreenUnlocked: isScreenUnlocked === "1" ? true : false,
            }

            await page.emulateIdleState(optObj)

            await delay(time)

            await page.emulateIdleState()

            return this.compileResult(true, "OK")
        } catch (err) {
            return this.compileResult(false, err || err.stack)
        }
    }

    pageEmulateInactivity = async (browserId, pageId) => {
        try {
            let page = await this._getPageById(browserId, pageId)

            const cursor = createCursor(page)

            await cursor.moveTo({ x: 500, y: 500 })

            await delay(2000)

            await cursor.moveTo({ x: 100, y: 600 })

            await delay(2000)
        } catch (err) {
            return this.compileResult(false, err || err.stack)
        }
    }

    _waitEval = async (page, ctxScript) => {
        return await (async (page) =>
            await eval("(async () => { " + ctxScript + " })()")).call(
            null,
            page
        )
    }

    pageEvalCode = async (browserId, pageId, code) => {
        try {
            let browserInfo = this.getBrowserInfo(browserId)
            let page = await this._getPageById(browserId, pageId)
            let evalResult = await this._waitEval(page, code) // 'let page = ' + page + '; ' +
            return this.compileResult(true, { evalResult: evalResult })
        } catch (err) {
            return this.compileResult(false, err || err.stack)
        }
    }
})()
