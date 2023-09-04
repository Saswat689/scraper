import * as cheerio from "cheerio";
import puppeteerExtra from "puppeteer-extra";
import stealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs";
import { us_cities } from "./cities.js";
import readline from 'readline'

var rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

process.setMaxListeners(Infinity);

async function searchGoogleMaps(query) {
  console.log(`Mining started for ${query}`);
  try {
    const start = Date.now();

    puppeteerExtra.use(stealthPlugin());

    const browser = await puppeteerExtra.launch({
      headless: true,
      // devtools: true,
      executablePath: "", // your path here
    });

    // const browser = await puppeteerExtra.launch({
    //   args: chromium.args,
    //   defaultViewport: chromium.defaultViewport,
    //   executablePath: await chromium.executablePath(),
    //   headless: "new",
    //   ignoreHTTPSErrors: true,
    // });

    const page = await browser.newPage();

    try {
      await page.goto(
        `https://www.google.com/maps/search/${query.split(" ").join("+")}`
      );
    } catch (error) {
      console.log("error going to page");
    }

    async function autoScroll(page) {
      await page.evaluate(async () => {
        const wrapper = document.querySelector('div[role="feed"]');

        await new Promise((resolve, reject) => {
          var totalHeight = 0;
          var distance = 1000;
          var scrollDelay = 20000;

          var timer = setInterval(async () => {
            var scrollHeightBefore = wrapper.scrollHeight;
            wrapper.scrollBy(0, distance);
            totalHeight += distance;

            if (totalHeight >= scrollHeightBefore) {
              totalHeight = 0;
              await new Promise((resolve) => setTimeout(resolve, scrollDelay));

              // Calculate scrollHeight after waiting
              var scrollHeightAfter = wrapper.scrollHeight;

              if (scrollHeightAfter > scrollHeightBefore) {
                // More content loaded, keep scrolling
                return;
              } else {
                // No more content loaded, stop scrolling
                clearInterval(timer);
                resolve();
              }
            }
          }, 200);
        });
      });
    }

    await autoScroll(page);

    const html = await page.content();
    const pages = await browser.pages();
    await Promise.all(pages.map((page) => page.close()));

    await browser.close();
    console.log("browser closed");

    // get all a tag parent where a tag href includes /maps/place/
    const $ = cheerio.load(html);
    const aTags = $("a");
    const parents = [];
    aTags.each((i, el) => {
      const href = $(el).attr("href");
      if (!href) {
        return;
      }
      if (href.includes("/maps/place/")) {
        parents.push($(el).parent());
      }
    });

    const buisnesses = [];

    parents.forEach((parent) => {
      const url = parent.find("a").attr("href");
      // get a tag where data-value="Website"
      const website = parent.find('a[data-value="Website"]').attr("href");
      // find a div that includes the class fontHeadlineSmall
      const storeName = parent.find("div.fontHeadlineSmall").text();
      // find span that includes class fontBodyMedium
      const ratingText = parent
        .find("span.fontBodyMedium > span")
        .attr("aria-label");

      // get the first div that includes the class fontBodyMedium
      const bodyDiv = parent.find("div.fontBodyMedium").first();
      const children = bodyDiv.children();
      const lastChild = children.last();
      const firstOfLast = lastChild.children().first();
      const lastOfLast = lastChild.children().last();

      buisnesses.push({
        storeName,
        category: firstOfLast?.text()?.split("·")?.[0]?.trim(),
        address: firstOfLast?.text()?.split("·")?.[1]?.trim(),
        phone: lastOfLast?.text()?.split("·")?.[1]?.trim(),
        bizWebsite: website,
        numberOfReviews: ratingText
          ?.split("stars")?.[1]
          ?.replace("Reviews", "")
          ?.trim()
          ? Number(
              ratingText?.split("stars")?.[1]?.replace("Reviews", "")?.trim()
            )
          : null,
        googleUrl: url,
        placeId: `ChI${url?.split("?")?.[0]?.split("ChI")?.[1]}`,
        ratingText,
        stars: ratingText?.split("stars")?.[0]?.trim()
          ? Number(ratingText?.split("stars")?.[0]?.trim())
          : null,
      });
    });
    const end = Date.now();

    console.log(`time in seconds ${Math.floor((end - start) / 1000)}`);

    return buisnesses;
  } catch (error) {
    console.log("error at googleMaps", error.message);
  }
}

async function searchCity(q, c,review,res) {
  let result = await searchGoogleMaps(`${q} ${c}`);

  if (!result) {
    return;
  }

  let targetbiz = result.filter(
    (item) => {
      if (item.bizWebsite == undefined && item.phone != undefined) {
        return true
      } else {
        return false
      }
    }
  );

  console.log(
    `Out of ${result.length} results, extracted ${targetbiz.length}. Now appending to list.json...`
  );

  fs.readFile("list.json", function (err, data) {
    if (err) throw err;
    let list = JSON.parse(data);
    console.log("list length", list.length);
    list.push(...targetbiz);
    fs.writeFile("list.json", JSON.stringify(list), function (err) {
      if (err) throw err;
      console.log("Data scraping successfull. Starting next city... Length of file is now ", list.length);
    });
  });

}

let cities = us_cities;
let niche

//only specific queries allowed such as car detailer,web design,marketing agency,
//insurance,lawn care,landscaping,gardening,
//tree service,pool cleaning,car wash,carpentors,electricians,
//roofing,gym trainer,video grapher,photographer

console.log('Welcome to software. \n - Type your niche and press enter. \n - To exit the program press Ctrl+C. \n - Keep it undisturbed for some time to start seeing results appended to your list.json file.')

let batch = Number(fs.readFileSync('batch.txt'))

rl.question('\n Which niche do you want to search ? \n Options: car detailer,web design,marketing agency,roofing,gym trainer,video grapher,photographer,tree service,pool cleaning,car wash,carpentors,electricians,insurance,lawn care,landscaping,gardening \n \n: ', myniche => {
  niche = myniche
  rl.close();

  console.log('\n Firing up the engines. Might take a minute... \n \n')

  let interval = setInterval(async () => {
    try {
      if (batch>6740) {
        console.log('List exhausted. Change your niche and rerun the program.')
        fs.writeFileSync('batch.txt','-1')
        clearInterval(interval)
        process.exit()
      }
      batch++;
      searchCity(`${niche},usa`,cities[batch])
    } catch(e) {
      console.log('something wrong')
    }
  },1000*60*1.4)
});

//store batch detail
process.on('SIGINT', function(){
  fs.writeFileSync('batch.txt',batch.toString())
  process.exit()
})