cmake_minimum_required(VERSION 3.20)
project(FarkoLauncher LANGUAGES CXX RC)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
add_definitions(-DUNICODE -D_UNICODE -DWIN32_LEAN_AND_MEAN -DNOMINMAX -D_CRT_SECURE_NO_WARNINGS)

if(MSVC)
    enable_language(RC)
endif()

add_executable(FarkoLauncher WIN32
    src/main.cpp
    src/utils.cpp
    src/webview_loader.cpp
    src/http.cpp
    src/server.cpp
    resources.rc
)

target_include_directories(FarkoLauncher PRIVATE ${CMAKE_SOURCE_DIR}/include)
target_link_libraries(FarkoLauncher PRIVATE dwmapi advapi32 shell32 user32 ws2_32
    winhttp iphlpapi shlwapi ole32 oleaut32 kernel32 gdi32 comctl32)

if(MSVC)
    target_compile_options(FarkoLauncher PRIVATE /W3 /MP)
    target_link_options(FarkoLauncher PRIVATE /SUBSYSTEM:WINDOWS)
endif()
