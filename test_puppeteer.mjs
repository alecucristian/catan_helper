import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER:', msg.text()));
  
  await page.goto('http://localhost:4173', { waitUntil: 'networkidle0' });
  
  console.log("Waiting for OpenCV to load...");
  await page.waitForFunction('window.cvLoaded === true', { timeout: 15000 });
  console.log("OpenCV loaded.");
  
  const filePath = path.resolve(__dirname, '../../catan_image.jpeg');
  const [fileChooser] = await Promise.all([
    page.waitForFileChooser(),
    page.click('#detectFromImage')
  ]);
  
  console.log("Uploading file...");
  await fileChooser.accept([filePath]);
  
  console.log("Waiting for processing...");
  await page.waitForFunction(() => {
    const status = document.getElementById('status').textContent;
    return status.includes('Import complete!') || status.includes('Failed') || status.includes('failed');
  }, { timeout: 30000 });
  
  const status = await page.$eval('#status', el => el.textContent);
  console.log("Status:", status);
  
  const code = await page.$eval('#boardCode', el => el.value);
  console.log("GENERATED CODE:", code);
  
  const review = await page.$eval('#importReviewList', el => el.innerText);
  console.log("REVIEW LIST:");
  console.log(review);
  
  await browser.close();
})();
