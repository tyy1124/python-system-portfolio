document.addEventListener("DOMContentLoaded", function () {
    const togglePassword = document.getElementById("togglePassword");
    const passwordInput = document.getElementById("password");
    const form = document.getElementById("signinForm");
    const accountInput = document.getElementById("account");
    const statusMessage = document.getElementById("statusMessage");

    togglePassword.addEventListener("click", function () {
        if (passwordInput.type === "password") {
            passwordInput.type = "text";
            togglePassword.textContent = "隱藏";
        } else {
            passwordInput.type = "password";
            togglePassword.textContent = "顯示";
        }
    });

    form.addEventListener("submit", function (e) {
        const account = accountInput.value.trim();
        const password = passwordInput.value.trim();

        statusMessage.textContent = "";
        statusMessage.classList.remove("success");

        if (account === "" || password === "") {
            e.preventDefault();
            statusMessage.textContent = "請輸入帳號與密碼";
            return;
        }

        // 如果你目前只是先看畫面，還沒有後端處理
        // 可以先取消下面這行註解，避免真的送出
        // e.preventDefault();
        // statusMessage.textContent = "表單格式正確，之後可接 Flask 後端";
        // statusMessage.classList.add("success");
    });
});