const puppeteer = require("puppeteer")
const { pageEmulateIdleState } = require("../API")
const API = require("../API")
const { TOKEN } = require("../config")

const delay = (ms) => {
    return new Promise((r) => setTimeout(() => r(), ms))
}

class Script {
    url = "https://google.com"
    // url = 'https://pricehai.com'

    async getProfiles() {
        const profilesResult = await API.getProfiles()
        return profilesResult.profiles
        // return ["TestProfile"]
    }

    async runBrowser(profile) {
        const browserIdResult = await API.runBrowser(profile)
        // console.log(browserIdResult)
        this.browserId = browserIdResult.browserId
    }

    async openPage(url, waitLoad) {
        const pageIdResult = await API.openPage(this.browserId, url, waitLoad)
        // console.log(pageIdResult)
        this.pageId = pageIdResult.pageId
    }

    async clickTest(selector, selectorType) {
        await API.pageClick(this.browserId, this.pageId, selector, selectorType)
    }

    async pricehaiRun(
        advSelector = "#google_ads_iframe_1",
        advSelectorType = "css"
    ) {
        console.log("Загрузка страницы")

        await this.openPage("https://pricehai.com", true)

        console.log("Эмуляция бездействия")

        await API.pageEmulateIdleState(
            this.browserId,
            this.pageId,
            10,
            true,
            false
        )

        console.log("Клик по рекламе")

        await API.pageMoveAndClick(
            this.browserId,
            this.pageId,
            advSelector,
            advSelectorType
        )

        // console.log("Ожидание загрузки")

        // await API.waitLoad(this.browserId, this.pageId)

        const navigate = async (section, selType = "match") => {
            let isExistsResult = await API.isElementExists(
                this.browserId,
                this.pageId,
                section,
                selType
            )

            console.log("Элемент существует", isExistsResult)

            let isExists = isExistsResult.isExists

            if (isExists) {
                await API.pageMoveAndClick(
                    this.browserId,
                    this.pageId,
                    "Navigation",
                    selType
                )
                await API.pageMoveAndClick(
                    this.browserId,
                    this.pageId,
                    section,
                    selType
                )
                // await API.waitLoad(this.browserId, this.pageId)
                await API.pageEmulateIdleState(
                    this.browserId,
                    this.pageId,
                    10,
                    true,
                    false
                )
            }
        }

        console.log("Навигация")

        await navigate("About")
        await navigate(
            '//ul[@id="menu-menu"]//a//span[contains(.,"Home")]',
            "xpath"
        )
        await navigate("Support")
        await navigate("Join")
        await navigate("Sign")
        await navigate("Sign up")
        await navigate("Privacy")
    }

    async start() {
        try {
            const profiles = await this.getProfiles()
            for (const profile of profiles) {
                // console.log(profile)
                await this.runBrowser(profile)
                // console.log(this.browserId)

                this.pricehaiRun()

                // await this.openPage(this.url, true)

                // console.log(this.pageId)

                // await API.pageEmulateIdleState(this.browserId, this.pageId, 30000, true, false)

                // await API.pageEmulateInactivity(this.browserId, this.pageId)

                // await this.clickTest('//a[normalize-space(.)="Войти"]', "xpath")

                // const result = await API.isElementExists(
                //     this.browserId,
                //     this.pageId,
                //     '//a[normalize-space(.)="Вйти"]'
                // )
                // console.log(result)

                // const result = await API.pageMoveAndClick(
                //     this.browserId,
                //     this.pageId,
                //     '//a[normalize-space(.)="Войти"]',
                //     "xpath",
                //     30000,
                //     2000,
                //     10,
                //     0,
                //     "left",
                //     1,
                //     100
                // )
                // console.log(result)

                // console.log("Страница загрузилась")

                // const selectorResult = await API.getSelector(
                //     this.browserId,
                //     this.pageId,
                //     "About",
                //     "match"
                // )

                // console.log(selectorResult)

                // console.log(
                //     await API.isElementExists(
                //         this.browserId,
                //         this.pageId,
                //         "About",
                //         "match"
                //     )
                // )

                await delay(5000)

                await API.closeBrowser(this.browserId)
            }
        } catch (e) {
            console.error("Ошибка при старте браузера", e)
        }
    }

    async simpleStart() {
        const browser = await puppeteer.launch({
            headless: false,
        })
        const page = await browser.newPage()
        await page.goto("https://google.com")

        // let [el] = await page.$x('//a[normalize-space(.)="Войти"]')

        // await el.click()

        // await page.waitForNavigation({
        //     timeout: 60000,
        //     // waitUntil: "networkidle2",
        // })

        // console.log("Страница загрузилась")

        // await page.click()

        // const elements = await page.$x('//a[normalize-space(.)="Вйти"]')

        // await button.click()
        // console.log(elements)

        // await page.click('//a[normalize-space(.)="Войти"]')

        // await delay(2000)

        // await browser.close()
    }
}

const script = new Script()
script.start()
// script.simpleStart()
