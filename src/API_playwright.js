let { chromium } = require("playwright")
let { Locator } = require('playwright-core')
let axios = require("axios")
let nodeConfig = require("../config/config")
let { createCursor } = require("ghost-cursor")
let { getConfig, setValue } = require("./controller")
let replaceAll = require("string.prototype.replaceall")
let exec = require("child_process")

process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0 // for sniffer

let delay = (ms) => {
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
                if (entry !== "") {
                    if (!isEntrySplitted && i === 0) {
                        if (isNull(resultEntries[resultEntries.length - 1])) {
                            resultEntries.push("")
                        }
                        resultEntries[resultEntries.length - 1] += entry
                    } else {
                        resultEntries.push(entry)
                    }
                }
            })
            isEntrySplitted = true
        } else {
            if (isNull(resultEntries[resultEntries.length - 1])) {
                resultEntries.push("")
            }
            resultEntries[resultEntries.length - 1] += outsideEntry
            isEntrySplitted = false
        }
        if (entriesInside[outsideEntryIndex]) {
            resultEntries[resultEntries.length - 1] +=
                entriesInside[outsideEntryIndex]
        }
    })
    return resultEntries
}

class API {
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
        let browser = await chromium.connectOverCDP(
            `ws://127.0.0.1:${port}${wsEndpoint}`
        )
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
                console.log("Получение браузера через повторное подключение")
                // console.log("Порт", port, "wsEndpoint", wsEndpoint)
                let browser = await this.connectBrowser(port, wsEndpoint)
                // console.log(browserInfo)
                browserInfo = {}
                browserInfo["browser"] = browser
                setValue(
                    "instances",
                    { ...getConfig().instances, [port]: browserInfo },
                    true
                )
            }
        } else {
            console.log("Получение браузера из оперативной памяти сервера")
            browserInfo = cfgRAM.instances[key]
            // console.log(browserInfo)
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

            let response = await axios(
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
            let browser = await this.connectBrowser(port, wsEndpoint)

            console.log(browser)

            setValue("connections", {
                ...getConfig().browsers,
                [port]: wsEndpoint,
            })

            let context = browser.contexts()[0]

            let pages = context.pages()
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
            let browser = browserInfo["browser"] || browserInfo
            let context = browser.contexts()[0]
            for (let page of context.pages()) {
                await page.close()
            }
            return this.compileResult(true, "OK")
        } catch (err) {
            let res = this.compileResult(false, err || err.stack)
            return res
        }
    }

    _getPageForUrl = async (browserContext, url) => {
        let pages = browserContext.pages()
        console.log(pages)
        for (let page of pages) {
            if (page.url() == url) return page
        }
        return null
    }

    _getPageById = async (browserId, pageId) => {
        let browserInfo = await this.getBrowserInfo(browserId)
        let browser = browserInfo['browser'] || browserInfo
        let context = browser.contexts()[0]
        let pages = context.pages()
        let page = Array.from(pages).at(parseInt(pageId))
        if (page == null) {
            throw `Страницы с индексом ${pageId} не существует`
        }
        return page
    }

    openPage = async (browserId, url, waitLoad) => {
        try {
            console.log("Открытие новой страницы")

            let browserInfo = await this.getBrowserInfo(browserId)

            let browser = browserInfo["browser"] || browserInfo

            let context = browser.contexts()[0]

            let opts = null
            if (waitLoad == "1") {
                opts = { waitUntil: "load" }
            }

            // console.log(browserInfo["browser"])

            // console.log(context)

            let page = await this._getPageForUrl(context, "about:blank")
            if (page == null) page = await context.newPage()

            // await page.setExtraHTTPHeaders({
            //     "--disable-web-security": "",
            //     "--disable-features": "IsolateOrigins,site-per-process",
            // })

            try {
                await page.goto(url, opts)
            } catch (err) {
                await page.close()
                throw err
            }

            const pageId = Array.from(context.pages()).length - 1

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
            let page = await this._getPageById(browserId, pageId)
            await page.close()
            return this.compileResult(true, "OK")
        } catch (err) {
            return this.compileResult(false, err || err.stack)
        }
    }

    waitLoad = async (browserId, pageId, maxTimeout = 60000) => {
        try {
            console.log("Ожидание полной загрузки страницы")
            let page = await this._getPageById(browserId, pageId)

            // await page.waitForNavigation({ timeout: maxTimeout })

            await page.waitForLoadState("load", { timeout: maxTimeout })

            return this.compileResult(true, "OK")
        } catch (err) {
            return this.compileResult(false, err || err.stack)
        }
    }

    getPages = async (browserId) => {
        try {
            console.log("Получение страниц")
            let browserInfo = await this.getBrowserInfo(browserId)
            let browser = browserInfo["browser"]
            let context = browser.contexts()[0]
            let openPages = []
            let pages = context.pages()
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

    findBySelector = async (ground, selector, selectorType = "css", isFrame = false) => {
        selectorType = selectorType.toLowerCase()
        console.log(
            "Поиск элементов по селектору",
            selector,
            "тип",
            selectorType,
            "Поиск фрейма",
            isFrame
        )
        let sel
        if (selectorType === 'css') {
            console.log("Поиск селектора css")
        } else if (selectorType === 'xpath') {
            console.log("Поиск селектора по xpath")
        }
        if (selectorType === "css" || selectorType === 'xpath') {
            if (isFrame) {
                sel = ground.frameLocator(selector)
            } else {
                sel = ground.locator(selector)
                await sel.hover()
            }
        } else if (selectorType === "match" || selectorType === "text") {
            console.log("Поиск селектора по match")
            // sel = await ground.getByText(selector).elementHandles()
            sel = await this.searchMatch(ground, selector)
        }
        // console.log("Найденные элементы", sel)
        return sel
    }

    parseBASSelector = (selector) => {
        let selectorEntries = splitOutsideLimitChars(selector, ">FRAME>", [
            ["[", "]"],
            '"',
            "'",
        ])
        console.log("selectorEntries", selectorEntries)
        let regExp = /^\s*>(CSS|XPATH|MATCH)>/gm
        let selectors = []
        selectorEntries.forEach((entry) => {
            let match = entry.match(regExp)
            if (match) {
                let selectorHeader = match[0]
                entry = entry.replace(selectorHeader, "")
                selectorHeader = selectorHeader.replaceAll(">", "")
                selectorHeader = selectorHeader.replaceAll(/\s/gm, "")
                selectors.push({ selector: entry, type: selectorHeader })
                return entry
            } else {
                throw "Селектор в формате BAS должен начинаться с любого из выражений: >CSS>, >XPATH>, >MATCH>"
            }
        })
        return selectors
    }

    findByBASSelector = async (ground, selector) => {
        let selectors = this.parseBASSelector(selector)
        // console.log("BAS selectors", selectors)
        let frame = ground
        for (let i = 0; i < selectors.length - 1; i++) {
            let selector = selectors[i]
            frame = await this.findBySelector(
                frame,
                selector.selector,
                selector.type,
                true
            )
            // console.log(elements[0])
            // console.log("Промежуточный фрейм", frame)
        }
        selector = selectors[selectors.length - 1]
        let resultElements = await this.findBySelector(
            frame,
            selector.selector,
            selector.type
        )
        console.log("resultElements", resultElements)
        return resultElements
    }

    isElementExists = async (
        browserId,
        pageId,
        selector,
        selectorType = undefined
    ) => {
        try {
            if (selectorType) {
                console.log("Проверка существования элемента")
            } else {
                console.log(
                    "Проверка существования элемента с селектором в формате BAS"
                )
            }

            let page = await this._getPageById(browserId, pageId)

            let elements = selectorType
                ? await this.findBySelector(page, selector, selectorType)
                : await this.findByBASSelector(page, selector)

            return this.compileResult(true, { isExists: elements.length > 0 })
        } catch (err) {
            console.log(err)
            return this.compileResult(false, err || err.stack)
        }
    }

    //MouseButtons = (left, right, middle, back)
    pageClick = async (
        browserId,
        pageId,
        selector,
        selectorType = undefined,
        mouseButton = "left",
        clickCount = 1,
        delay = 100
    ) => {
        try {
            if (selectorType) {
                console.log("Клик по элементу")
            } else {
                console.log("Клик по элементу с селектором в формате BAS")
            }
            let page = await this._getPageById(browserId, pageId)
            let elements = selectorType
                ? await this.findBySelector(page, selector, selectorType)
                : await this.findByBASSelector(page, selector)
            // let visibleElements = []
            // for (let element of elements) {
            //     if (await element.isVisible()) {
            //         visibleElements.push(element)
            //     }
            // }
            // for (let element of visibleElements) {
            //     console.log(await element.innerHTML())
            // }
            let element = typeof elements.all === 'function' ? elements.first() : elements[0]

            let options = {
                delay: parseInt(delay),
                button: mouseButton,
                clickCount: parseInt(clickCount),
            }

            if (!element) {
                throw `Элемент с селектором ${selector} на странице ${pageId} браузера ${browserId} не существует.`
            }

            console.log('Элемент', element)

            await element.click(options)

            return this.compileResult(true, "OK")
        } catch (err) {
            console.log(err)
            return this.compileResult(false, err || err.stack)
        }
    }

    pageMoveAndClick = async (
        browserId,
        pageId,
        selector,
        selectorType = undefined,
        waitForSelector = 30000,
        moveDelay = 2000,
        maxTries = 10,
        moveSpeed = undefined,
        mouseButton = "left",
        clickCount = 1,
        delay = 100
    ) => {
        try {
            if (selectorType) {
                console.log("Двинуть мышь и кликнуть на элемент")
            } else {
                console.log(
                    "Двинуть мышь и кликнуть на элемент с селектором в формате BAS"
                )
            }
            let page = await this._getPageById(browserId, pageId)

            let elements = selectorType
                ? await this.findBySelector(page, selector, selectorType)
                : await this.findByBASSelector(page, selector)

            // console.log("Найденные элементы", elements)

            let element = elements[0]

            if (!element) {
                throw `Элемент с селектором ${selector} на странице ${pageId} браузера ${browserId} не существует.`
            }

            // element = !selectorType && element.asElement()

            console.log(element)

            const cursor = createCursor(page)

            const moveOptions = {}
            if (waitForSelector) {
                moveOptions.waitForSelector = waitForSelector
            }
            if (moveDelay) {
                moveOptions.moveDelay = moveDelay
            }
            if (maxTries) {
                moveOptions.maxTries = maxTries
            }
            if (moveSpeed !== 0 && moveSpeed) {
                moveOptions.moveSpeed = moveSpeed
            }

            await cursor.move(element, moveOptions)

            let clickOptions = {
                delay: parseInt(delay),
                button: mouseButton,
                clickCount: parseInt(clickCount),
            }

            let anchor = await element.toElement("a")

            await element.click(clickOptions)

            // try {
            //     await element.click(clickOptions)
            // } catch (err) {
            //     if (err.message === "Node is either not clickable or not an HTMLElement") {

            //     }
            // }

            return this.compileResult(true, "OK")
        } catch (err) {
            console.log(err.message)
            return this.compileResult(false, { error: err || stack })
        }
    }

    pageInputText = async (
        browserId,
        pageId,
        selector,
        text,
        selectorType = undefined,
        delay = 100
    ) => {
        try {
            if (selectorType) {
                console.log("Ввод текста в элемент")
            } else {
                console.log("Ввод текста в элемент с селектором в формате BAS")
            }
            let page = await this._getPageById(browserId, pageId)
            let elements = selectorType
                ? await this.findBySelector(page, selector, selectorType)
                : await this.findByBASSelector(page, selector)

            let element = elements[0]

            if (!element) {
                throw `Элемент с селектором ${selector} на странице ${pageId} браузера ${browserId} не существует.`
            }

            let textData = text
            let pressKeys = []
            let inputParams = text.split("|")
            if (inputParams.length > 1) {
                textData = inputParams[0]
                pressKeys = inputParams[1].split(",")
            }
            let options = { delay }

            await element.click(options)

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
            // let sel =
            //     ">CSS>#google_ads_iframe_1[ >FRAME>]>FRAME>>CSS>a[abc]>FRAME>p"

            let anchorTest = async () => {
                // let homeAnchor = page.locator("//a[@rel='home']")
    
                // await homeAnchor.click()
    
                let anchorLocator = page.getByText('Surfgateway')
    
                let anchors = await anchorLocator.elementHandles()
    
                let anchorsHtml = []
                for (let anchor of anchors) {
                    anchorsHtml.push(await anchor.innerHTML())
                }
    
                console.log(anchorsHtml)

            }

            let frameTest = async () => {
                let iframe = page.frameLocator('#aswift_1').locator('a.ns-dn0if-e-11')
                // console.log(iframe)
                await iframe.click()
                // let anchor = await iframe.locator('a').first().elementHandle()
                // let anchors = await iframe.locator('a').all()
                // let resultAnchor
                // for (let anchor of anchors) {
                //     if (await anchor.isVisible()) {
                //         resultAnchor = anchor
                //         break
                //     }
                // }
                // console.log(await resultAnchor.innerHTML())
                // await resultAnchor.click()
            }

            let frameTest2 = async () => {
                let frameElement = await page.locator('#aswift_1')

                let frame = await frameElement.contentFrame()

                let anchorInFrame = await frame.$('a')

                await anchorInFrame.click()
            }

            await frameTest()


            // this.parseBASSelector(sel)

            // let el = await page.$$("#aswift_1")

            // let frame = await el[0].frame

            // let anchor = await frame.$$("a")

            // console.log(anchor)

            // await anchor[0].click()

            // let markup = await page.evaluate((el) => el.outerHTML, anchor[0])

            // console.log(markup)

            // await el[0].frame.evaluate((btn) => btn.click(), anchor[0])

            return this.compileResult(true, "OK")
        } catch (err) {
            console.log(err)
            return this.compileResult(false, err || err.stack)
        }
    }
}

module.exports = new API()
