# Сборка

## Что нужно

- Windows 10/11
- Visual Studio 2022 (или новее) с поддержкой C++
- CMake 3.20+
- WebView2 Runtime (предустановлен в Windows 10/11)

## Через CMake

```bash
cd FarkoLauncher-native
cmake -B build -G "Visual Studio 17 2022"
cmake --build build --config Release
```

Результат: `build/Release/FarkoLauncher.exe`

## Через Visual Studio

1. Открыть папку `FarkoLauncher-native` в Visual Studio (File → Open → CMake)
2. Visual Studio автоматически найдёт CMakeLists.txt
3. Выбрать конфигурацию Release
4. Build → Build All (Ctrl+Shift+B)

## Если не компилируется

Проверь что:
- Установлена поддержка C++ в Visual Studio (Desktop development with C++)
- Windows SDK актуальная
- WebView2 Runtime установлен (проверь: `edge://settings/help` в Edge)

## Зависимости

- **nlohmann/json** — включена в `include/nlohmann/json.hpp`
- **WinHTTP** — часть Windows SDK
- **WebView2** — загружается динамически при запуске

## Статус

Это реконструкция. Код может не компилироваться из-за неточностей в восстановлении типов и интерфейсов. Если нашёл ошибку — исправляй или пиши в Issues.
