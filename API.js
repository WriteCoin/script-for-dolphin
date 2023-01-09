const puppeteer = require("puppeteer-core")
const axios = require("axios")
const nodeConfig = require("./config")
const { createCursor } = require("ghost-cursor")
const { getConfig, setValue } = require("./controller")
const replaceAll = require("string.prototype.replaceall")

process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0 // for sniffer

const delay = (ms) => {
    return new Promise((r) => setTimeout(() => r(), ms))
}

let isNull = (v) => typeof v === "undefined" || v === null

let splitOutsideLimitChars = (str, splitter, limitChars) => {
    let entriesOutside = []
    let entriesInside = []
    let isEntryInside = false
    let currentLimitCharIndex
    for (let i = 0; i < str.length; i++) {
        let c = str[i]
        if (isEntryInside) {
            entriesInside[entriesInside.length - 1] += c
            let limitChar = limitChars[currentLimitCharIndex]
            limitChar = typeof limitChar === "string" ? limitChar : limitChar[1]
            isEntryInside = c !== limitChar
            if (!isEntryInside) {
                entriesOutside.push("")
            }
        } else {
            isEntryInside = limitChars.some((limitChar, limitCharIndex) => {
                limitChar =
                    typeof limitChar === "string" ? limitChar : limitChar[0]
                let isLimitChar = c === limitChar
                if (isLimitChar) {
                    currentLimitCharIndex = limitCharIndex
                }
                return isLimitChar
            })
            if (isEntryInside) {
                entriesInside.push("")
                entriesInside[entriesInside.length - 1] = c
                continue
            }
            if (isNull(entriesOutside[entriesOutside.length - 1])) {
                entriesOutside.push("")
            }
            entriesOutside[entriesOutside.length - 1] += c
        }
    }
    let resultEntries = []
    let isEntrySplitted = false
    entriesOutside.forEach((outsideEntry, outsideEntryIndex) => {
        let outsideSplit = outsideEntry.split(splitter)
        if (outsideEntry !== outsideSplit[0]) {
            outsideSplit.forEach((entry, i) => {
                if (entry !== '') {
                    if (!isEntrySplitted && i === 0) {
                        resultEntries[resultEntries.length - 1] += entry
                    } else {
                        resultEntries.push(entry)
                    }
                }
            })
            isEntrySplitted = true
        } else {
            if (isNull(resultEntries[resultEntries.length - 1])) {
                resultEntries.push('')
            }
            resultEntries[resultEntries.length - 1] += outsideEntry
            isEntrySplitted = false
        }
        if (entriesInside[outsideEntryIndex]) {
            resultEntries[resultEntries.length - 1] += entriesInside[outsideEntryIndex]
        }
    })
    return resultEntries
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

    searchMatch = async (ground, selector) => {
        let allElements = await ground.$$("*")
        let resultElements = []
        for (let i = 0; i < allElements.length; i++) {
            let el = allElements[i]
            let childElementCount = await ground.evaluateHandle(
                (el) => el.childElementCount,
                el
            )
            let tagName = await ground.evaluateHandle((el) => el.tagName, el)
            childElementCount = await childElementCount.jsonValue()
            tagName = await tagName.jsonValue()
            if (
                childElementCount === 0 &&
                tagName !== "STYLE" &&
                tagName !== "SCRIPT" &&
                tagName !== "META" &&
                tagName !== "LINK" &&
                tagName !== "NOSCRIPT" &&
                tagName !== "TITLE"
            ) {
                let markup = await ground.evaluateHandle(
                    (el) => el.outerHTML,
                    el
                )
                markup = await markup.jsonValue()
                let cond = markup.includes(selector)
                while (!cond) {
                    el = await ground.evaluateHandle(
                        (el) => el.parentElement,
                        el
                    )
                    markup = await ground.evaluateHandle(
                        (el) => el.outerHTML,
                        el
                    )
                    markup = await markup.jsonValue()
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
                    resultElements.push(el)
                }
            }
        }
        return resultElements
    }

    findBySelector = async (ground, selector, selectorType = "css") => {
        selectorType = selectorType.toLowerCase()
        console.log(
            "Поиск элементов по селектору",
            selector,
            "тип",
            selectorType
        )
        let sel
        if (selectorType === "css") {
            console.log("Поиск селектора css")
            sel = await ground.$$(selector)
            sel = sel.length === 0 ? null : sel
        } else if (selectorType === "xpath") {
            console.log("Поиск селектора по xpath")
            sel = await ground.$x(selector)
            sel = sel.length === 0 ? null : sel
        } else if (selectorType === "match" || selectorType === "text") {
            console.log("Поиск селектора по match")
            sel = await this.searchMatch(ground, selector)
        }
        return sel
    }

    parseBASSelector = (selector) => {
        let opts = selector.match(/\[[^\]\[]*\]/gm)

        let selectorForPosis = selector
        let selectors = []
        let func = (opt) => {
            let pos = selectorForPosis.indexOf(opt)
            let selectorWithOpt = selectorForPosis
            selectorForPosis =
                selectorForPosis.substr(0, pos) +
                selectorForPosis.substr(pos + opt.length)
            let sels = selectorForPosis.split('>FRAME>')
            let selsWithOpt = selectorWithOpt.split('>FRAME>')
            let sel = sels[0]
            if (pos <= sel.length) {
                sel = sel.substr(0, pos) + opt + sel.substr(pos + opt.length)
            } else {
                selectorForPosis = selsWithOpt.slice(1).join('>FRAME>')
                func(opt)
                return
            }
            selectors.push(sel)
        }
        opts.forEach(func)
        selectorForPosis.split('>FRAME>').slice(1).forEach(sel => {
            selectors.push(sel)
        })
        return selectors
    }

    findByBASSelector = async (ground, selector) => {
        console.log("Поиск элементов по селектору в BAS формате", selector)
    }

    isElementExists = async (browserId, pageId, selector, selectorType) => {
        try {
            console.log("Проверка существования элемента")

            let page = await this._getPageById(browserId, pageId)

            const element = await this.findBySelector(
                page,
                selector,
                selectorType
            )

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
        selectorType = "css",
        mouseButton = "left",
        clickCount = 1,
        delay = 100
    ) => {
        try {
            console.log("Клик по элементу")
            let page = await this._getPageById(browserId, pageId)
            let sel = await this.findBySelector(page, selector, selectorType)
            let el = sel[0]
            let opt = {
                delay: parseInt(delay),
                button: mouseButton,
                clickCount: parseInt(clickCount),
            }

            if (!el) {
                throw `Элемент с селектором ${selector} на странице ${pageId} браузера ${browserId} не существует.`
            }

            await el.click(opt)

            return this.compileResult(true, "OK")
        } catch (err) {
            return this.compileResult(false, err || err.stack)
        }
    }

    pageMoveAndClick = async (
        browserId,
        pageId,
        selector,
        selectorType = "css",
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

            let sel = await this.findBySelector(page, selector, selectorType)

            let el = sel[0]

            if (!el) {
                throw `Элемент с селектором ${selector} на странице ${pageId} браузера ${browserId} не существует.`
            }

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
            if (moveSpeed !== 0 && moveSpeed) {
                moveOpt.moveSpeed = moveSpeed
            }

            await cursor.move(selector, moveOpt)

            let clickOpt = {
                delay: parseInt(delay),
                button: mouseButton,
                clickCount: parseInt(clickCount),
            }

            await el.click(clickOpt)

            return this.compileResult(true, "OK")
        } catch (err) {
            return this.compileResult(false, { error: err || stack })
        }
    }

    pageInputText = async (
        browserId,
        pageId,
        selector,
        text,
        selectorType = "css",
        delay = 100
    ) => {
        try {
            console.log("Ввод текста в элемент")
            let page = await this._getPageById(browserId, pageId)
            let sel = await this.findBySelector(page, selector, selectorType)

            let el = sel[0]

            if (!el) {
                throw `Элемент с селектором ${selector} на странице ${pageId} браузера ${browserId} не существует.`
            }

            let textData = text
            let pressKeys = []
            let inputParams = text.split("|")
            if (inputParams.length > 1) {
                textData = inputParams[0]
                pressKeys = inputParams[1].split(",")
            }
            let opt = { delay }

            await el.click(opt)

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

    test = async (browserId, pageId) => {
        try {
            console.log("Тест")
            let page = await this._getPageById(browserId, pageId)

            // let sel = ">CSS>#google_ads_iframe_1[ >FRAME>]>FRAME>>CSS>a[abc]"
            let sel = ">CSS>#google_ads_iframe_1[ >FRAME>]>FRAME>>CSS>a[abc]>FRAME>p"

            this.parseBASSelector(sel)

            return this.compileResult(true, "OK")
        } catch (err) {
            return this.compileResult(false, err || err.stack)
        }
    }
})()
