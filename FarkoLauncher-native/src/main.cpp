#include "app.h"
#include "webview_loader.h"
#include "http.h"
#include "server.h"

#define WM_INIT_WEBVIEW (WM_USER + 0x0800)

static LRESULT CALLBACK WndProc(HWND hWnd, UINT msg, WPARAM wParam, LPARAM lParam) {
    switch (msg) {
    case WM_DESTROY:
        g_bRunning = false;
        PostQuitMessage(0);
        return 0;

    case WM_PAINT: {
        PAINTSTRUCT ps;
        BeginPaint(hWnd, &ps);
        EndPaint(hWnd, &ps);
        return 0;
    }

    case WM_SIZE:
        if (g_pWV) g_pWV->Resize();
        return 0;

    case WM_LBUTTONDOWN:
        if (!g_bDragging) {
            g_bDragging = true;
            POINT pt; GetCursorPos(&pt);
            g_nDragX = pt.x; g_nDragY = pt.y;
            ReleaseCapture();
        }
        return 0;

    case WM_MOUSEMOVE:
        if (g_bDragging) {
            POINT pt; GetCursorPos(&pt);
            int dx = pt.x - g_nDragX;
            int dy = pt.y - g_nDragY;
            RECT rc; GetWindowRect(hWnd, &rc);
            MoveWindow(hWnd, rc.left + dx, rc.top + dy,
                       rc.right - rc.left, rc.bottom - rc.top, TRUE);
            g_nDragX = pt.x; g_nDragY = pt.y;
        }
        return 0;

    case WM_LBUTTONUP:
        g_bDragging = false;
        return 0;

    case WM_INIT_WEBVIEW: {
        g_pWV = new WebView2Host();
        g_pWV->Begin(hWnd);
        g_pHttp = new HttpClient();
        g_pServers = new ServerList(g_pHttp);
        if (g_pWV->IsReady()) {
            g_pServers->Refresh();
        }
        return 0;
    }

    case WM_ERASEBKGND:
        return 1;
    }
    return DefWindowProcW(hWnd, msg, wParam, lParam);
}

int WINAPI wWinMain(HINSTANCE hInst, HINSTANCE, LPWSTR, int) {
    g_hInst = hInst;
    g_bRunning = true;

    CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);

    WNDCLASSEXW wc = {};
    wc.cbSize = sizeof(wc);
    wc.lpfnWndProc = WndProc;
    wc.hInstance = hInst;
    wc.hCursor = LoadCursorW(nullptr, IDC_ARROW);
    wc.hbrBackground = CreateSolidBrush(0x121212);
    wc.lpszClassName = L"FarkoLauncherWeb";
    wc.hIcon = LoadIconW(hInst, MAKEINTRESOURCE(1));
    wc.hIconSm = LoadIconW(hInst, MAKEINTRESOURCE(1));
    RegisterClassExW(&wc);

    int sw = GetSystemMetrics(SM_CXSCREEN);
    int sh = GetSystemMetrics(SM_CYSCREEN);
    int w = 1240, h = 780;
    HWND hWnd = CreateWindowExW(
        WS_EX_LAYERED, wc.lpszClassName, L"Farko Launcher",
        WS_POPUP | WS_VISIBLE,
        (sw - w) / 2, (sh - h) / 2, w, h,
        nullptr, nullptr, hInst, nullptr);

    g_hWnd = hWnd;

    BOOL dark = TRUE;
    DwmSetWindowAttribute(hWnd, 20, &dark, sizeof(dark));
    ShowWindow(hWnd, SW_SHOWDEFAULT);
    UpdateWindow(hWnd);

    PostMessageW(hWnd, WM_INIT_WEBVIEW, 0, 0);

    MSG msg;
    while (g_bRunning && GetMessageW(&msg, nullptr, 0, 0)) {
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }

    delete g_pWV; g_pWV = nullptr;
    delete g_pServers; g_pServers = nullptr;
    delete g_pHttp; g_pHttp = nullptr;

    CoUninitialize();
    return 0;
}
