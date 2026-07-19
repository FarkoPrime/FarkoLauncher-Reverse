#include "app.h"
std::wstring ToWide(const std::string& s) {
    if (s.empty()) return L"";
    int n = MultiByteToWideChar(CP_UTF8, 0, s.c_str(), (int)s.size(), nullptr, 0);
    std::wstring r(n, 0);
    MultiByteToWideChar(CP_UTF8, 0, s.c_str(), (int)s.size(), &r[0], n);
    return r;
}
std::string ToNarrow(const std::wstring& s) {
    if (s.empty()) return "";
    int n = WideCharToMultiByte(CP_UTF8, 0, s.c_str(), (int)s.size(), nullptr, 0, nullptr, nullptr);
    std::string r(n, 0);
    WideCharToMultiByte(CP_UTF8, 0, s.c_str(), (int)s.size(), &r[0], n, nullptr, nullptr);
    return r;
}
bool FileExists2(const std::wstring& p) {
    return GetFileAttributesW(p.c_str()) != INVALID_FILE_ATTRIBUTES;
}
uint32_t Fnv1a(const std::string& s) {
    uint32_t h = 0x811c9dc5;
    for (unsigned char c : s) { h ^= c; h *= 0x1000193; }
    return h;
}
std::string Subdomain(const std::string& name) {
    char b[64]; snprintf(b, sizeof(b), "fl-%08x.gta5rp.com", Fnv1a(name));
    return b;
}
bool Whitelisted(const std::string& d) {
    return d.find(".gta5rp.com") != std::string::npos ||
           d.find(".grandrp.com") != std::string::npos ||
           d.find(".gta5grand.com") != std::string::npos;
}
std::wstring FindRagemp() {
    wchar_t ep[MAX_PATH]; GetModuleFileNameW(nullptr, ep, MAX_PATH);
    std::wstring dir = ep; auto p = dir.find_last_of(L'\\');
    if (p != std::wstring::npos) dir = dir.substr(0, p);
    std::wstring r = dir + L"\\RAGEMP";
    if (FileExists2(r + L"\\updater.exe")) return r;
    if (FileExists2(L"C:\\RAGEMP\\updater.exe")) return L"C:\\RAGEMP";
    wchar_t ev[MAX_PATH];
    if (GetEnvironmentVariableW(L"RAGEMP_PATH", ev, MAX_PATH) > 0)
        if (FileExists2(std::wstring(ev) + L"\\updater.exe")) return ev;
    return L"";
}
std::wstring GetDataDir() {
    wchar_t* p = nullptr;
    if (SUCCEEDED(SHGetKnownFolderPath(FOLDERID_LocalAppData, 0, nullptr, &p))) {
        std::wstring d = p; CoTaskMemFree(p);
        return d + L"\\FarkoLauncher";
    }
    wchar_t t[MAX_PATH];
    if (GetTempPathW(MAX_PATH, t)) return std::wstring(t) + L"\\FarkoLauncher";
    return L"";
}
