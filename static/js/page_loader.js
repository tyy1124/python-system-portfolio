// === 動態載入 JS，避免重複載入 ===
function loadScriptOnce(scriptId, scriptSrc, callback) {
  const oldScript = document.getElementById(scriptId);

  if (oldScript !== null) {
    if (callback) {
      callback();
    }

    return;
  }

  const script = document.createElement("script");
  script.id = scriptId;
  script.src = scriptSrc;

  script.onload = function () {
    if (callback) {
      callback();
    }
  };

  script.onerror = function () {
    console.log("JS 載入失敗：", scriptSrc);
  };

  document.body.appendChild(script);
}


// === 載入 2D小遊戲需要的 JS ===
function loadPlatformGameScripts() {
  // home.html 已預先載入遊戲資料與本體時，直接啟動，避免重複下載與重複建立事件。
  if (
    window.platformGameData
    && typeof window.initPlatformGame === "function"
  ) {
    window.initPlatformGame();
    return;
  }

  loadScriptOnce(
    "platformGameLevelsScript",
    "/static/js/platform_game_levels.js",
    function () {
      loadScriptOnce(
        "platformGameScript",
        "/static/js/platform_game.js",
        function () {
          if (typeof window.initPlatformGame === "function") {
            window.initPlatformGame();
          } else {
            console.log("找不到 initPlatformGame，請確認 platform_game.js 是否正確載入");
          }
        }
      );
    }
  );
}


// === 啟動目前 AJAX 載入頁面所需的功能 ===
function initializeDynamicPageFeatures() {
  // === 2D小遊戲 ===
  if (document.getElementById("gameCanvas") !== null) {
    loadPlatformGameScripts();
  }

  // === 醫療資料分析 ===
  if (
    document.getElementById("medicalAnalysisPage") !== null
    && typeof initMedicalAnalysis === "function"
  ) {
    initMedicalAnalysis();
  }


  // === 人工膝關節醫療品質分析與資料工作台 ===
  if (
    document.getElementById("kneeQualityAnalysisPage") !== null
    && typeof initKneeQualityAnalysis === "function"
  ) {
    initKneeQualityAnalysis();
  }
}


// === 載入右側 mainContent 頁面 ===
function loadPage(url, saveHash = true) {

  // === 如果上一頁是遊戲頁，先停止遊戲迴圈 ===
  if (typeof cleanupPlatformGame === "function") {
    cleanupPlatformGame();
  }

  if (typeof cleanupMedicalAnalysis === "function") {
    cleanupMedicalAnalysis();
  }


  if (typeof cleanupKneeQualityAnalysis === "function") {
    cleanupKneeQualityAnalysis();
  }

  fetch(url, {
    headers: {
      "X-Requested-With": "XMLHttpRequest"
    }
  })
    .then(async response => {
      const html = await response.text();

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return html;
    })
    .then(html => {
      document.getElementById("mainContent").innerHTML = html;

      // === 記住目前頁面，讓 F5 後可以回到同一頁 ===
      if (saveHash === true) {
        sessionStorage.setItem("currentPageUrl", url);
        history.replaceState(null, "", "#" + encodeURIComponent(url));
      }

      // === 啟動目前頁面需要的遊戲或圖表功能 ===
      initializeDynamicPageFeatures();
    })
    .catch(error => {
      document.getElementById("mainContent").innerHTML = `
        <div class="alert alert-danger" role="alert">
          <strong>頁面載入失敗</strong><br>
          伺服器回傳錯誤，請重新整理後再試。
        </div>
      `;
      console.error("loadPage 發生錯誤：", error);
    });
}


// === 恢復右側頁面 ===
function restoreCurrentPage() {
  let savedUrl = sessionStorage.getItem("currentPageUrl") || "";

  // === 只接受 # 後面是 / 開頭的頁面網址 ===
  // 避免 Bootstrap 的 #schoolAssignment、#My_Creation 被誤當成頁面網址
  if (location.hash && location.hash !== "#") {
    const hashValue = decodeURIComponent(location.hash.substring(1));

    if (hashValue.startsWith("/")) {
      savedUrl = hashValue;
    }
  }

  if (savedUrl !== "") {
    loadPage(savedUrl, false);
  }
}


// === 恢復 Bootstrap collapse 選單狀態 ===
function restoreBootstrapCollapseMenus() {
  const collapseMenus = document.querySelectorAll("#sidebar .collapse[id]");

  collapseMenus.forEach(function (menu) {
    const menuId = menu.id;
    const savedState = localStorage.getItem("sidebar_collapse_" + menuId);

    const trigger = document.querySelector(
      '[data-bs-toggle="collapse"][href="#' + menuId + '"], ' +
      '[data-bs-target="#' + menuId + '"]'
    );

    if (savedState === "open") {
      menu.classList.add("show");

      if (trigger !== null) {
        trigger.setAttribute("aria-expanded", "true");
        trigger.classList.remove("collapsed");
      }
    }

    if (savedState === "closed") {
      menu.classList.remove("show");

      if (trigger !== null) {
        trigger.setAttribute("aria-expanded", "false");
        trigger.classList.add("collapsed");
      }
    }

    menu.addEventListener("shown.bs.collapse", function () {
      localStorage.setItem("sidebar_collapse_" + menuId, "open");
    });

    menu.addEventListener("hidden.bs.collapse", function () {
      localStorage.setItem("sidebar_collapse_" + menuId, "closed");
    });
  });
}


// === 恢復你自己寫的子選單狀態 ===
function restoreManualSubMenus() {
  const manualMenuIds = [
    "machineLearningMenu",
    "deepLearningMenu"
  ];

  manualMenuIds.forEach(function (menuId) {
    const menu = document.getElementById(menuId);

    if (menu === null) {
      return;
    }

    const savedState = localStorage.getItem("sidebar_manual_" + menuId);

    if (savedState === "open") {
      menu.style.display = "block";
    }

    if (savedState === "closed") {
      menu.style.display = "none";
    }
  });
}


// === 頁面載入完成後，恢復右側頁面與左側選單 ===
document.addEventListener("DOMContentLoaded", function () {
  restoreBootstrapCollapseMenus();
  restoreManualSubMenus();
  restoreCurrentPage();
});


// === AJAX 表單送出，並把結果更新到 mainContent ===
function submitPageForm(form) {
  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content || "";
  fetch(form.action, {
    method: form.method,
    body: new FormData(form),
    credentials: "same-origin",
    headers: {
      "X-CSRF-Token": csrfToken
    }
  })
    .then(response => response.text())
    .then(html => {
      document.getElementById("mainContent").innerHTML = html;

      // === 啟動表單回傳頁面需要的遊戲或圖表功能 ===
      initializeDynamicPageFeatures();
    })
    .catch(error => {
      document.getElementById("mainContent").innerHTML = "<p style='color:red;'>表單送出失敗</p>";
      console.log(error);
    });

  return false;
}


// === 側邊欄子選單展開 / 收合 ===
function toggleSubMenu(menuId) {
  const menu = document.getElementById(menuId);

  if (menu === null) {
    return false;
  }

  if (menu.style.display === "none" || menu.style.display === "") {
    menu.style.display = "block";
    localStorage.setItem("sidebar_manual_" + menuId, "open");
  } else {
    menu.style.display = "none";
    localStorage.setItem("sidebar_manual_" + menuId, "closed");
  }

  return false;
}
// === 共用 AJAX 導覽：支援動態載入後新增的連結 ===
// 只要連結加上 data-load-page，就會在右側 mainContent 顯示。
document.addEventListener("click", function (event) {
  const link = event.target.closest("a[data-load-page]");

  if (link === null) {
    return;
  }

  const target = link.getAttribute("target");

  if (target === "_blank") {
    return;
  }

  const url = link.getAttribute("href") || link.dataset.url || "";

  if (!url || url === "#") {
    return;
  }

  event.preventDefault();
  loadPage(url);
});
