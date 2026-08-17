document.addEventListener("DOMContentLoaded", function () {
    const form = document.getElementById("registerForm");

    if (!form) {
        return;
    }

    const accountInput = document.getElementById("account");
    const passwordInput = document.getElementById("password");
    const accountMessage = document.getElementById("accountMessage");
    const passwordMessage = document.getElementById("passwordMessage");
    const actionButtons = form.querySelectorAll(".register-action-button");
    const checkAccountUrl = form.dataset.checkAccountUrl;

    let accountAvailable = null;
    let checkTimer = null;
    let checkingAccount = false;

    function setAccountMessage(message, state) {
        accountMessage.textContent = message;
        accountMessage.classList.remove(
            "is-error",
            "is-success",
            "is-checking"
        );

        if (state) {
            accountMessage.classList.add(state);
        }
    }

    function setButtonsDisabled(disabled) {
        actionButtons.forEach(function (button) {
            button.disabled = disabled;
        });
    }

    function validatePassword() {
        const length = passwordInput.value.length;

        passwordMessage.classList.remove(
            "is-error",
            "is-success"
        );

        if (length === 0) {
            passwordMessage.textContent = "密碼長度需為 6～20 個字元";
            return false;
        }

        if (length < 6 || length > 20) {
            passwordMessage.textContent = "密碼長度必須為 6～20 個字元";
            passwordMessage.classList.add("is-error");
            return false;
        }

        passwordMessage.textContent = "密碼長度符合要求";
        passwordMessage.classList.add("is-success");
        return true;
    }

    async function checkAccountAvailability() {
        const account = accountInput.value.trim();

        if (!account) {
            accountAvailable = false;
            setAccountMessage("請輸入帳號", "is-error");
            setButtonsDisabled(false);
            return false;
        }

        checkingAccount = true;
        accountAvailable = null;
        setAccountMessage("正在檢查帳號……", "is-checking");
        setButtonsDisabled(true);

        try {
            const url = new URL(
                checkAccountUrl,
                window.location.origin
            );

            url.searchParams.set("account", account);

            const response = await fetch(url.toString(), {
                method: "GET",
                credentials: "same-origin",
                headers: {
                    "Accept": "application/json"
                }
            });

            const result = await response.json();

            accountAvailable = Boolean(result.available);

            setAccountMessage(
                result.message,
                accountAvailable ? "is-success" : "is-error"
            );

            return accountAvailable;

        } catch (error) {
            accountAvailable = null;
            setAccountMessage(
                "暫時無法檢查帳號，送出時系統仍會再次確認",
                "is-checking"
            );
            return null;

        } finally {
            checkingAccount = false;
            setButtonsDisabled(false);
        }
    }

    accountInput.addEventListener("input", function () {
        accountAvailable = null;
        window.clearTimeout(checkTimer);

        if (!accountInput.value.trim()) {
            setAccountMessage("", null);
            return;
        }

        setAccountMessage("停止輸入後會自動檢查", "is-checking");

        checkTimer = window.setTimeout(
            checkAccountAvailability,
            450
        );
    });

    accountInput.addEventListener(
        "blur",
        checkAccountAvailability
    );

    passwordInput.addEventListener(
        "input",
        validatePassword
    );

    form.addEventListener("submit", async function (event) {
        const submitter = event.submitter || null;
        const passwordValid = validatePassword();

        if (!passwordValid) {
            event.preventDefault();
            passwordInput.focus();
            return;
        }

        if (checkingAccount) {
            event.preventDefault();
            return;
        }

        if (accountAvailable === false) {
            event.preventDefault();
            accountInput.focus();
            return;
        }

        if (accountAvailable === null) {
            event.preventDefault();

            const available = await checkAccountAvailability();

            if (available) {
                if (submitter) {
                    form.requestSubmit(submitter);
                } else {
                    form.requestSubmit();
                }
            } else {
                accountInput.focus();
            }
        }
    });

    if (accountInput.value.trim()) {
        checkAccountAvailability();
    }

    validatePassword();
});
