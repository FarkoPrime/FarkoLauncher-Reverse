#pragma once
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef UNICODE
#define UNICODE
#endif
#ifndef _UNICODE
#define _UNICODE
#endif
#include <windows.h>
#include <dwmapi.h>
#include <shellapi.h>
#include <shlobj.h>
#include <shlwapi.h>
#include <winhttp.h>
#include <iphlpapi.h>
#include <winreg.h>
#include <objbase.h>
#include <shobjidl.h>
#include <winsock2.h>
#include <ws2tcpip.h>
#include <string>
#include <vector>
#include <fstream>
#include <sstream>
#include <memory>
#include <map>
#include <algorithm>
#include "nlohmann/json.hpp"

using json = nlohmann::json;

struct ServerInfo {
    std::string name, host, gamemode, lang;
    int port = 22005;
    bool featured = false;
};

class WebView2Host;
class HttpClient;
class ServerList;

inline HWND g_hWnd = nullptr;
inline HINSTANCE g_hInst = nullptr;
inline bool g_bRunning = false;
inline bool g_bDragging = false;
inline int g_nDragX = 0, g_nDragY = 0;
inline WebView2Host* g_pWV = nullptr;
inline ServerList* g_pServers = nullptr;
inline HttpClient* g_pHttp = nullptr;

constexpr const wchar_t* kHostsFile = L"C:\\Windows\\System32\\drivers\\etc\\hosts";
constexpr const char* kHostsBegin = "# === FarkoLauncher BEGIN ===";
constexpr const char* kHostsEnd = "# === FarkoLauncher END ===";

std::wstring ToWide(const std::string& s);
std::string ToNarrow(const std::wstring& s);
bool FileExists2(const std::wstring& path);
uint32_t Fnv1a(const std::string& s);
std::string Subdomain(const std::string& name);
bool Whitelisted(const std::string& domain);
std::wstring FindRagemp();
std::wstring GetDataDir();
