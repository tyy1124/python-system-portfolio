document.addEventListener("DOMContentLoaded", function () {
    const body = document.body;
    const toggleButton = document.getElementById("themeToggle");

    if (!toggleButton) {
        return;
    }

    const toggleIcon = toggleButton.querySelector(".theme-toggle-icon i");
    const toggleLabel = toggleButton.querySelector(".theme-toggle-label");
    const updateUrl = toggleButton.dataset.updateUrl;

    function applyTheme(themeMode) {
        const isDark = themeMode === "dark";

        body.dataset.theme = isDark ? "dark" : "light";
        toggleButton.setAttribute(
            "aria-pressed",
            isDark ? "true" : "false"
        );

        toggleButton.setAttribute(
            "aria-label",
            isDark ? "切換成一般模式" : "切換成深色模式"
        );

        toggleButton.title = isDark
            ? "目前為深色模式，點擊切換成一般模式"
            : "目前為一般模式，點擊切換成深色模式";

        if (toggleIcon) {
            toggleIcon.className = isDark
                ? "fa fa-sun-o"
                : "fa fa-moon-o";
        }

        if (toggleLabel) {
            toggleLabel.textContent = isDark
                ? "一般"
                : "深色";
        }


        // === 通知互動圖表重新套用一般／深色配色 ===
        document.dispatchEvent(
            new CustomEvent("tyy-theme-changed", {
                detail: {
                    themeMode: isDark ? "dark" : "light"
                }
            })
        );
    }

    applyTheme(body.dataset.theme || "light");

    toggleButton.addEventListener("click", async function () {
        const previousTheme = body.dataset.theme || "light";
        const nextTheme = previousTheme === "dark"
            ? "light"
            : "dark";

        applyTheme(nextTheme);
        toggleButton.disabled = true;

        try {
            const response = await fetch(updateUrl, {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]')?.content || ""
                },
                body: JSON.stringify({
                    theme_mode: nextTheme
                })
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(
                    result.message || "無法儲存顯示模式"
                );
            }

            applyTheme(result.theme_mode);

        } catch (error) {
            applyTheme(previousTheme);
            window.alert(
                error.message || "顯示模式儲存失敗，請稍後再試"
            );

        } finally {
            toggleButton.disabled = false;
        }
    });
});
