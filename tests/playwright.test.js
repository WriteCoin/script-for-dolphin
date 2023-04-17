let { chromium } = require("playwright")

let googleTest = async () => {
    let browser = await chromium.launch({ headless: false })
    let context = await browser.newContext()

    console.log(context)

    let page = await context.newPage()

    await page.goto("https://google.com")

    await page.screenshot({ path: "./google.png" })

    await browser.close()
}

let frameTest = async () => {
    let browser = await chromium.launch({
        headless: false,
        proxy: {
            server: "http://45.86.247.173:7241",
            username: "wakfydui",
            password: "e877hxlyvyc7",
        },
    })
    let context = await browser.newContext()

    let page = await context.newPage()

    await page.goto("https://surfgateway.com")

    let testFrame = async () => {
        let frameElement = await page.$('#aswift_1')
    
        let frame = await frameElement.contentFrame()
    
        let anchorInFrame = await frame.$('a')
    
        await anchorInFrame.click()
    }

    let testLocators = async () => {
        let logoAnchor = page.getByText('Surfgateway').first()

        await logoAnchor.click()

        // await page.waitForNavigation()
        await page.waitForLoadState()

        console.log("Загрузка завершена")
    }

    // await testFrame()

    await testLocators()

    await browser.close()
}

let main = async () => {
    await frameTest()
}

main()
