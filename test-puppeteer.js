const puppeteer = require("puppeteer")
const { createCursor } = require("ghost-cursor")
const random = require("random")
const axios = require('axios')
const { TOKEN } = require('./config')

const delay = (ms) => {
    return new Promise((r) => setTimeout(() => r(), ms))
}

class Script {
    getProfiles() {
        
    }

    async start() {

    }
}

async function getPic() {
    const browser = await puppeteer.launch({ headless: false })
    const page = await browser.newPage()
    await page.goto("https://google.com")
    await page.screenshot({ path: "google.png" })

    await browser.close()
}

/**
 *
 * @param {puppeteer.Page} page
 */
async function emulateIdleState(page) {
    // await page.emulateIdleState({ isUserActive: true, isScreenUnlocked: false })
    // await delay(5000)
    // await page.emulateIdleState()
}

/**
 *
 * @param {puppeteer.Browser} browser
 * @param {puppeteer.Page} page
 */
async function testCursor(browser, page) {
    const cursor = createCursor(page)
    // await cursor.moveTo({
    //     x: random.int(0, page.viewport().width),
    //     y: random.int(0, page.viewport().height),
    // })
    await cursor.click('img[src="/tia/tia.png"]')
    // const center = await page.evaluate(() => {
    //     let img = document.querySelector("img[alt='Google']")
    //     const r = img.getBoundingClientRect()

    //     return {
    //         x: (r.right - r.left) / 2,
    //         y: (r.bottom - r.top) / 2,
    //     }
    // })
    // const size = await page.evaluate(() => {
    //     let el = document.querySelector('input[aria-label="Поиск в Google"]')

    //     const r = el.getBoundingClientRect()

    //     return {
    //         x: (r.right - r.left) / 2,
    //         y: (r.bottom - r.top) / 2,
    //     }
    // })
    // // const x = random.int(0, page.viewport().width)
    // // const y = random.int(0, page.viewport().height)
    // const x = center.x
    // const y = center.y

    // console.log(x, y)

    // // await page.mouse.move(x, y)
    // await page.mouse.click(size.x, size.y)
    await delay(5000)
}

async function start() {
    const browser = await puppeteer.launch({
        headless: false,
        timeout: 360000,
        defaultViewport: { width: 860, height: 640 },
    })
    const page = await browser.newPage()
    await page.goto("https://google.com")


    // await emulateIdleState(page)
    await testCursor(browser, page)
}

start()
