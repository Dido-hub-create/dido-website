import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {mkdirSync} from 'node:fs';
const enabled=process.env.DIDO_BROWSER_MODULE&&process.env.DIDO_BROWSER_URL;
test('logo CMS widths scale the actual header/footer image, keep aspect ratio and allow bundled/text fallbacks',{skip:!enabled,timeout:120000},async()=>{
 const {chromium}=createRequire(import.meta.url)(process.env.DIDO_BROWSER_MODULE),browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 mkdirSync('work/logo-sizing',{recursive:true});const metrics=[];
 try{
 for(const width of [320,390,768,1024,1100,1200,1201,1280,1366,1440]){
  const page=await browser.newPage({viewport:{width,height:960}});await page.goto(process.env.DIDO_BROWSER_URL+'/');await page.locator('[data-brand-logo]').evaluateAll(images=>Promise.all(images.map(i=>i.decode())));
  const sizes=[];
  for(const [label,desktop,mobile] of [['original',128,108],['larger',144,120],['maximum',160,128]]){
   await page.locator('.brand.is-image').evaluateAll((links,{desktop,mobile})=>links.forEach(link=>{link.style.setProperty('--logo-desktop',desktop+'px');link.style.setProperty('--logo-mobile',mobile+'px');}),{desktop,mobile});
   const expected=width<=960?mobile:desktop;
   const images=await page.locator('[data-brand-logo]').evaluateAll(imgs=>imgs.map(i=>({width:i.getBoundingClientRect().width,height:i.getBoundingClientRect().height,naturalWidth:i.naturalWidth,naturalHeight:i.naturalHeight,containerHeight:i.parentElement.getBoundingClientRect().height})));
   assert.equal(images.length,2);for(const i of images){assert.ok(Math.abs(i.width-expected)<.5,`${width}/${label}: image width ${i.width}, expected ${expected}`);assert.ok(Math.abs(i.height-i.width*i.naturalHeight/i.naturalWidth)<.5);assert.ok(i.containerHeight>=i.height-.5);}
   sizes.push(images[0].height);metrics.push({viewport:width,variant:label,header:images[0],footer:images[1]});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${width}/${label}: overflow`);
   const nav=page.locator('#main-navigation');
   if(await nav.isVisible()){
    const rectangles=await page.evaluate(()=>({logo:document.querySelector('.site-header .brand').getBoundingClientRect().toJSON(),nav:document.querySelector('#main-navigation').getBoundingClientRect().toJSON()}));
    assert.ok(rectangles.logo.right<=rectangles.nav.left,`${width}/${label}: menu overlaps logo`);assert.ok(rectangles.nav.right<=width,`${width}/${label}: menu extends beyond viewport`);
   }else{
    await page.locator('[aria-controls="main-navigation"]').click();assert.ok(await nav.isVisible());
    assert.ok(await nav.evaluate(el=>el.getBoundingClientRect().top>=document.querySelector('.header-inner').getBoundingClientRect().bottom-.5));await page.locator('[aria-controls="main-navigation"]').click();
   }
   if([390,1440].includes(width)&&label!=='maximum'){
    await page.locator('.site-header').screenshot({path:`work/logo-sizing/header-${label}-${width}.png`});
    await page.locator('.site-footer').screenshot({path:`work/logo-sizing/footer-${label}-${width}.png`});
   }
  }
  assert.ok(sizes[1]>sizes[0]*1.10,`${width}: width change does not visibly increase logo height`);
  await page.locator('[data-brand-logo]').evaluateAll(imgs=>Promise.all(imgs.map(async i=>{i.src='/branding/logo-dido-runner-b.svg';await i.decode();})));
  assert.equal(await page.locator('[data-brand-logo]').count(),2);
  await page.locator('[data-brand-logo]').evaluateAll(imgs=>Promise.all(imgs.map(i=>new Promise(resolve=>{i.addEventListener('error',()=>resolve(),{once:true});i.src='/branding/missing-logo-test.png';}))));
  assert.equal(await page.locator('[data-brand-logo]').count(),0);assert.equal(await page.locator('[data-brand-fallback]:visible').count(),2);assert.equal(await page.locator('.brand[href="/"]').count(),2);
  await page.close();
 }
 console.log('Logo rendered dimensions:',JSON.stringify(metrics));
 }finally{await browser.close();}
});
