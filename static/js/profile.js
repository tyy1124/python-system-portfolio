function previewProfileAvatar(input) {
  const preview = document.getElementById("profileAvatarPreview");
  const resetCheckbox = document.getElementById("resetAvatar");

  if (!preview || !input.files || !input.files[0]) {
    return;
  }

  const file = input.files[0];

  if (file.size > 2 * 1024 * 1024) {
    alert("大頭貼檔案不可超過 2 MB");
    input.value = "";
    return;
  }

  if (resetCheckbox) {
    resetCheckbox.checked = false;
  }

  const temporaryUrl = URL.createObjectURL(file);
  preview.src = temporaryUrl;
}


function toggleDefaultAvatarPreview(checkbox) {
  const preview = document.getElementById("profileAvatarPreview");
  const fileInput = document.getElementById("profileAvatar");

  if (!preview) {
    return;
  }

  if (checkbox.checked) {
    preview.src = preview.dataset.defaultUrl;

    if (fileInput) {
      fileInput.value = "";
    }
  } else {
    preview.src = preview.dataset.currentUrl;
  }
}


function resetProfileAvatarPreview() {
  window.setTimeout(() => {
    const preview = document.getElementById("profileAvatarPreview");
    const resetCheckbox = document.getElementById("resetAvatar");

    if (preview) {
      preview.src = preview.dataset.currentUrl;
    }

    if (resetCheckbox) {
      resetCheckbox.checked = false;
    }
  }, 0);
}


function updateGlobalProfileDisplay() {
  const profileData = document.getElementById("profileUpdateData");

  if (!profileData) {
    return;
  }

  const avatarUrl = profileData.dataset.avatarUrl;
  const userName = profileData.dataset.userName;

  if (avatarUrl) {
    const separator = avatarUrl.includes("?") ? "&" : "?";
    const avatarUrlWithVersion =
      `${avatarUrl}${separator}v=${Date.now()}`;

    document
      .querySelectorAll(".user-avatar-image")
      .forEach(image => {
        image.src = avatarUrlWithVersion;
      });
  }

  if (userName) {
    document
      .querySelectorAll(".user-display-name")
      .forEach(element => {
        element.textContent = userName;
      });
  }
}


function submitProfileForm(form) {
  const mainContent = document.getElementById("mainContent");
  const submitButton = form.querySelector(
    'button[type="submit"]'
  );

  if (!mainContent) {
    return false;
  }

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.innerHTML = "儲存中...";
  }

  const formData = new FormData(form);

  fetch(form.action, {
    method: "POST",
    body: formData,
    credentials: "same-origin",
    headers: {
      "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]')?.content || ""
    }
  })
    .then(response => {
      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`
        );
      }

      return response.text();
    })
    .then(html => {
      mainContent.innerHTML = html;
      updateGlobalProfileDisplay();
    })
    .catch(error => {
      console.error(
        "更新個人資料失敗：",
        error
      );

      alert(
        "更新個人資料失敗，請稍後再試。"
      );

      if (submitButton) {
        submitButton.disabled = false;
        submitButton.innerHTML = "儲存變更";
      }
    });

  return false;
}
