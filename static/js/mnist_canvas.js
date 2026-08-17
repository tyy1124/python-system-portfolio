(function () {
  "use strict";

  function initAllMnistCanvases() {
    const apps = document.querySelectorAll(
      ".mnist-handwriting-app:not([data-mnist-initialized])"
    );

    apps.forEach(initMnistCanvas);
  }

  function initMnistCanvas(app) {
    app.setAttribute("data-mnist-initialized", "true");

    const canvas = app.querySelector(".mnist-drawing-canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });

    const clearButton = app.querySelector(".mnist-clear-button");
    const predictButton = app.querySelector(".mnist-predict-button");
    const drawingStatus = app.querySelector(".mnist-drawing-status");

    const placeholder = app.querySelector(".mnist-result-placeholder");
    const resultContent = app.querySelector(".mnist-result-content");
    const predictedNumber = app.querySelector(".mnist-predicted-number");
    const confidenceText = app.querySelector(".mnist-confidence-text");
    const previewCanvas = app.querySelector(".mnist-preview-canvas");

    const correctButton = app.querySelector(".mnist-feedback-correct");
    const wrongButton = app.querySelector(".mnist-feedback-wrong");
    const correctLabelPanel = app.querySelector(".mnist-correct-label-panel");
    const digitButtons = app.querySelectorAll(".mnist-digit-button");
    const feedbackMessage = app.querySelector(".mnist-feedback-message");

    let isDrawing = false;
    let hasInk = false;
    let sampleId = null;

    resetCanvas();

    canvas.addEventListener("pointerdown", startDrawing);
    canvas.addEventListener("pointermove", draw);
    canvas.addEventListener("pointerup", stopDrawing);
    canvas.addEventListener("pointercancel", stopDrawing);
    canvas.addEventListener("pointerleave", stopDrawing);

    clearButton.addEventListener("click", resetEverything);
    predictButton.addEventListener("click", predictDrawing);
    correctButton.addEventListener("click", function () {
      submitFeedback(true, null);
    });
    wrongButton.addEventListener("click", function () {
      correctLabelPanel.classList.remove("d-none");
      feedbackMessage.classList.add("d-none");
    });

    digitButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        const correctLabel = Number(button.dataset.correctLabel);
        submitFeedback(false, correctLabel);
      });
    });

    function resetCanvas() {
      context.save();
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.restore();

      context.lineCap = "round";
      context.lineJoin = "round";
      context.strokeStyle = "#050505";
      context.lineWidth = 22;

      hasInk = false;
      drawingStatus.textContent = "尚未書寫";
    }

    function resetEverything() {
      resetCanvas();
      sampleId = null;

      placeholder.classList.remove("d-none");
      resultContent.classList.add("d-none");
      correctLabelPanel.classList.add("d-none");
      feedbackMessage.classList.add("d-none");

      enableFeedbackButtons(true);
      predictButton.disabled = false;
      predictButton.innerHTML = '<i class="fa fa-search me-1"></i>開始辨識';
    }

    function getPointerPosition(event) {
      const rectangle = canvas.getBoundingClientRect();

      return {
        x: (event.clientX - rectangle.left) * (canvas.width / rectangle.width),
        y: (event.clientY - rectangle.top) * (canvas.height / rectangle.height)
      };
    }

    function startDrawing(event) {
      event.preventDefault();
      isDrawing = true;
      hasInk = true;
      drawingStatus.textContent = "已完成書寫";

      canvas.setPointerCapture(event.pointerId);

      const position = getPointerPosition(event);
      context.beginPath();
      context.moveTo(position.x, position.y);
      context.lineTo(position.x + 0.01, position.y + 0.01);
      context.stroke();
    }

    function draw(event) {
      if (!isDrawing) {
        return;
      }

      event.preventDefault();

      const position = getPointerPosition(event);
      context.lineTo(position.x, position.y);
      context.stroke();
    }

    function stopDrawing(event) {
      if (!isDrawing) {
        return;
      }

      isDrawing = false;
      context.closePath();

      if (event.pointerId !== undefined && canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    }

    function preprocessCanvas() {
      const width = canvas.width;
      const height = canvas.height;
      const imageData = context.getImageData(0, 0, width, height);
      const data = imageData.data;

      let minX = width;
      let minY = height;
      let maxX = -1;
      let maxY = -1;

      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const index = (y * width + x) * 4;
          const gray = (data[index] + data[index + 1] + data[index + 2]) / 3;
          const ink = 255 - gray;

          if (ink > 20) {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
      }

      if (maxX < minX || maxY < minY) {
        throw new Error("畫布是空白的，請先寫一個數字");
      }

      const padding = 8;
      minX = Math.max(0, minX - padding);
      minY = Math.max(0, minY - padding);
      maxX = Math.min(width - 1, maxX + padding);
      maxY = Math.min(height - 1, maxY + padding);

      const sourceWidth = maxX - minX + 1;
      const sourceHeight = maxY - minY + 1;

      const targetCanvas = document.createElement("canvas");
      targetCanvas.width = 28;
      targetCanvas.height = 28;

      const targetContext = targetCanvas.getContext("2d", { willReadFrequently: true });
      targetContext.fillStyle = "#ffffff";
      targetContext.fillRect(0, 0, 28, 28);
      targetContext.imageSmoothingEnabled = true;
      targetContext.imageSmoothingQuality = "high";

      const scale = Math.min(20 / sourceWidth, 20 / sourceHeight);
      const drawWidth = Math.max(1, Math.round(sourceWidth * scale));
      const drawHeight = Math.max(1, Math.round(sourceHeight * scale));
      const drawX = Math.floor((28 - drawWidth) / 2);
      const drawY = Math.floor((28 - drawHeight) / 2);

      targetContext.drawImage(
        canvas,
        minX,
        minY,
        sourceWidth,
        sourceHeight,
        drawX,
        drawY,
        drawWidth,
        drawHeight
      );

      const targetData = targetContext.getImageData(0, 0, 28, 28).data;
      const pixels = new Array(784);

      let totalWeight = 0;
      let weightedX = 0;
      let weightedY = 0;

      for (let y = 0; y < 28; y += 1) {
        for (let x = 0; x < 28; x += 1) {
          const rgbaIndex = (y * 28 + x) * 4;
          const gray = (
            targetData[rgbaIndex]
            + targetData[rgbaIndex + 1]
            + targetData[rgbaIndex + 2]
          ) / 3;

          const value = Math.max(0, Math.min(1, 1 - (gray / 255)));
          const pixelIndex = y * 28 + x;
          pixels[pixelIndex] = value;

          totalWeight += value;
          weightedX += x * value;
          weightedY += y * value;
        }
      }

      // === 依照重心再次置中，讓格式更接近原始 MNIST ===
      if (totalWeight > 0) {
        const centerX = weightedX / totalWeight;
        const centerY = weightedY / totalWeight;
        const shiftX = Math.round(13.5 - centerX);
        const shiftY = Math.round(13.5 - centerY);

        return shiftPixels(pixels, shiftX, shiftY);
      }

      return pixels;
    }

    function shiftPixels(sourcePixels, shiftX, shiftY) {
      const shiftedPixels = new Array(784).fill(0);

      for (let y = 0; y < 28; y += 1) {
        for (let x = 0; x < 28; x += 1) {
          const newX = x + shiftX;
          const newY = y + shiftY;

          if (newX >= 0 && newX < 28 && newY >= 0 && newY < 28) {
            shiftedPixels[newY * 28 + newX] = sourcePixels[y * 28 + x];
          }
        }
      }

      return shiftedPixels;
    }

    async function predictDrawing() {
      if (!hasInk) {
        showFeedbackMessage("請先在畫布上寫一個數字", "danger");
        return;
      }

      let pixels;

      try {
        pixels = preprocessCanvas();
      } catch (error) {
        showFeedbackMessage(error.message, "danger");
        return;
      }

      setPredictingState(true);

      try {
        const response = await fetch(app.dataset.predictUrl, {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]')?.content || ""
          },
          body: JSON.stringify({
            model_type: app.dataset.modelType,
            pixels: pixels.map(function (value) {
              return Number(value.toFixed(6));
            })
          })
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.message || "辨識失敗");
        }

        sampleId = result.sample_id;

        predictedNumber.textContent = result.predicted_label;
        confidenceText.textContent = "信心分數：" + result.confidence.toFixed(2) + "%";

        drawPreview(result.preview_pixels);

        placeholder.classList.add("d-none");
        resultContent.classList.remove("d-none");
        correctLabelPanel.classList.add("d-none");
        feedbackMessage.classList.add("d-none");
        enableFeedbackButtons(true);
      } catch (error) {
        showFeedbackMessage(error.message, "danger");
      } finally {
        setPredictingState(false);
      }
    }

    function drawPreview(pixelValues) {
      const previewContext = previewCanvas.getContext("2d");
      const image = previewContext.createImageData(28, 28);

      pixelValues.forEach(function (pixel, index) {
        const value = Math.max(0, Math.min(255, Number(pixel)));
        const rgbaIndex = index * 4;

        image.data[rgbaIndex] = value;
        image.data[rgbaIndex + 1] = value;
        image.data[rgbaIndex + 2] = value;
        image.data[rgbaIndex + 3] = 255;
      });

      const smallCanvas = document.createElement("canvas");
      smallCanvas.width = 28;
      smallCanvas.height = 28;
      smallCanvas.getContext("2d").putImageData(image, 0, 0);

      previewContext.imageSmoothingEnabled = false;
      previewContext.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
      previewContext.drawImage(
        smallCanvas,
        0,
        0,
        previewCanvas.width,
        previewCanvas.height
      );
    }

    async function submitFeedback(isCorrect, correctLabel) {
      if (!sampleId) {
        showFeedbackMessage("請先完成一次辨識", "danger");
        return;
      }

      enableFeedbackButtons(false);

      const feedbackUrl = app.dataset.feedbackUrlTemplate.replace(/0$/, String(sampleId));

      try {
        const response = await fetch(feedbackUrl, {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]')?.content || ""
          },
          body: JSON.stringify({
            is_correct: isCorrect,
            correct_label: correctLabel
          })
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.message || "回饋儲存失敗");
        }

        correctLabelPanel.classList.add("d-none");
        showFeedbackMessage(
          result.message + "；正確答案為 " + result.correct_label,
          "success"
        );
      } catch (error) {
        enableFeedbackButtons(true);
        showFeedbackMessage(error.message, "danger");
      }
    }

    function setPredictingState(isPredicting) {
      predictButton.disabled = isPredicting;

      if (isPredicting) {
        predictButton.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>辨識中';
      } else {
        predictButton.innerHTML = '<i class="fa fa-search me-1"></i>開始辨識';
      }
    }

    function enableFeedbackButtons(enabled) {
      correctButton.disabled = !enabled;
      wrongButton.disabled = !enabled;

      digitButtons.forEach(function (button) {
        button.disabled = !enabled;
      });
    }

    function showFeedbackMessage(message, type) {
      feedbackMessage.className = "mnist-feedback-message mt-3 alert alert-" + type;
      feedbackMessage.textContent = message;
      feedbackMessage.classList.remove("d-none");
    }
  }

  document.addEventListener("DOMContentLoaded", initAllMnistCanvases);

  const contentRoot = document.getElementById("mainContent");

  if (contentRoot) {
    const observer = new MutationObserver(initAllMnistCanvases);

    observer.observe(contentRoot, {
      childList: true,
      subtree: true
    });
  }

  // === page_loader.js 完成 innerHTML 更新後，也可由其他程式手動呼叫 ===
  window.initAllMnistCanvases = initAllMnistCanvases;
})();
