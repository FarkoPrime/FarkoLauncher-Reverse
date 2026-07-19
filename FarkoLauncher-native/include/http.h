#pragma once
#include "app.h"
class HttpClient {
public:
    HttpClient();
    ~HttpClient();
    std::string Get(const std::wstring& url);
    std::string FetchMasterList();
private:
    HINTERNET m_session = nullptr;
};
