#pragma once
#include "app.h"
class HttpClient;
class ServerList {
public:
    ServerList(HttpClient* http);
    bool Refresh();
    const std::vector<ServerInfo>& GetServers() const { return m_servers; }
    bool Connect(const std::string& host, int port);
private:
    void UpdateHosts(const std::string& real, const std::string& fake);
    void CleanupHosts();
    std::string Resolve(const std::string& host);
    HttpClient* m_http;
    std::vector<ServerInfo> m_servers;
};
