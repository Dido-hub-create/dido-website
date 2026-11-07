# Dido с бегач — визуален preview

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
