# Dido с бегач — варианти за одобрение

**Няма избран окончателен вариант. Текущото активно лого е запазено.**

Добавени са два SVG варианта със същите векторни контури на надписа и същия `viewBox` 2030 × 620. Хедърът използва същите 128 px desktop / 108 px mobile ширини.

| | Вариант А — балансиран | Вариант Б — по-изразителен |
| --- | --- | --- |
| Бегач | +38%, равномерно увеличение | Около +75% височина, по-плътни контури |
| Линия | Плавна връзка към фигурата | По-силно изразена, с повече движение |
| Телефон, 390 px | [Реален PNG](../public/branding/previews/header-a-390.png) | [Реален PNG](../public/branding/previews/header-b-390.png) |
| Desktop, 1440 px | [Реален PNG](../public/branding/previews/header-a-1440.png) | [Реален PNG](../public/branding/previews/header-b-1440.png) |
| SVG | [Вариант А](../public/branding/logo-dido-runner-a.svg) | [Вариант Б](../public/branding/logo-dido-runner-b.svg) |

### А — телефон, реален хедър 390 × 73 px

![Вариант А в мобилния хедър](../public/branding/previews/header-a-390.png)

### Б — телефон, реален хедър 390 × 73 px

![Вариант Б в мобилния хедър](../public/branding/previews/header-b-390.png)

Пълното сравнение, с native SVG изглед и screenshots за 320/390/768/1440 px, е на **`/branding/variants.html`** в новия branch preview. Screenshots са от действителния изграден сайт; чрез локален browser response override е сменен само SVG файлът. CSS, размерът на логото и менюто не са променяни. Проверена е пълна идентичност на позициите и размерите на хедъра за текущото лого, А и Б; няма overflow или page errors.

След избора от собственика SVG може да се качи през съществуващото поле **Собствено лого** в Pages CMS. Не е добавен автоматичен избор или промяна в `site.json`, favicon или производствения `main`.

---

## Предходният вариант — запазен като текущ

Това е визуален преглед на новия branch, с реални Chromium screenshots. Не е production deployment; публикуваният сайт не е променян.

## Новият знак

![Новото Dido лого върху тъмния фон](branding-preview/logo.png)

[Векторен SVG файл](../public/branding/logo-dido-runner.svg) · [Настройки и fallback](DIDO-v0.6-logo.md)

## Desktop — 1440 px

![Хедър при 1440 px](branding-preview/header-desktop.png)

## Телефон — 320 и 390 px

![Хедър при 320 px](branding-preview/header-320.png)

![Хедър при 390 px](branding-preview/header-390.png)

## Favicon — светъл и тъмен фон, 16/32/64 px

![Favicon на светла и тъмна тема](branding-preview/favicon.png)

Проверен е и таблетен изглед 768 px. Хедърът запазва височината си; няма overflow или промяна на размера на менюто. Изключено/незаредено изображение връща досегашното текстово Dido с линия.

За интерактивен преглед GitHub Actions запазва пълния build в artifact **dido-static-preview**. Ако Cloudflare предложи автоматичен branch preview към PR, използвай само този адрес — production `main` не се публикува от тази задача.
