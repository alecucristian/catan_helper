const { createCanvas, loadImage } = require('canvas');
const Tesseract = require('tesseract.js');

async function test() {
  const img = await loadImage('/home/alecu/projects/catan_helper/catan_image.jpeg');
  
  // Let's crop the '10' token from the top row (mid top)
  // From visual inspection, it's roughly x: 450, y: 880, radius 40
  const canvas = createCanvas(80, 80);
  const ctx = canvas.getContext('2d');
  
  // Crop an 80x80 area around 450, 880
  ctx.drawImage(img, 450 - 40, 880 - 40, 80, 80, 0, 0, 80, 80);
  
  // Optional: threshold it to black and white for better OCR
  const data = ctx.getImageData(0,0,80,80);
  for(let i=0; i<data.data.length; i+=4) {
    const luma = data.data[i]*0.299 + data.data[i+1]*0.587 + data.data[i+2]*0.114;
    const val = luma > 150 ? 255 : 0;
    data.data[i] = data.data[i+1] = data.data[i+2] = val;
  }
  ctx.putImageData(data, 0, 0);

  const buffer = canvas.toBuffer('image/png');
  require('fs').writeFileSync('token10.png', buffer);

  console.log("Running Tesseract...");
  const result = await Tesseract.recognize(buffer, 'eng', {
    tessedit_char_whitelist: '0123456789'
  });
  console.log("Result text:", result.data.text.trim());
}

test();
