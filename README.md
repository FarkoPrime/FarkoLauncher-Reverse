# FarkoLauncher — Реконструкция

Реконструкция нативного C++ лаунчера по декомпиляции из Ghidra. Полная декомпиляция бинарника и восстановление исходного кода. Выложено в образовательных целях.

## Что выяснилось из декомпиляции

- Это **нативный x64 C++**
- WebView2 загружается динамически через LoadLibrary
- 6 бинарных патчей в updater.exe (29 байт суммарно) отключают проверку версии
- Кастомный мастер-лист тянется с GitHub API
- Лаунчер патчит hosts-файл для редиректа не-whitelisted доменов
- По факту — это патченный RAGE:MP с кастомным мастер-листом. Аналогичный подход реализован в [tiny-ragemp-launcher](https://github.com/winnerchester/tiny-ragemp-launcher)

## Что здесь лежит

```
FarkoLauncher-native/
  CMakeLists.txt           — конфигурация сборки
  resources.rc             — определения PE-ресурсов (веб-контент)
  web/
    index.html             — интерфейс лаунчера
    css/style.css          — стили
    js/app.js              — клиентская логика
  src/
    main.cpp               — WinMain, WndProc, цикл сообщений
    webview_loader.cpp     — настройка WebView2 + WebResourceRequested handler
    http.cpp               — HTTP-клиент (получение мастер-листа)
    server.cpp             — список серверов, патчинг hosts, запуск RAGE:MP
    utils.cpp              — конвертация строк, утилиты, пути
  include/
    app.h                  — глобальные переменные, структуры, объявления
    webview_loader.h       — класс WebView2Host
    http.h                 — класс HttpClient
    server.h               — класс ServerList
tools/
  decompiled.cpp           — полная декомпиляция из Ghidra (1409 функций)
  key_functions.cpp        — 22 ключевые функции с пояснениями
```

## Как собрать

Смотри [BUILD.md](BUILD.md).

## Как это работает

Смотри [ARCHITECTURE.md](ARCHITECTURE.md).

## Важно

Это **не** оригинальный код автора. Это реконструкция по декомпиляции. Имена функций, переменных, структура файлов — всё это предположения. Оригинальный код может выглядеть совсем по-другому.

Для проверки есть `tools/decompiled.cpp` — полная декомпиляция из Ghidra.

## Юридическое

Этот проект предназначен для образовательных целей. Все права на оригинальный код принадлежат автору FarkoLauncher.
