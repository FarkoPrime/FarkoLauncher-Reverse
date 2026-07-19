# Архитектура

## Обзор

FarkoLauncher — это нативное x64 C++ приложение. WebView2 загружается динамически через LoadLibrary.

## Модули

### main.cpp
Точка входа (wWinMain), создание окна (1240×780, без рамки, тёмная тема), цикл обработки сообщений. Окно класса `FarkoLauncherWeb`.

### utils.cpp
Утилиты: конвертация строк, проверка файлов, FNV-1a хеш для генерации поддоменов (`fl-XXXXXXXX.gta5rp.com`), поиск директории RAGE:MP.

### webview_loader.cpp
Поиск и загрузка WebView2 runtime. Динамическая загрузка `EmbeddedBrowserWebView.dll` через LoadLibrary. COM vtable вызовы для навигации, отправки сообщений, изменения размера. WebResourceRequested handler для отдачи встроенных веб-ресурсов.

### http.cpp
HTTP клиент на WinHTTP. Запрос списка серверов с GitHub API (`api.github.com/repos/FarkoPanich/Masterlist/contents/servers.json`). Заголовок `Accept: application/vnd.github.raw+json`.

### server.cpp
Парсинг JSON со списком серверов. Запись IP/порта в реестр `HKCU\Software\RAGE-MP`. Управление hosts-файлом для обхода вайтлиста RAGE:MP. Запуск `updater.exe` через CreateProcess.

### resources.rc
Встроенные PE-ресурсы: HTML, CSS, JS лаунчера как RCDATA.

## Встроенные ресурсы

Веб-файлы (HTML/CSS/JS) компилируются в PE как RCDATA ресурсы. При запуске `LoadEmbeddedResources()` загружает их в `unordered_map<string, EmbeddedResource>`. WebResourceRequested handler перехватывает запросы к `https://farko.app/*`, извлекает путь, ищет в мапе и отдаёт данные через `SHCreateMemStream`.

## Поток выполнения

```
WinMain
  → CoInitializeEx
  → RegisterClassExW (FarkoLauncherWeb)
  → CreateWindowExW (1240×780, borderless, dark)
  → DwmSetWindowAttribute (тёмная тема)
  → PostMessage(WM_INIT_WEBVIEW)
    → WebView2Host::Begin
      → LoadEmbeddedResources (парсинг PE RCDATA)
      → FindRuntime (поиск в реестре)
      → LoadLibrary (EmbeddedBrowserWebView.dll)
      → CreateEnvironment + CreateController
    → OnControllerCreated
      → Регистрация WebResourceRequested handler
      → Регистрация WebMessageReceived handler
      → Navigate("https://farko.app/index.html?v=232")
    → ServerList::Refresh (GitHub API)
  → Message loop
    → WM_SIZE → Resize WebView
    → WM_MOUSEMOVE → drag
    → Custom messages → WebView callbacks
```

## Ключевые адреса в бинарнике

| Адрес | Функция |
|-------|---------|
| 0x1400052b0 | WinMain / создание окна |
| 0x140005c00 | WndProc |
| 0x140001001-0x140002c0b | WebView2 загрузчик |
| 0x14001d200-0x14001e050 | WebView2 COM настройка |
| 0x140012470 | Обработка JS сообщений |
| 0x1400293f0 | Запуск сервера |
| 0x14002a5d0 | Запись в реестр |
| 0x140030d10 | HTTP запрос |

## Патчи updater.exe

6 условных переходов в `updater.exe` отключают проверку версии:

| Смещение | Байты | Назначение |
|----------|-------|-----------|
| 37779 | `75 1A` → `90 90` | Проверка версии |
| 38403 | `75 2B` → `90 90` | Проверка версии |
| 39115 | `74 14` → `EB 14` | Вайтлист |
| 39129 | `7E 06` → `EB 06` | Сравнение версий |
| 39338 | `75 1A` → `90 90` | Проверка версии |
| 41037 | `75 10` → `90 90` | Проверка версии |
