#include "http.h"
HttpClient::HttpClient() {
    m_session = WinHttpOpen(L"Launcher/1.0", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
        WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
}
HttpClient::~HttpClient() { if (m_session) WinHttpCloseHandle(m_session); }

std::string HttpClient::Get(const std::wstring& url) {
    std::string res;
    URL_COMPONENTS uc = {}; uc.dwStructSize = sizeof(uc);
    uc.dwSchemeLength = uc.dwHostNameLength = uc.dwUrlPathLength = uc.dwExtraInfoLength = 1;
    if (!WinHttpCrackUrl(url.c_str(), 0, 0, &uc)) return res;
    std::wstring host(uc.lpszHostName, uc.dwHostNameLength);
    std::wstring path(uc.lpszUrlPath, uc.dwUrlPathLength);
    std::wstring extra;
    if (uc.dwExtraInfoLength > 0) extra.assign(uc.lpszExtraInfo, uc.dwExtraInfoLength);
    bool https = uc.nScheme == INTERNET_SCHEME_HTTPS;
    HINTERNET hc = WinHttpConnect(m_session, host.c_str(), uc.nPort, 0);
    if (!hc) return res;
    HINTERNET hr = WinHttpOpenRequest(hc, L"GET", (path + extra).c_str(), nullptr,
        WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, https ? WINHTTP_FLAG_SECURE : 0);
    if (!hr) { WinHttpCloseHandle(hc); return res; }
    if (https) {
        DWORD f = SECURITY_FLAG_IGNORE_UNKNOWN_CA | SECURITY_FLAG_IGNORE_CERT_DATE_INVALID |
                  SECURITY_FLAG_IGNORE_CERT_CN_INVALID | SECURITY_FLAG_IGNORE_CERT_WRONG_USAGE;
        WinHttpSetOption(hr, WINHTTP_OPTION_SECURITY_FLAGS, &f, sizeof(f));
    }
    std::wstring acc = L"Accept: application/vnd.github.raw+json\r\n";
    WinHttpAddRequestHeaders(hr, acc.c_str(), (DWORD)acc.length(), WINHTTP_ADDREQ_FLAG_ADD);
    if (!WinHttpSendRequest(hr, WINHTTP_NO_ADDITIONAL_HEADERS, 0, WINHTTP_NO_REQUEST_DATA, 0, 0, 0) ||
        !WinHttpReceiveResponse(hr, nullptr)) {
        WinHttpCloseHandle(hr); WinHttpCloseHandle(hc); return res;
    }
    DWORD avail = 0;
    while (WinHttpQueryDataAvailable(hr, &avail) && avail > 0) {
        std::vector<char> buf(avail); DWORD rd = 0;
        if (WinHttpReadData(hr, buf.data(), avail, &rd)) res.append(buf.data(), rd);
        avail = 0;
    }
    WinHttpCloseHandle(hr); WinHttpCloseHandle(hc);
    return res;
}

std::string HttpClient::FetchMasterList() {
    return Get(L"https://api.github.com/repos/FarkoPanich/Masterlist/contents/servers.json");
}
