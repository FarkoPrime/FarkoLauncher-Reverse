#pragma once
#include <windows.h>
#include <objbase.h>
#include <string>
#include <unordered_map>
#include <vector>

struct EmbeddedResource {
    const char* data;
    DWORD size;
    const char* mime;
};

class WebView2Host {
public:
    WebView2Host();
    ~WebView2Host();
    bool Begin(HWND hWndParent);
    void PostWebMessage(const std::wstring& json);
    void Resize();
    bool IsReady() const { return m_web != nullptr; }
    void* m_env = nullptr;
    void* m_ctrl = nullptr;
    void* m_web = nullptr;
    HWND m_parent = nullptr;
    std::unordered_map<std::string, EmbeddedResource> m_resources;
private:
    void LoadEmbeddedResources();
    HMODULE m_dll = nullptr;
};
