const puppeteer = require("puppeteer-core")
const axios = require("axios")
const nodeConfig = require("./config")
const { createCursor } = require("ghost-cursor")
const { getConfig, setValue } = require("./controller")

process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0 // for sniffer

const delay = (ms) => {
    return new Promise((r) => setTimeout(() => r(), ms))
}

const isNull = (v) => typeof v === null || typeof v === undefined

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
        if (typeof params === "object" && Object.keys(params).length > 0) {
            Object.keys(params).forEach(function (key) {
                result[key] = params[key]
            })
        } else {
            if (Object.keys(params).length === 0) {
                params = params.toString()
            }
            result["message"] = params
        }
        console.log(result)
        return result
    }

    connectBrowser = async (port, wsEndpoint) => {
        const browser = puppeteer.connect({
            browserWSEndpoint: `ws://127.0.0.1:${port}${wsEndpoint}`,
            defaultViewport: null,
        })
        return browser
    }

    getProfile = (profileName) => {
        let cfg = getConfig()
        let profile
        if (!cfg.profiles || !cfg.profiles[profileName]) {
        } else {
            profile = cfg.profiles[profileName]
        }
        if (profile === null) throw `profile ${profileName} not found`
        return profile
    }

    getBrowserInfo = async (browserId) => {
        console.log("Получение браузера")
        let cfgRAM = getConfig(true)
        let key = parseInt(browserId)
        let browserInfo
        if (!cfgRAM.instances || !cfgRAM.instances[key]) {
            let cfg = getConfig()
            if (cfg.connections) {
                let port = browserId
                let wsEndpoint = cfg.connections[browserId]
                // console.log(port, wsEndpoint)
                browserInfo = await this.connectBrowser(port, wsEndpoint)
                // console.log(browserInfo)
            }
        } else {
            browserInfo = cfgRAM.instances[key]
        }

        if (browserInfo === null) throw `browser id ${browserId} not found`
        return browserInfo
    }

    getProfiles = async (authToken) => {
        try {
            console.log("Получение профилей")

            this.authToken = authToken || getConfig().TOKEN
            let data

            let profiles = getConfig().profiles

            if (!authToken) {
                data = Object.entries(profiles).map((entry) => {
                    return { name: entry[0], id: entry[1] }
                })
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
            }

            if (data.length > 0) {
                data.forEach(function (obj) {
                    setValue("profiles", { ...profiles, [obj.name]: obj.id })
                })
                profiles = getConfig().profiles
                return this.compileResult(true, {
                    profiles: Object.keys(profiles),
                })
            }
            throw "profiles not found"
        } catch (err) {
            return this.compileResult(false, err.stack || err)
        }
    }

    runBrowser = async (profileName) => {
        try {
            console.log("Запуск браузера")

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
            const browser = await this.connectBrowser(port, wsEndpoint)

            console.log(browser)

            setValue("connections", {
                ...getConfig().browsers,
                [port]: wsEndpoint,
            })

            let pages = await browser.pages()
            await browser.newPage()
            for (const page of pages) await page.close()

            let instanse = {}
            instanse["browser"] = browser
            setValue(
                "instances",
                { ...getConfig().instances, [port]: instanse },
                true
            )

            return this.compileResult(true, { browserId: port })
        } catch (err) {
            return this.compileResult(false, err || err.stack)
        }
    }

    closeBrowser = async (browserId) => {
        try {
            console.log("Закрытие браузера")
            let browserInfo = await this.getBrowserInfo(browserId)
            await browserInfo["browser"].close()
            return this.compileResult(true, "OK")
        } catch (err) {
            let res = this.compileResult(false, err || err.stack)
            return res
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
        let browser = await this.getBrowserInfo(browserId)
        let pages = await browser.pages()
        let page = Array.from(pages).at(parseInt(pageId))
        if (page == null) {
            throw `Страницы с индексом ${pageId} не существует`
        }
        return page
    }

    openPage = async (browserId, url, waitLoad) => {
        try {
            let browserInfo = await this.getBrowserInfo(browserId)

            let opts = null
            if (waitLoad == "1") {
                opts = { waitUntil: "load" }
            }

            console.log(browserInfo["browser"])

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

            setValue(
                "cursors",
                { ...getConfig(true).cursors, [pageId]: createCursor(page) },
                true
            )

            return this.compileResult(true, {
                pageId: pageId,
            })
        } catch (err) {
            return this.compileResult(false, err || err.stack)
        }
    }

    closePage = async (browserId, pageId) => {
        try {
            console.log("Закрытие страницы")
            let browserInfo = await this.getBrowserInfo(browserId)
            let page = await this._getPageById(browserId, pageId)
            page.close()
            return this.compileResult(true, "OK")
        } catch (err) {
            return this.compileResult(false, err || err.stack)
        }
    }

    waitLoad = async (browserId, pageId, maxTimeout = 60000) => {
        try {
            console.log("Ожидание полной загрузки страницы")
            let page = await this._getPageById(browserId, pageId)

            await page.waitForNavigation({ timeout: maxTimeout })

            return this.compileResult(true, "OK")
        } catch (err) {
            return this.compileResult(false, err || err.stack)
        }
    }

    getPages = async (browserId) => {
        try {
            console.log("Получение страниц")
            let browserInfo = await this.getBrowserInfo(browserId)
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

    searchMatch = (page, selector) => {
        return page.evaluate((selector) => {
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

    getSelector = async (page, pageId, selector, selectorType) => {
        // console.log('Получение селектора')
        // let page = await this._getPageById(browserId, pageId)
        if (typeof selectorType === "string") {
            selectorType = selectorType.toLowerCase()
        } else {
            selectorType = "css"
        }
        let sel
        if (selectorType === "css" || selectorType === "xpath") {
            // return this.compileResult(true, { selector: selector })
            console.log("Поиск селектора css или xpath")
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
        } else {
            sel = selector
        }
        // console.log('Селектор', sel)
        return sel
    }

    isElementExists = async (browserId, pageId, selector, selectorType) => {
        try {
            // let browserInfo = this.getBrowserInfo(browserId)
            let page = await this._getPageById(browserId, pageId)
            // const elements = await page.$x(selector)
            // console.log("Проверка существования элемента")
            const element = await this.getSelector(
                page,
                pageId,
                selector,
                selectorType
            )

            // console.log("Элемент", element)

            return this.compileResult(true, { isExists: !!element })
        } catch (err) {
            return this.compileResult(false, err || err.stack)
        }
    }

    //MouseButtons = (left, right, middle, back)
    pageClick = async (
        browserId,
        pageId,
        selector,
        selectorType,
        mouseButton = "left",
        clickCount = 1,
        delay = 100
    ) => {
        try {
            let page = await this._getPageById(browserId, pageId)
            let sel = await this.getSelector(
                page,
                pageId,
                selector,
                selectorType
            )
            let opt = {
                delay: parseInt(delay),
                button: mouseButton,
                clickCount: parseInt(clickCount),
            }

            if (typeof sel === "string") {
                await page.click(sel, opt)
            } else {
                await sel.click(opt)
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
            console.log("Двинуть мышь и кликнуть на элемент")
            let page = await this._getPageById(browserId, pageId)
            // let sel = await this.getSelector(
            //     page,
            //     pageId,
            //     selector,
            //     selectorType
            // )
            // return this.compileResult(true, { sel: sel })

            if (typeof selectorType === "string") {
                selectorType = selectorType.toLowerCase()
            } else {
                selectorType = "css"
            }
            let sel
            // if (selectorType === "css" || selectorType === "xpath") {
            //     // return this.compileResult(true, { selector: selector })
            //     sel = await page.$x(selector)
            //     return this.compileResult(true, "STOP")
            //     if (sel.length === 0) {
            //         throw `Элемента с селектором ${selector} на странице с индексом ${pageId} не существует`
            //     }
            //     sel = sel[0]
            // } else if (selectorType === "match" || selectorType === "text") {
            //     sel = await this.searchMatch(page, selector)
            // } else {
            //     sel = selector
            // }
            if (selectorType === "match" || selectorType === "text") {
                sel = await this.searchMatch(page, selector)
            } else {
                sel = selector
            }
            console.log("Селектор", sel)

            // console.log(sel)
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

            let clickOpt = {
                delay: parseInt(delay),
                button: mouseButton,
                clickCount: parseInt(clickCount),
            }

            if (typeof sel === "string") {
                await page.click(sel, clickOpt)
            } else {
                await sel.click(clickOpt)
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
            let sel = await this.getSelector(
                page,
                pageId,
                selector,
                selectorType
            )

            let textData = text
            let pressKeys = []
            let inputParams = text.split("|")
            if (inputParams.length > 1) {
                textData = inputParams[0]
                pressKeys = inputParams[1].split(",")
            }
            let opt = { delay }
            if (typeof sel === "string") {
                await page.click(selector, opt)
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
            let page = await this._getPageById(browserId, pageId)
            let evalResult = await this._waitEval(page, code) // 'let page = ' + page + '; ' +
            return this.compileResult(true, { evalResult: evalResult })
        } catch (err) {
            return this.compileResult(false, err || err.stack)
        }
    }
})()
