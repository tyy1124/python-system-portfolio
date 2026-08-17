// === 賽跑遊戲計時器 ===
let raceGameTimer = null;

function startRaceGame() {
  // === 如果上一場還在跑，先停止 ===
  if (raceGameTimer !== null) {
    clearInterval(raceGameTimer);
    raceGameTimer = null;
  }

  const runnerCountInput = document.getElementById("runner-count");

  if (runnerCountInput === null) {
    alert("找不到跑者數量輸入框，請確認 race_game.html 是否正確載入。");
    return false;
  }

  const runnerCount = parseInt(runnerCountInput.value);

  if (runnerCount < 1 || runnerCount > 8) {
    alert("跑者數量只能輸入 1 到 8 人");
    return false;
  }

  const targetDistance = 1000;
  const raceTrackArea = document.getElementById("race-track-area");
  const raceStatus = document.getElementById("race-status");
  const raceRanking = document.getElementById("race-ranking");

  let runners = [];
  let ranking = [];
  let startTime = Date.now();

  raceTrackArea.innerHTML = "";
  raceRanking.innerHTML = "";
  raceStatus.innerHTML = "比賽開始！";

  // === 建立跑者資料與進度條 ===
  for (let i = 1; i <= runnerCount; i++) {
    runners.push({
      id: i,
      name: i + "號選手",
      distance: 0,
      finished: false,
      finishTime: null,
      frame: 0
    });

    raceTrackArea.innerHTML += `
      <div class="race-row" id="runner-row-${i}">
        <div class="race-info">
          <span>${i}號選手</span>
          <span id="runner-text-${i}">0 / ${targetDistance} 公尺</span>
        </div>

        <div class="race-track">
          <div class="race-progress" id="runner-progress-${i}"></div>

          <div class="runner-icon" id="runner-icon-${i}">
            <span id="runner-body-${i}">🏃</span>
            <span class="runner-number">${i}</span>
          </div>
        </div>

        <div class="mt-1">
          <small id="runner-time-${i}" class="text-muted">尚未抵達終點</small>
        </div>
      </div>
    `;
  }

  // === 每 0.25 秒更新一次賽跑進度 ===
  raceGameTimer = setInterval(function () {
    let currentTime = Date.now();

    for (let i = 0; i < runners.length; i++) {
      let runner = runners[i];

      if (runner.finished === false) {
        let move = Math.floor(Math.random() * 21) + 5;
        runner.distance += move;

        if (runner.distance >= targetDistance) {
          runner.distance = targetDistance;
          runner.finished = true;
          runner.finishTime = ((currentTime - startTime) / 1000).toFixed(2);

          ranking.push({
            name: runner.name,
            finishTime: runner.finishTime
          });

          document.getElementById("runner-time-" + runner.id).innerHTML =
            "完成時間：" + runner.finishTime + " 秒";

          document.getElementById("runner-icon-" + runner.id).classList.add("runner-finished");

          raceRanking.innerHTML += `
            <li>${runner.name}，完成時間：${runner.finishTime} 秒</li>
          `;
        }

        let percent = Math.floor((runner.distance / targetDistance) * 100);

        document.getElementById("runner-progress-" + runner.id).style.width =
          percent + "%";

        document.getElementById("runner-icon-" + runner.id).style.left =
          percent + "%";

        document.getElementById("runner-text-" + runner.id).innerHTML =
          runner.distance + " / " + targetDistance + " 公尺";

        // === 小人跑步動畫：切換符號，模擬跑動 ===
        runner.frame = runner.frame === 0 ? 1 : 0;

        if (runner.frame === 0) {
          document.getElementById("runner-body-" + runner.id).innerHTML = "🏃";
        } else {
          document.getElementById("runner-body-" + runner.id).innerHTML = "🏃‍♂️";
        }
      }
    }

    raceStatus.innerHTML =
      "比賽進行中，目前已有 " + ranking.length + " 位選手抵達終點。";

    if (ranking.length === runnerCount) {
      clearInterval(raceGameTimer);
      raceGameTimer = null;
      raceStatus.innerHTML = "比賽結束！";
    }

  }, 250);

  return false;
}