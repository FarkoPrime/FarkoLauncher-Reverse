#include "app.h"
#include "server.h"
#include "http.h"
#include "webview_loader.h"

ServerList::ServerList(HttpClient* http) : m_http(http) {}

bool ServerList::Refresh() {
    std::string raw = m_http->FetchMasterList();
    if (raw.empty()) return false;
    try {
        auto j = json::parse(raw);
        m_servers.clear();
        if (j.contains("servers") && j["servers"].is_array())
            for (auto& e : j["servers"]) {
                ServerInfo s;
                s.name = e.value("name", ""); s.host = e.value("host", "");
                s.port = e.value("port", 22005); s.gamemode = e.value("gamemode", "");
                s.lang = e.value("lang", ""); s.featured = e.value("featured", false);
                m_servers.push_back(s);
            }
        if (g_pWV && g_pWV->IsReady()) {
            json st; st["type"] = "state"; st["servers"] = j["servers"];
            st["admin"] = true; st["updated"] = "";
            g_pWV->PostWebMessage(ToWide(st.dump()));
        }
        return true;
    } catch (...) { return false; }
}

bool ServerList::Connect(const std::string& host, int port) {
    if (host.empty()) return false;
    std::string ip = host; bool needHosts = false;
    struct in_addr a;
    if (inet_pton(AF_INET, host.c_str(), &a) != 1 && !Whitelisted(host)) {
        ip = Subdomain(host); needHosts = true;
    }
    std::string ps = std::to_string(port);
    HKEY hk;
    if (RegCreateKeyExA(HKEY_CURRENT_USER, "Software\\RAGE-MP", 0, nullptr, 0, KEY_WRITE, nullptr, &hk, nullptr) == ERROR_SUCCESS) {
        RegSetValueExA(hk, "launch2.ip", 0, REG_SZ, (const BYTE*)ip.c_str(), (DWORD)ip.size() + 1);
        RegSetValueExA(hk, "launch2.port", 0, REG_SZ, (const BYTE*)ps.c_str(), (DWORD)ps.size() + 1);
        RegCloseKey(hk);
    }
    if (needHosts) UpdateHosts(host, ip);
    std::wstring rd = FindRagemp();
    if (rd.empty()) return false;
    std::wstring up = rd + L"\\updater.exe";
    if (!FileExists2(up)) return false;
    std::wstring cmd = L"\"" + up + L"\"";
    STARTUPINFOW si = { sizeof(si) }; PROCESS_INFORMATION pi = {};
    if (CreateProcessW(up.c_str(), &cmd[0], nullptr, nullptr, FALSE, 0, nullptr, rd.c_str(), &si, &pi)) {
        CloseHandle(pi.hThread); CloseHandle(pi.hProcess); return true;
    }
    SHELLEXECUTEINFOW sei = { sizeof(sei) };
    sei.fMask = SEE_MASK_NOCLOSEPROCESS; sei.lpVerb = L"open";
    sei.lpFile = up.c_str(); sei.lpDirectory = rd.c_str(); sei.nShow = SW_SHOWDEFAULT;
    if (ShellExecuteExW(&sei) && sei.hProcess) CloseHandle(sei.hProcess);
    return true;
}

std::string ServerList::Resolve(const std::string& host) {
    struct in_addr a;
    if (inet_pton(AF_INET, host.c_str(), &a) == 1) return host;
    struct addrinfo h = {}, *r = nullptr; h.ai_family = AF_INET; h.ai_socktype = SOCK_STREAM;
    if (getaddrinfo(host.c_str(), nullptr, &h, &r) == 0 && r) {
        char ip[INET_ADDRSTRLEN]; auto* sa = (sockaddr_in*)r->ai_addr;
        inet_ntop(AF_INET, &sa->sin_addr, ip, sizeof(ip)); freeaddrinfo(r); return ip;
    }
    return "";
}

void ServerList::UpdateHosts(const std::string& real, const std::string& fake) {
    std::string ip = Resolve(real); if (ip.empty()) return;
    std::ifstream in(kHostsFile); std::vector<std::string> ls; std::string l;
    while (std::getline(in, l))
        if (l.find(kHostsBegin) == std::string::npos && l.find(kHostsEnd) == std::string::npos &&
            !(l.find("fl-") != std::string::npos && l.find(".gta5rp.com") != std::string::npos))
            ls.push_back(l);
    in.close();
    ls.push_back(kHostsBegin); ls.push_back(ip + "\t" + fake); ls.push_back(kHostsEnd);
    std::ofstream out(kHostsFile); for (auto& s : ls) out << s << "\n";
}

void ServerList::CleanupHosts() {
    std::ifstream in(kHostsFile); std::vector<std::string> ls; std::string l; bool skip = false;
    while (std::getline(in, l)) {
        if (l.find(kHostsBegin) != std::string::npos) { skip = true; continue; }
        if (skip && l.find(kHostsEnd) != std::string::npos) { skip = false; continue; }
        if (!skip) ls.push_back(l);
    }
    in.close();
    std::ofstream out(kHostsFile); for (auto& s : ls) out << s << "\n";
}
