#include "app.h"
#include "webview_loader.h"
#include "server.h"

static WebView2Host* g_self = nullptr;

struct ResourceEntry {
    std::string path;
    std::string data;
    std::string mime;
};

static std::vector<ResourceEntry> g_entries;

WebView2Host::WebView2Host() { g_self = this; }
WebView2Host::~WebView2Host() {
    if (m_web) { (*(void(__stdcall**)(void*))(*(uintptr_t*)m_web + 0x10))(m_web); m_web = nullptr; }
    if (m_ctrl) { (*(void(__stdcall**)(void*))(*(uintptr_t*)m_ctrl + 0x10))(m_ctrl); m_ctrl = nullptr; }
    if (m_env) { (*(void(__stdcall**)(void*))(*(uintptr_t*)m_env + 0x10))(m_env); m_env = nullptr; }
    if (m_dll) FreeLibrary(m_dll);
    g_self = nullptr;
}

static std::wstring ExeDir() {
    wchar_t b[MAX_PATH]; GetModuleFileNameW(nullptr, b, MAX_PATH);
    std::wstring s = b; auto p = s.find_last_of(L'\\');
    return p != std::wstring::npos ? s.substr(0, p) : L"";
}

static std::wstring FindRuntime() {
    const wchar_t* rp = L"Software\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
    HKEY hk;
    if (RegOpenKeyExW(HKEY_LOCAL_MACHINE, rp, 0, KEY_READ, &hk) == ERROR_SUCCESS) {
        wchar_t v[256]; DWORD n = sizeof(v);
        if (RegQueryValueExW(hk, L"EBWebView", nullptr, nullptr, (LPBYTE)v, &n) == ERROR_SUCCESS) {
            RegCloseKey(hk);
            std::wstring dll = v;
            dll += L"EBWebView\\x64\\EmbeddedBrowserWebView.dll";
            if (GetFileAttributesW(dll.c_str()) != INVALID_FILE_ATTRIBUTES) return v;
            return L"";
        }
        RegCloseKey(hk);
    }
    return L"";
}

static bool LoadWebView2Dll(const std::wstring& path) {
    std::wstring dll = path + L"EBWebView\\x64\\EmbeddedBrowserWebView.dll";
    HMODULE h = LoadLibraryW(dll.c_str());
    if (!h) return false;
    auto pfn = GetProcAddress(h, "CreateWebViewEnvironmentWithOptionsInternal");
    if (!pfn) { FreeLibrary(h); return false; }
    return true;
}

void WebView2Host::LoadEmbeddedResources() {
    struct { const wchar_t* name; const char* path; } maps[] = {
        { L"WEB_HTML", "index.html" },
        { L"WEB_CSS",  "css/style.css" },
        { L"WEB_JS",   "js/app.js" },
    };
    for (auto& m : maps) {
        HRSRC hRes = FindResourceW(nullptr, m.name, RT_RCDATA);
        if (!hRes) continue;
        HGLOBAL hData = LoadResource(nullptr, hRes);
        if (!hData) continue;
        const char* pData = (const char*)LockResource(hData);
        DWORD size = SizeofResource(nullptr, hRes);
        if (!pData || size == 0) continue;
        EmbeddedResource r;
        r.data = pData;
        r.size = size;
        if (strstr(m.path, ".css")) r.mime = "text/css";
        else if (strstr(m.path, ".js")) r.mime = "application/javascript";
        else r.mime = "text/html";
        m_resources[m.path] = r;
    }
}

static std::string GetPath(const std::wstring& uri) {
    std::string s = ToNarrow(uri);
    auto pos = s.find("/index.html");
    if (pos == std::string::npos) pos = s.find("/css/");
    if (pos == std::string::npos) pos = s.find("/js/");
    if (pos == std::string::npos) pos = s.find("/img/");
    if (pos != std::string::npos) {
        while (pos > 0 && s[pos - 1] != '/') pos--;
    }
    return (pos != std::string::npos) ? s.substr(pos) : "";
}

static HRESULT STDMETHODCALLTYPE OnWebResourceRequested(
    void* sender, void* args)
{
    if (!g_self || !g_self->IsReady()) return E_FAIL;
    void* web = g_self->m_web;

    void* request = nullptr;
    (*(void(__stdcall**)(void*, void**))(*(uintptr_t*)args + 0x20))(args, &request);
    if (!request) return E_FAIL;

    void* uri = nullptr;
    (*(void(__stdcall**)(void*, void**))(*(uintptr_t*)request + 0x60))(request, &uri);
    std::wstring uriStr = uri ? (const wchar_t*)uri : L"";

    std::string path = GetPath(uriStr);
    auto it = g_self->m_resources.find(path);
    if (it == g_self->m_resources.end()) {
        void* resp = nullptr;
        (*(void(__stdcall**)(void*, int, void**))(*(uintptr_t*)args + 0x30))(args, 404, &resp);
        if (resp) (*(void(__stdcall**)(void*))(*(uintptr_t*)resp + 0x10))(resp);
        if (request) (*(void(__stdcall**)(void*))(*(uintptr_t*)request + 0x10))(request);
        return S_OK;
    }

    IStream* stream = SHCreateMemStream((const BYTE*)it->second.data, (DWORD)it->second.size);
    if (!stream) return E_OUTOFMEMORY;

    void* resp = nullptr;
    std::wstring contentType = ToWide(it->second.mime);
    (*(void(__stdcall**)(void*, int, void*, void**))(*(uintptr_t*)args + 0x28))(args, 200, stream, &resp);
    if (resp) {
        void* headers = nullptr;
        (*(void(__stdcall**)(void*, void**))(*(uintptr_t*)resp + 0x30))(resp, &headers);
        if (headers) {
            std::wstring h = L"Content-Type: " + contentType;
            (*(void(__stdcall**)(void*, const wchar_t*))(*(uintptr_t*)headers + 0x18))(headers, h.c_str());
            (*(void(__stdcall**)(void*))(*(uintptr_t*)headers + 0x10))(headers);
        }
        (*(void(__stdcall**)(void*))(*(uintptr_t*)resp + 0x10))(resp);
    }
    if (stream) stream->Release();
    if (request) (*(void(__stdcall**)(void*))(*(uintptr_t*)request + 0x10))(request);
    return S_OK;
}

static void STDMETHODCALLTYPE OnWebMessageReceived(void* sender, void* args) {
    void* msg = nullptr;
    (*(void(__stdcall**)(void*, void**))(*(uintptr_t*)args + 0x18))(args, &msg);
    if (!msg) return;
    std::wstring ws = (const wchar_t*)msg;
    std::string msgJson = ToNarrow(ws);
    (*(void(__stdcall**)(void*))(*(uintptr_t*)msg + 0x10))(msg);

    if (msgJson.find("\"type\":\"connect\"") != std::string::npos) {
        auto j = json::parse(msgJson, nullptr, false);
        if (j.is_object() && j.contains("host") && j.contains("port")) {
            std::string host = j["host"].get<std::string>();
            int port = j.value("port", 22005);
            if (g_pServers) g_pServers->Connect(host, port);
        }
    } else if (msgJson.find("\"type\":\"refresh\"") != std::string::npos) {
        if (g_pServers) {
            json st; st["type"] = "state";
            auto sv = json::array();
            for (auto& s : g_pServers->GetServers()) {
                json e; e["name"] = s.name; e["host"] = s.host;
                e["port"] = s.port; e["gamemode"] = s.gamemode;
                e["lang"] = s.lang; e["featured"] = s.featured;
                sv.push_back(e);
            }
            st["servers"] = sv; st["admin"] = true; st["updated"] = "";
            g_self->PostWebMessage(ToWide(st.dump()));
        }
    } else if (msgJson.find("\"type\":\"openDiscord\"") != std::string::npos) {
        ShellExecuteW(nullptr, L"open", L"https://discord.gg/VaB6zdEFBy", nullptr, nullptr, SW_SHOW);
    }
}

static void TryCreateController(HWND hWnd, void* env);

static void STDMETHODCALLTYPE OnEnvironmentCreated(void* envResult, void* env) {
    if (!env) return;
    g_self->m_env = env;

    void* ctrlHandler = nullptr;
    (*(void(__stdcall**)(void*, void*, void*, void**))(*(uintptr_t*)env + 0x70))(
        env, nullptr, (void*)g_self->m_parent, &ctrlHandler);

    void* env2 = g_self->m_env;
    void* createHandler = nullptr;
    (*(void(__stdcall**)(void*, void*, void**))(*(uintptr_t*)env2 + 0x78))(
        env2, ctrlHandler, &createHandler);

    if (ctrlHandler) (*(void(__stdcall**)(void*))(*(uintptr_t*)ctrlHandler + 0x10))(ctrlHandler);
}

struct HandlerPair {
    void* handler;
    IUnknown* ref;
};

static void STDMETHODCALLTYPE OnControllerCreated(void* result, void* controller) {
    if (!controller || !g_self) return;
    g_self->m_ctrl = controller;

    void* web = nullptr;
    (*(void(__stdcall**)(void*, void**))(*(uintptr_t*)controller + 0x48))(controller, &web);
    g_self->m_web = web;
    if (!web) return;

    void* handler = nullptr;

    (*(void(__stdcall**)(void*, void*, void*, void**))(*(uintptr_t*)web + 0x1B8))(
        web, (void*)OnWebMessageReceived, nullptr, &handler);
    if (handler) (*(void(__stdcall**)(void*))(*(uintptr_t*)handler + 0x10))(handler);

    (*(void(__stdcall**)(void*, int, const wchar_t*, void*, void**))(*(uintptr_t*)web + 0x1C8))(
        web, 0, L"https://farko.app/*", nullptr, &handler);
    if (handler) (*(void(__stdcall**)(void*))(*(uintptr_t*)handler + 0x10))(handler);

    (*(void(__stdcall**)(void*, void*, void*, void**))(*(uintptr_t*)web + 0x1B8))(
        web, (void*)OnWebResourceRequested, nullptr, &handler);
    if (handler) (*(void(__stdcall**)(void*))(*(uintptr_t*)handler + 0x10))(handler);

    RECT rc; GetClientRect(g_self->m_parent, &rc);
    (*(void(__stdcall**)(void*, RECT*))(*(uintptr_t*)controller + 0x30))(controller, &rc);

    (*(void(__stdcall**)(void*, void*, void**))(*(uintptr_t*)controller + 0x50))(
        controller, nullptr, nullptr);

    std::wstring url = L"https://farko.app/index.html?v=232";
    (*(void(__stdcall**)(void*, const wchar_t*))(*(uintptr_t*)web + 0x28))(web, url.c_str());
}

bool WebView2Host::Begin(HWND hWndParent) {
    m_parent = hWndParent;
    LoadEmbeddedResources();

    std::wstring rt = FindRuntime();
    if (rt.empty()) {
        OutputDebugStringA("WebView2: Runtime not found.\n");
        return false;
    }
    std::wstring dll = rt + L"EBWebView\\x64\\EmbeddedBrowserWebView.dll";
    m_dll = LoadLibraryW(dll.c_str());
    if (!m_dll) return false;

    auto pfnCreate = (HRESULT(WINAPI*)(IUnknown*, IUnknown*, IUnknown*, IUnknown*))
        GetProcAddress(m_dll, "CreateWebViewEnvironmentWithOptionsInternal");
    if (!pfnCreate) return false;

    wchar_t dataPath[MAX_PATH];
    SHGetFolderPathW(nullptr, CSIDL_LOCAL_APPDATA, nullptr, 0, dataPath);
    wcscat_s(dataPath, L"\\FarkoLauncher\\WebView2");
    CreateDirectoryW(dataPath, nullptr);

    void* handler = nullptr;
    (*(void(__stdcall**)(void*, void*, void*, void**))
        GetProcAddress(m_dll, "CreateWebViewEnvironmentWithOptionsInternal"))(
        nullptr, nullptr, nullptr, &handler);

    return true;
}

void WebView2Host::PostWebMessage(const std::wstring& json) {
    if (!m_web) return;
    (*(void(__stdcall**)(void*, const wchar_t*))(*(uintptr_t*)m_web + 0x110))(m_web, json.c_str());
}

void WebView2Host::Resize() {
    if (!m_ctrl || !m_parent) return;
    RECT rc; GetClientRect(m_parent, &rc);
    (*(void(__stdcall**)(void*, RECT*))(*(uintptr_t*)m_ctrl + 0x30))(m_ctrl, &rc);
}
