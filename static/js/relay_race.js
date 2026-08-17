// === 大隊接力計時器 ===
let relayRaceTimer = null;

function startRelayRace() {
  // === 如果上一場還在跑，先停止 ===
  if (relayRaceTimer !== null) {
    clearInterval(relayRaceTimer);
    relayRaceTimer = null;
  }

  const teamCountInput = document.getElementById("relay-team-count");
  const runnerCountInput = document.getElementById("relay-runner-count");

  if (teamCountInput === null || runnerCountInput === null) {
    alert("找不到大隊接力設定欄位，請確認 relay_race.html 是否正確載入。");
    return false;
  }

  const teamCount = parseInt(teamCountInput.value);
  const runnersPerTeam = parseInt(runnerCountInput.value);

  if (teamCount < 1 || teamCount > 4) {
    alert("隊伍數量只能輸入 1 到 4 隊");
    return false;
  }

  if (runnersPerTeam < 1 || runnersPerTeam > 8) {
    alert("每隊棒數只能輸入 1 到 8 棒");
    return false;
  }

  const teamNames = ["第一隊", "第二隊", "第三隊", "第四隊"];
  const legDistance = 200;
  const totalDistance = runnersPerTeam * legDistance;

  const relayTrackArea = document.getElementById("relay-track-area");
  const relayStatus = document.getElementById("relay-status");
  const relayRanking = document.getElementById("relay-ranking");

  let teams = [];
  let ranking = [];
  let raceStartTime = Date.now();

  relayTrackArea.innerHTML = "";
  relayRanking.innerHTML = "";
  relayStatus.innerHTML = "大隊接力比賽開始！";

  // === 建立隊伍資料與畫面 ===
  for (let i = 1; i <= teamCount; i++) {
    teams.push({
      id: i,
      name: teamNames[i - 1],
      totalDistance: 0,
      currentRunner: 1,
      currentLegDistance: 0,
      currentLegStartTime: raceStartTime,
      startTime: raceStartTime,
      finished: false,
      finishTime: null,
      runnerTimes: [],
      frame: 0
    });

    relayTrackArea.innerHTML += `
      <div class="relay-team-card" id="relay-team-card-${i}">
        <div class="relay-info">
          <strong>${teamNames[i - 1]}</strong>
          <span id="relay-team-text-${i}">
            第 1 棒 / 共 ${runnersPerTeam} 棒，0 / ${totalDistance} 公尺
          </span>
        </div>

        <div class="relay-track">
          <div class="relay-progress" id="relay-progress-${i}"></div>

          <div class="relay-runner-icon" id="relay-runner-icon-${i}">
            <span id="relay-runner-body-${i}">🏃</span>
            <span class="relay-runner-number" id="relay-runner-number-${i}">1</span>
          </div>
        </div>

        <div class="mt-1">
          <small id="relay-team-time-${i}" class="text-muted">尚未抵達終點</small>
        </div>

        <div class="relay-runner-times" id="relay-runner-times-${i}">
          <strong>各棒時間：</strong>
        </div>
      </div>
    `;
  }

  // === 每 0.25 秒更新一次接力進度 ===
  relayRaceTimer = setInterval(function () {
    const now = Date.now();

    // === 如果使用者切到其他頁，清掉計時器，避免找不到 DOM ===
    if (document.getElementById("relay-track-area") === null) {
      clearInterval(relayRaceTimer);
      relayRaceTimer = null;
      return;
    }

    for (let i = 0; i < teams.length; i++) {
      let team = teams[i];

      if (team.finished === false) {
        // === 模擬目前這一棒的前進距離 ===
        let move = Math.random() * 16 + 10;

        // === 避免超過單棒距離 ===
        if (team.currentLegDistance + move > legDistance) {
          move = legDistance - team.currentLegDistance;
        }

        team.currentLegDistance += move;
        team.totalDistance += move;

        // === 如果目前這一棒跑完 ===
        if (team.currentLegDistance >= legDistance) {
          let legTime = ((now - team.currentLegStartTime) / 1000).toFixed(2);
          team.runnerTimes.push(legTime);

          const runnerTimesArea = document.getElementById("relay-runner-times-" + team.id);

          runnerTimesArea.innerHTML += `
            <span>第 ${team.currentRunner} 棒：${legTime} 秒</span>
          `;

          // === 如果是最後一棒，代表該隊完賽 ===
          if (team.currentRunner >= runnersPerTeam) {
            team.finished = true;
            team.finishTime = ((now - team.startTime) / 1000).toFixed(2);

            ranking.push({
              name: team.name,
              finishTime: team.finishTime
            });

            document.getElementById("relay-team-time-" + team.id).innerHTML =
              "完賽時間：" + team.finishTime + " 秒";

            document.getElementById("relay-runner-icon-" + team.id).classList.add("relay-finished");

            relayRanking.innerHTML += `
              <li>${team.name}，總時間：${team.finishTime} 秒</li>
            `;
          }

          // === 還有下一棒，交棒 ===
          else {
            team.currentRunner += 1;
            team.currentLegDistance = 0;
            team.currentLegStartTime = now;

            document.getElementById("relay-runner-number-" + team.id).innerHTML =
              team.currentRunner;
          }
        }

        const percent = Math.floor((team.totalDistance / totalDistance) * 100);

        document.getElementById("relay-progress-" + team.id).style.width =
          percent + "%";

        document.getElementById("relay-runner-icon-" + team.id).style.left =
          percent + "%";

        if (team.finished === true) {
          document.getElementById("relay-team-text-" + team.id).innerHTML =
            "已完賽，" + totalDistance + " / " + totalDistance + " 公尺";
        } else {
          document.getElementById("relay-team-text-" + team.id).innerHTML =
            "第 " + team.currentRunner + " 棒 / 共 " + runnersPerTeam + " 棒，" +
            Math.floor(team.totalDistance) + " / " + totalDistance + " 公尺";
        }

        // === 小人跑步動畫：切換符號，模擬跑動 ===
        team.frame = team.frame === 0 ? 1 : 0;

        if (team.frame === 0) {
          document.getElementById("relay-runner-body-" + team.id).innerHTML = "🏃";
        } else {
          document.getElementById("relay-runner-body-" + team.id).innerHTML = "🏃‍♂️";
        }
      }
    }

    const elapsedTime = ((now - raceStartTime) / 1000).toFixed(1);

    relayStatus.innerHTML =
      "比賽進行中，目前已有 " + ranking.length + " 隊完賽，經過時間：" + elapsedTime + " 秒。";

    if (ranking.length === teamCount) {
      clearInterval(relayRaceTimer);
      relayRaceTimer = null;
      relayStatus.innerHTML = "大隊接力比賽結束！";
    }

  }, 250);

  return false;
}