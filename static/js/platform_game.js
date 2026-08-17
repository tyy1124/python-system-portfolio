(function () {
  "use strict";

  let activePlatformGame = null;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (start, end, amount) => start + (end - start) * amount;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const TAU = Math.PI * 2;

  class SeededRandom {
    constructor(seed) {
      this.seed = (Number(seed) || 1) >>> 0;
    }

    next() {
      this.seed += 0x6D2B79F5;
      let value = this.seed;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    }

    range(min, max) {
      return min + (max - min) * this.next();
    }

    int(min, max) {
      return Math.floor(this.range(min, max + 1));
    }

    pick(items) {
      return items[Math.floor(this.next() * items.length)];
    }

    shuffle(items) {
      const copy = [...items];
      for (let index = copy.length - 1; index > 0; index -= 1) {
        const other = Math.floor(this.next() * (index + 1));
        [copy[index], copy[other]] = [copy[other], copy[index]];
      }
      return copy;
    }
  }

  class GameAudio {
    constructor() {
      this.context = null;
      this.musicVolume = 0.35;
      this.sfxVolume = 0.7;
      this.musicTimer = null;
      this.noteIndex = 0;
      this.theme = "village";
    }

    ensureContext() {
      if (this.context) {
        if (this.context.state === "suspended") {
          this.context.resume().catch(() => {});
        }
        return this.context;
      }

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        return null;
      }

      try {
        this.context = new AudioContextClass();
      } catch (error) {
        console.warn("Web Audio 初始化失敗", error);
        this.context = null;
      }

      return this.context;
    }

    setVolumes(music, sfx) {
      this.musicVolume = clamp(Number(music) || 0, 0, 1);
      this.sfxVolume = clamp(Number(sfx) || 0, 0, 1);
    }

    tone(frequency, duration = 0.08, type = "sine", volume = 0.18, delay = 0) {
      const context = this.ensureContext();
      if (!context || this.sfxVolume <= 0) {
        return;
      }

      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + delay;
      const end = start + duration;

      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume * this.sfxVolume), start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(end + 0.02);
    }

    noise(duration = 0.08, volume = 0.12) {
      const context = this.ensureContext();
      if (!context || this.sfxVolume <= 0) {
        return;
      }

      const buffer = context.createBuffer(1, Math.max(1, context.sampleRate * duration), context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let index = 0; index < data.length; index += 1) {
        data[index] = Math.random() * 2 - 1;
      }

      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      gain.gain.setValueAtTime(volume * this.sfxVolume, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
      source.connect(gain);
      gain.connect(context.destination);
      source.start();
    }

    play(name) {
      const sounds = {
        attack: () => this.tone(240, 0.055, "triangle", 0.11),
        shoot: () => this.tone(520, 0.05, "square", 0.07),
        hit: () => this.noise(0.045, 0.08),
        crit: () => {
          this.tone(760, 0.07, "triangle", 0.12);
          this.tone(980, 0.09, "sine", 0.08, 0.03);
        },
        hurt: () => this.tone(120, 0.14, "sawtooth", 0.1),
        block: () => this.tone(330, 0.09, "square", 0.08),
        coin: () => {
          this.tone(760, 0.055, "sine", 0.1);
          this.tone(980, 0.06, "sine", 0.08, 0.045);
        },
        chest: () => {
          [440, 660, 880].forEach((frequency, index) => this.tone(frequency, 0.14, "triangle", 0.08, index * 0.08));
        },
        level: () => {
          [392, 523, 659, 784].forEach((frequency, index) => this.tone(frequency, 0.16, "sine", 0.08, index * 0.07));
        },
        skill: () => this.tone(410, 0.12, "triangle", 0.09),
        portal: () => {
          this.tone(220, 0.3, "sine", 0.07);
          this.tone(440, 0.34, "sine", 0.05, 0.06);
        },
        boss: () => {
          this.tone(82, 0.5, "sawtooth", 0.08);
          this.tone(123, 0.45, "triangle", 0.06, 0.08);
        }
      };

      sounds[name]?.();
    }

    startMusic(theme = "village") {
      this.theme = theme;
      this.stopMusic();
      if (this.musicVolume <= 0) {
        return;
      }

      const patterns = {
        village: [261.6, 329.6, 392, 329.6, 293.7, 349.2, 440, 349.2],
        grassland: [220, 277.2, 329.6, 392, 329.6, 277.2, 246.9, 329.6],
        swamp: [164.8, 196, 220, 174.6, 146.8, 185, 207.7, 155.6],
        boss: [110, 123.5, 146.8, 130.8, 98, 116.5, 138.6, 103.8]
      };

      const playNote = () => {
        const context = this.ensureContext();
        if (!context || this.musicVolume <= 0) {
          return;
        }

        const pattern = patterns[this.theme] || patterns.village;
        const frequency = pattern[this.noteIndex % pattern.length];
        this.noteIndex += 1;

        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = this.theme === "boss" ? "triangle" : "sine";
        oscillator.frequency.setValueAtTime(frequency, context.currentTime);
        gain.gain.setValueAtTime(0.0001, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, this.musicVolume * 0.055), context.currentTime + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.72);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.75);
      };

      playNote();
      this.musicTimer = window.setInterval(playNote, this.theme === "boss" ? 520 : 720);
    }

    stopMusic() {
      if (this.musicTimer !== null) {
        window.clearInterval(this.musicTimer);
        this.musicTimer = null;
      }
    }

    destroy() {
      this.stopMusic();
      if (this.context) {
        this.context.close().catch(() => {});
      }
      this.context = null;
    }
  }

  class TYYRogueGame {
    constructor(root) {
      this.root = root;
      this.data = window.platformGameData;
      this.canvas = root.querySelector("#gameCanvas");
      this.ctx = this.canvas.getContext("2d");
      this.stageWrap = root.querySelector(".tyy-game-stage-wrap");
      this.homeUrl = root.dataset.homeUrl || "/home_dashboard";
      this.sceneArt = {};
      this.sceneArtReady = {};
      this.activeSceneKey = null;
      this.sceneSources = {
        village: root.dataset.sceneVillageUrl,
        grassland: root.dataset.sceneGrasslandUrl,
        grasslandBoss: root.dataset.sceneGrasslandBossUrl,
        swamp: root.dataset.sceneSwampUrl,
        swampBoss: root.dataset.sceneSwampBossUrl
      };

      this.screenIds = [
        "gameMainMenu",
        "characterSelectScreen",
        "routeSelectScreen",
        "levelUpScreen",
        "shopScreen",
        "pauseScreen",
        "settingsScreen",
        "howToScreen",
        "resultScreen"
      ];

      this.screens = Object.fromEntries(
        this.screenIds.map(id => [id, root.querySelector(`#${id}`)])
      );

      this.hud = root.querySelector("#gameHud");
      this.crosshair = root.querySelector("#gameCrosshair");
      this.toastStack = root.querySelector("#gameToastStack");
      this.prompt = root.querySelector("#gamePrompt");
      this.inventoryOverlay = root.querySelector("#gameInventoryOverlay");
      this.inventoryItemGrid = root.querySelector("#inventoryItemGrid");
      this.inventoryStatSummary = root.querySelector("#inventoryStatSummary");
      this.itemAcquiredBanner = root.querySelector("#itemAcquiredBanner");
      this.itemAcquiredTimer = null;

      this.keys = new Set();
      this.justPressed = new Set();
      this.mouse = {
        x: this.canvas.width / 2,
        y: this.canvas.height / 2,
        worldX: 0,
        worldY: 0,
        left: false,
        right: false
      };

      this.mode = "main";
      this.resumeMode = "main";
      this.settingsReturnScreen = "main";
      this.selectedCharacterId = "cat";
      this.run = null;
      this.player = null;
      this.world = null;
      this.stage = null;
      this.camera = { x: 0, y: 0, shake: 0 };
      this.enemies = [];
      this.projectiles = [];
      this.enemyProjectiles = [];
      this.zones = [];
      this.particles = [];
      this.damageTexts = [];
      this.companions = [];
      this.scheduledEvents = [];
      this.pickups = [];
      this.animationId = null;
      this.lastFrameTime = performance.now();
      this.destroyed = false;
      this.pendingLevelUps = 0;
      this.activeLevelChoices = [];
      this.activeShopOffers = [];
      this.routeChoices = [];
      this.keybindListeningAction = null;
      this.lastHudUpdate = 0;
      this.dummyDamage = 0;
      this.dummyLastHit = 0;
      this.uid = 1;
      this.inventoryHeld = false;
      this.viewportObserver = null;
      this.logicalWidth = 1280;
      this.logicalHeight = 720;
      this.characterMotion = null;

      this.audio = new GameAudio();
      this.settings = this.loadSettings();
      this.keybinds = this.loadKeybinds();
      this.audio.setVolumes(this.settings.musicVolume, this.settings.sfxVolume);

      this.bound = {};
    }

    init() {
      if (!this.data) {
        this.root.innerHTML = "<div class='alert alert-danger'>遊戲資料載入失敗，請確認 platform_game_levels.js 已載入。</div>";
        return;
      }

      this.ctx.imageSmoothingEnabled = true;
      this.root.dataset.displayMode = this.settings.displayMode || "adaptive";
      this.bindEvents();
      this.bindResponsiveViewport();
      this.renderSettings();
      this.renderCharacterSelection();
      this.renderMainMenuParty();
      this.applyInterfaceLanguage();
      this.showScreen("gameMainMenu");
      this.drawIdleCanvas();
      this.loop(performance.now());
      this.root.focus({ preventScroll: true });
    }

    destroy() {
      this.destroyed = true;
      if (this.animationId !== null) {
        cancelAnimationFrame(this.animationId);
      }
      this.audio.destroy();
      this.unbindEvents();
      this.viewportObserver?.disconnect();
      this.viewportObserver = null;
      if (this.itemAcquiredTimer) window.clearTimeout(this.itemAcquiredTimer);
      this.keys.clear();
      this.justPressed.clear();
    }

    loadSettings() {
      const defaults = {
        language: "zh-TW",
        musicVolume: 0.35,
        sfxVolume: 0.7,
        screenShake: true,
        displayMode: "adaptive",
        effectsQuality: "optimized"
      };

      try {
        return {
          ...defaults,
          ...JSON.parse(localStorage.getItem("tyyPlatformGameSettings") || "{}")
        };
      } catch (error) {
        return defaults;
      }
    }

    saveSettings() {
      try {
        localStorage.setItem("tyyPlatformGameSettings", JSON.stringify(this.settings));
      } catch (error) {
        console.warn("無法儲存遊戲設定", error);
      }
    }

    loadKeybinds() {
      try {
        return {
          ...this.data.defaultKeybinds,
          ...JSON.parse(localStorage.getItem("tyyPlatformGameKeybinds") || "{}")
        };
      } catch (error) {
        return { ...this.data.defaultKeybinds };
      }
    }

    saveKeybinds() {
      try {
        localStorage.setItem("tyyPlatformGameKeybinds", JSON.stringify(this.keybinds));
      } catch (error) {
        console.warn("無法儲存遊戲熱鍵", error);
      }
    }

    localize(value) {
      if (value && typeof value === "object") {
        return value[this.settings.language] || value["zh-TW"] || Object.values(value)[0] || "";
      }
      return value ?? "";
    }

    tr(key) {
      return this.data.translations[this.settings.language]?.[key]
        || this.data.translations["zh-TW"]?.[key]
        || key;
    }

    applyInterfaceLanguage() {
      const translations = {
        "zh-TW": {
          fullscreen: "全螢幕",
          settings: "設定",
          menuKicker: "橫向卷軸 × 輕度肉鴿 × 生存戰鬥",
          menuDescription: "選擇動物冒險者，從村莊出發，穿越草原與沼澤。擊倒怪物、收集金幣、開啟寶箱，逐步打造每一場不同的能力組合。",
          startAdventure: "開始新冒險",
          howToPlay: "操作與規則",
          move: "移動",
          jump: "跳躍",
          leftMouse: "左鍵",
          rightMouse: "右鍵",
          basicAttack: "普通攻擊",
          secondarySkill: "基礎技能",
          skills: "技能",
          interactLabel: "互動",
          menuLabel: "選單",
          inventoryLabel: "道具總覽",
          inventoryTitle: "目前道具",
          holdToView: "按住查看・放開關閉",
          displayMode: "畫面模式",
          selectCharacter: "選擇冒險角色",
          selectCharacterDescription: "每個角色都有獨立職業、成長、普通攻擊、天賦與四個技能。",
          back: "返回",
          baseStats: "基礎能力",
          talent: "角色天賦",
          attacksAndSkills: "攻擊與技能",
          confirmCharacter: "使用此角色進入村莊",
          normalStage: "普通關卡",
          eliteStage: "菁英關卡",
          shopStage: "商店關卡",
          bossStage: "BOSS 關卡",
          chooseUpgrade: "選擇一項強化",
          levelGrowth: "角色基礎能力已獲得成長。",
          shopTitle: "旅商補給站",
          shopDescription: "商店價格會隨章節與關卡提高，同一件道具可以重複強化。",
          leaveShop: "離開商店",
          pausedTitle: "遊戲暫停",
          resume: "繼續遊戲",
          settingsAndKeys: "設定與熱鍵",
          returnMain: "回到遊戲主選單",
          exitGame: "離開遊戲",
          gameSettings: "遊戲設定",
          done: "完成",
          generalSettings: "一般設定",
          language: "語言",
          musicVolume: "音樂音量",
          sfxVolume: "音效音量",
          screenShake: "畫面震動",
          customKeys: "自訂熱鍵",
          resetDefault: "恢復預設",
          keybindHelp: "點選按鍵後，再按下新的鍵。滑鼠左鍵與右鍵固定為普通攻擊與基礎技能。",
          rulesTitle: "操作與遊戲規則",
          combatControls: "戰鬥操作",
          combatControlsText: "使用 WASD 移動、Space 二段跳、滑鼠瞄準。左鍵普通攻擊，右鍵、Q、E、R 施放技能；按住 TAB 查看道具且不會暫停。",
          progression: "成長方式",
          progressionText: "擊倒敵人取得經驗與金幣。升級時從三項道具中選擇一項，並自動獲得角色成長能力。",
          chestsAndShop: "寶箱與商店",
          chestsAndShopText: "靠近寶箱按 F，以金幣開啟隨機道具。商店可以購買道具與恢復生命。",
          timePressure: "時間壓力",
          timePressureText: "關卡超過 5 分鐘後，經驗與金幣收益降低 80%；8 分鐘後，每 15 秒強化怪物與刷新數量。",
          chooseAgain: "重新選擇角色",
          returnMainShort: "回到主選單",
          footerText: "本遊戲使用 JavaScript Canvas 製作，所有角色、地圖與介面均為原創測試版本。"
        },
        en: {
          fullscreen: "Fullscreen",
          settings: "Settings",
          menuKicker: "Side-scrolling × light roguelite × survival combat",
          menuDescription: "Choose an animal adventurer and leave the village to cross grasslands and swamps. Defeat monsters, collect gold, open chests and build a different combination every run.",
          startAdventure: "Start new adventure",
          howToPlay: "Controls & rules",
          move: "Move",
          jump: "Jump",
          leftMouse: "LMB",
          rightMouse: "RMB",
          basicAttack: "Basic attack",
          secondarySkill: "Core skill",
          skills: "Skills",
          interactLabel: "Interact",
          menuLabel: "Menu",
          inventoryLabel: "Items",
          inventoryTitle: "Current items",
          holdToView: "Hold to view · release to close",
          displayMode: "Display mode",
          selectCharacter: "Choose an adventurer",
          selectCharacterDescription: "Each character has a unique role, growth curve, basic attack, talent and four skills.",
          back: "Back",
          baseStats: "Base stats",
          talent: "Character talent",
          attacksAndSkills: "Attacks & skills",
          confirmCharacter: "Enter the village with this character",
          normalStage: "Normal",
          eliteStage: "Elite",
          shopStage: "Shop",
          bossStage: "Boss",
          chooseUpgrade: "Choose an upgrade",
          levelGrowth: "Your character's base stats have increased.",
          shopTitle: "Traveling supply shop",
          shopDescription: "Prices rise with chapter and stage. The same item can be upgraded repeatedly.",
          leaveShop: "Leave shop",
          pausedTitle: "Game paused",
          resume: "Resume",
          settingsAndKeys: "Settings & keybinds",
          returnMain: "Return to game menu",
          exitGame: "Exit game",
          gameSettings: "Game settings",
          done: "Done",
          generalSettings: "General settings",
          language: "Language",
          musicVolume: "Music volume",
          sfxVolume: "SFX volume",
          screenShake: "Screen shake",
          customKeys: "Custom keybinds",
          resetDefault: "Reset defaults",
          keybindHelp: "Click a keybind, then press a new key. Left and right mouse buttons remain fixed.",
          rulesTitle: "Controls & game rules",
          combatControls: "Combat controls",
          combatControlsText: "Move with WASD, double-jump with Space and aim with the mouse. Use LMB for basic attacks and RMB, Q, E and R for skills. Hold TAB to view items without pausing.",
          progression: "Progression",
          progressionText: "Defeat enemies for XP and gold. On level-up, choose one of three items while gaining character growth stats.",
          chestsAndShop: "Chests & shops",
          chestsAndShopText: "Press F near a chest to spend gold on a random item. Shops sell items and healing.",
          timePressure: "Time pressure",
          timePressureText: "After 5 minutes, XP and gold fall by 80%. After 8 minutes, enemy strength and spawn count rise every 15 seconds.",
          chooseAgain: "Choose another character",
          returnMainShort: "Main menu",
          footerText: "Built with JavaScript Canvas. All characters, maps and interface art are original prototype work."
        }
      };

      const dictionary = translations[this.settings.language] || translations["zh-TW"];
      this.root.querySelectorAll("[data-game-i18n]").forEach(element => {
        const key = element.dataset.gameI18n;
        if (dictionary[key] !== undefined) {
          element.textContent = dictionary[key];
        }
      });

      const displayModeSelect = this.root.querySelector("#gameDisplayModeSelect");
      if (displayModeSelect) {
        const optionLabels = this.settings.language === "en"
          ? {
              adaptive: "Adaptive window",
              ratio: "Fixed 16:9",
              height: "Fit available height"
            }
          : {
              adaptive: "自適應視窗",
              ratio: "固定 16:9",
              height: "優先填滿高度"
            };
        Array.from(displayModeSelect.options).forEach(option => {
          if (optionLabels[option.value]) option.textContent = optionLabels[option.value];
        });
      }
    }

    bindEvents() {
      this.bound.keydown = event => this.handleKeyDown(event);
      this.bound.keyup = event => this.handleKeyUp(event);
      this.bound.mousemove = event => this.handleMouseMove(event);
      this.bound.mousedown = event => this.handleMouseDown(event);
      this.bound.mouseup = event => this.handleMouseUp(event);
      this.bound.contextmenu = event => {
        if (this.root.contains(event.target)) {
          event.preventDefault();
        }
      };
      this.bound.blur = () => {
        this.keys.clear();
        this.mouse.left = false;
        this.mouse.right = false;
        this.inventoryHeld = false;
        this.hideInventoryOverlay();
        if (["village", "stage"].includes(this.mode)) {
          this.pauseGame();
        }
      };
      this.bound.resize = () => {
        this.resizeStageToWindow();
        this.updateCanvasPointer();
      };

      document.addEventListener("keydown", this.bound.keydown);
      document.addEventListener("keyup", this.bound.keyup);
      this.canvas.addEventListener("mousemove", this.bound.mousemove);
      this.canvas.addEventListener("mousedown", this.bound.mousedown);
      document.addEventListener("mouseup", this.bound.mouseup);
      this.root.addEventListener("contextmenu", this.bound.contextmenu);
      window.addEventListener("blur", this.bound.blur);
      window.addEventListener("resize", this.bound.resize);

      this.root.querySelector("#gameStartButton")?.addEventListener("click", () => {
        this.audio.ensureContext();
        this.showCharacterSelection();
      });
      this.root.querySelector("#gameHowToButton")?.addEventListener("click", () => this.showScreen("howToScreen"));
      this.root.querySelectorAll("[data-game-back='main']").forEach(button => {
        button.addEventListener("click", () => this.showScreen("gameMainMenu"));
      });
      this.root.querySelector("#confirmCharacterButton")?.addEventListener("click", () => this.startNewRun());
      this.root.querySelector("#gameSettingsButton")?.addEventListener("click", () => this.openSettings("main"));
      this.root.querySelector("#pauseSettingsButton")?.addEventListener("click", () => this.openSettings("pause"));
      this.root.querySelector("#closeSettingsButton")?.addEventListener("click", () => this.closeSettings());
      this.root.querySelector("#resumeGameButton")?.addEventListener("click", () => this.resumeGame());
      this.root.querySelector("#returnMainMenuButton")?.addEventListener("click", () => this.confirmReturnMain());
      this.root.querySelector("#exitGameButton")?.addEventListener("click", () => this.exitToSite());
      this.root.querySelector("#retryRunButton")?.addEventListener("click", () => this.showCharacterSelection());
      this.root.querySelector("#resultMainMenuButton")?.addEventListener("click", () => this.returnToMainMenu());
      this.root.querySelector("#leaveShopButton")?.addEventListener("click", () => this.leaveShop());
      this.root.querySelector("#shopHealButton")?.addEventListener("click", () => this.buyShopHeal());
      this.root.querySelector("#gameFullscreenButton")?.addEventListener("click", () => this.toggleFullscreen());

      this.root.querySelector("#gameLanguageSelect")?.addEventListener("change", event => {
        this.settings.language = event.target.value;
        this.saveSettings();
        this.renderCharacterSelection();
        this.renderSettings();
        this.refreshStaticTexts();
      });
      this.root.querySelector("#musicVolumeInput")?.addEventListener("input", event => {
        this.settings.musicVolume = Number(event.target.value) / 100;
        this.saveSettings();
        this.audio.setVolumes(this.settings.musicVolume, this.settings.sfxVolume);
        this.root.querySelector("#musicVolumeText").textContent = `${event.target.value}%`;
        if (this.audio.musicTimer !== null) {
          this.audio.startMusic(this.getMusicTheme());
        }
      });
      this.root.querySelector("#sfxVolumeInput")?.addEventListener("input", event => {
        this.settings.sfxVolume = Number(event.target.value) / 100;
        this.saveSettings();
        this.audio.setVolumes(this.settings.musicVolume, this.settings.sfxVolume);
        this.root.querySelector("#sfxVolumeText").textContent = `${event.target.value}%`;
        this.audio.play("coin");
      });
      this.root.querySelector("#screenShakeInput")?.addEventListener("change", event => {
        this.settings.screenShake = event.target.checked;
        this.saveSettings();
      });
      this.root.querySelector("#gameDisplayModeSelect")?.addEventListener("change", event => {
        this.settings.displayMode = event.target.value || "adaptive";
        this.root.dataset.displayMode = this.settings.displayMode;
        this.saveSettings();
        this.resizeStageToWindow();
      });
      this.root.querySelector("#resetKeybindButton")?.addEventListener("click", () => {
        this.keybinds = { ...this.data.defaultKeybinds };
        this.saveKeybinds();
        this.renderKeybinds();
      });
    }


    bindResponsiveViewport() {
      if (typeof ResizeObserver === "function") {
        this.viewportObserver = new ResizeObserver(() => {
          this.resizeStageToWindow();
          this.updateCanvasPointer();
        });
        this.viewportObserver.observe(this.root);
      }
      this.resizeStageToWindow();
    }

    resizeStageToWindow() {
      if (!this.stageWrap || document.fullscreenElement === this.stageWrap) return;
      const mode = this.settings.displayMode || "adaptive";
      this.root.dataset.displayMode = mode;
      const shellWidth = Math.max(280, this.root.clientWidth || this.stageWrap.clientWidth || 1280);
      const topbar = this.root.querySelector(".tyy-game-topbar")?.offsetHeight || 0;
      const footer = this.root.querySelector(".tyy-game-footer")?.offsetHeight || 0;
      const availableHeight = Math.max(180, window.innerHeight - topbar - footer - 42);
      const ratioHeight = shellWidth * 9 / 16;
      let targetWidth = shellWidth;
      let targetHeight = ratioHeight;

      if (mode === "adaptive") {
        targetWidth = Math.min(shellWidth, availableHeight * 16 / 9);
        targetHeight = targetWidth * 9 / 16;
      } else if (mode === "height") {
        targetHeight = Math.min(availableHeight, 900);
        targetWidth = Math.min(shellWidth, targetHeight * 16 / 9);
        targetHeight = targetWidth * 9 / 16;
      } else {
        targetHeight = ratioHeight;
      }

      if (targetHeight > 900) {
        targetHeight = 900;
        targetWidth = Math.min(shellWidth, targetHeight * 16 / 9);
      }

      this.stageWrap.style.width = `${Math.round(targetWidth)}px`;
      this.stageWrap.style.height = `${Math.round(targetHeight)}px`;
      this.stageWrap.style.marginInline = "auto";
      const scale = clamp(Math.min(targetWidth / this.logicalWidth, targetHeight / this.logicalHeight), 0.44, 1.18);
      this.root.style.setProperty("--game-ui-scale", scale.toFixed(3));
      this.root.classList.toggle("is-compact-viewport", targetWidth < 900 || targetHeight < 540);
      this.root.classList.toggle("is-short-viewport", targetHeight < 430);
    }

    unbindEvents() {
      document.removeEventListener("keydown", this.bound.keydown);
      document.removeEventListener("keyup", this.bound.keyup);
      this.canvas.removeEventListener("mousemove", this.bound.mousemove);
      this.canvas.removeEventListener("mousedown", this.bound.mousedown);
      document.removeEventListener("mouseup", this.bound.mouseup);
      this.root.removeEventListener("contextmenu", this.bound.contextmenu);
      window.removeEventListener("blur", this.bound.blur);
      window.removeEventListener("resize", this.bound.resize);
    }

    refreshStaticTexts() {
      this.applyInterfaceLanguage();
      if (this.run) {
        this.buildAbilityBar();
        this.updateHud(true);
      }
    }

    getMusicTheme() {
      if (this.stage?.isBoss) return "boss";
      if (this.run?.chapter === 2) return "swamp";
      if (this.mode === "village") return "village";
      return "grassland";
    }

    renderSettings() {
      const language = this.root.querySelector("#gameLanguageSelect");
      const music = this.root.querySelector("#musicVolumeInput");
      const sfx = this.root.querySelector("#sfxVolumeInput");
      const shake = this.root.querySelector("#screenShakeInput");
      const displayMode = this.root.querySelector("#gameDisplayModeSelect");

      if (language) language.value = this.settings.language;
      if (music) music.value = Math.round(this.settings.musicVolume * 100);
      if (sfx) sfx.value = Math.round(this.settings.sfxVolume * 100);
      if (shake) shake.checked = Boolean(this.settings.screenShake);
      if (displayMode) displayMode.value = this.settings.displayMode || "adaptive";
      if (this.root.querySelector("#musicVolumeText")) {
        this.root.querySelector("#musicVolumeText").textContent = `${Math.round(this.settings.musicVolume * 100)}%`;
      }
      if (this.root.querySelector("#sfxVolumeText")) {
        this.root.querySelector("#sfxVolumeText").textContent = `${Math.round(this.settings.sfxVolume * 100)}%`;
      }
      this.renderKeybinds();
    }

    renderKeybinds() {
      const list = this.root.querySelector("#keybindList");
      if (!list) return;
      const labels = {
        moveLeft: this.settings.language === "en" ? "Move left" : "向左移動",
        moveRight: this.settings.language === "en" ? "Move right" : "向右移動",
        moveUp: this.settings.language === "en" ? "Up / alternate jump" : "向上／替代跳躍",
        moveDown: this.settings.language === "en" ? "Down / fast fall" : "向下／快速落下",
        jump: this.settings.language === "en" ? "Jump" : "跳躍",
        skillQ: this.settings.language === "en" ? "Skill Q" : "技能 Q",
        skillE: this.settings.language === "en" ? "Skill E" : "技能 E",
        ultimate: this.settings.language === "en" ? "Ultimate" : "強力技能 R",
        interact: this.settings.language === "en" ? "Interact" : "互動",
        pause: this.settings.language === "en" ? "Pause" : "暫停選單"
      };

      list.innerHTML = Object.entries(labels).map(([action, label]) => `
        <div class="tyy-keybind-row">
          <span>${label}</span>
          <button
            type="button"
            class="tyy-keybind-button${this.keybindListeningAction === action ? " is-listening" : ""}"
            data-keybind-action="${action}"
          >${this.keybindListeningAction === action ? (this.settings.language === "en" ? "Press a key" : "請按新按鍵") : this.formatKeyCode(this.keybinds[action])}</button>
        </div>
      `).join("");

      list.querySelectorAll("[data-keybind-action]").forEach(button => {
        button.addEventListener("click", () => {
          this.keybindListeningAction = button.dataset.keybindAction;
          this.renderKeybinds();
        });
      });
    }

    formatKeyCode(code) {
      const special = {
        Space: "Space",
        Escape: "ESC",
        ArrowLeft: "←",
        ArrowRight: "→",
        ArrowUp: "↑",
        ArrowDown: "↓",
        ShiftLeft: "L-Shift",
        ShiftRight: "R-Shift"
      };
      if (special[code]) return special[code];
      if (code?.startsWith("Key")) return code.slice(3);
      if (code?.startsWith("Digit")) return code.slice(5);
      return code || "—";
    }

    openSettings(returnScreen = "main") {
      this.settingsReturnScreen = returnScreen;
      if (["village", "stage"].includes(this.mode)) {
        this.resumeMode = this.mode;
      }
      this.renderSettings();
      this.showScreen("settingsScreen", false);
      this.mode = "settings";
    }

    closeSettings() {
      this.keybindListeningAction = null;
      if (this.settingsReturnScreen === "pause") {
        this.mode = "pause";
        this.showScreen("pauseScreen", false);
      } else {
        this.mode = "main";
        this.showScreen("gameMainMenu", false);
      }
    }

    toggleFullscreen() {
      if (!document.fullscreenElement) {
        this.stageWrap.requestFullscreen?.().catch(() => {});
      } else {
        document.exitFullscreen?.().catch(() => {});
      }
    }

    handleKeyDown(event) {
      if (!this.root.isConnected) return;

      if (this.keybindListeningAction) {
        event.preventDefault();
        const conflict = Object.entries(this.keybinds).find(
          ([action, code]) => action !== this.keybindListeningAction && code === event.code
        );
        if (conflict) {
          this.toast(
            this.settings.language === "en" ? "Key already used" : "按鍵已被使用",
            this.settings.language === "en"
              ? `${this.formatKeyCode(event.code)} is assigned to another action.`
              : `${this.formatKeyCode(event.code)} 已設定給其他操作。`,
            "danger"
          );
          return;
        }
        this.keybinds[this.keybindListeningAction] = event.code;
        this.keybindListeningAction = null;
        this.saveKeybinds();
        this.renderKeybinds();
        return;
      }

      const controlledCodes = new Set([
        ...Object.values(this.keybinds),
        "Space",
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown"
      ]);
      if (controlledCodes.has(event.code) && this.root.contains(document.activeElement)) {
        event.preventDefault();
      }

      if (event.code === "Tab") {
        if (["village", "stage"].includes(this.mode)) {
          event.preventDefault();
          this.inventoryHeld = true;
          this.showInventoryOverlay();
        }
        return;
      }

      if (event.repeat) {
        this.keys.add(event.code);
        return;
      }

      this.keys.add(event.code);
      this.justPressed.add(event.code);

      if (event.code === this.keybinds.pause) {
        if (this.mode === "pause") {
          this.resumeGame();
        } else if (["village", "stage"].includes(this.mode)) {
          this.pauseGame();
        } else if (this.mode === "settings") {
          this.closeSettings();
        }
        return;
      }

      if (!["village", "stage"].includes(this.mode)) return;

      if (event.code === this.keybinds.jump || event.code === this.keybinds.moveUp) {
        this.player.jumpQueued = true;
      }
      if (event.code === this.keybinds.skillQ) this.useSkill("q");
      if (event.code === this.keybinds.skillE) this.useSkill("e");
      if (event.code === this.keybinds.ultimate) this.useSkill("r");
      if (event.code === this.keybinds.interact) this.interact();
    }

    handleKeyUp(event) {
      this.keys.delete(event.code);
      if (event.code === "Tab") {
        event.preventDefault();
        this.inventoryHeld = false;
        this.hideInventoryOverlay();
      }
    }

    handleMouseMove(event) {
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.x = (event.clientX - rect.left) * (this.canvas.width / rect.width);
      this.mouse.y = (event.clientY - rect.top) * (this.canvas.height / rect.height);
      this.updateCanvasPointer(event.clientX - rect.left, event.clientY - rect.top);
    }

    updateCanvasPointer(cssX = null, cssY = null) {
      if (!this.crosshair) return;
      if (cssX === null || cssY === null) {
        const rect = this.canvas.getBoundingClientRect();
        cssX = this.mouse.x * rect.width / this.canvas.width;
        cssY = this.mouse.y * rect.height / this.canvas.height;
      }
      this.crosshair.style.left = `${cssX}px`;
      this.crosshair.style.top = `${cssY}px`;
    }

    handleMouseDown(event) {
      this.audio.ensureContext();
      this.root.focus({ preventScroll: true });
      if (!["village", "stage"].includes(this.mode)) return;
      if (event.button === 0) {
        this.mouse.left = true;
        this.performBasicAttack();
      } else if (event.button === 2) {
        this.mouse.right = true;
        this.useSkill("secondary");
      }
    }

    handleMouseUp(event) {
      if (event.button === 0) this.mouse.left = false;
      if (event.button === 2) this.mouse.right = false;
    }

    showScreen(screenId, setMode = true) {
      this.screenIds.forEach(id => this.screens[id]?.classList.add("is-hidden"));
      if (screenId) this.screens[screenId]?.classList.remove("is-hidden");
      if (setMode) {
        const mapping = {
          gameMainMenu: "main",
          characterSelectScreen: "character",
          routeSelectScreen: "route",
          levelUpScreen: "levelUp",
          shopScreen: "shop",
          pauseScreen: "pause",
          settingsScreen: "settings",
          howToScreen: "howTo",
          resultScreen: "result"
        };
        this.mode = mapping[screenId] || this.mode;
      }
    }

    hideAllScreens() {
      this.screenIds.forEach(id => this.screens[id]?.classList.add("is-hidden"));
    }

    pauseGame() {
      if (!["village", "stage"].includes(this.mode)) return;
      this.resumeMode = this.mode;
      this.mode = "pause";
      this.showScreen("pauseScreen", false);
      this.audio.stopMusic();
    }

    resumeGame() {
      this.hideAllScreens();
      this.mode = this.resumeMode || "stage";
      this.audio.startMusic(this.getMusicTheme());
      this.root.focus({ preventScroll: true });
    }

    confirmReturnMain() {
      const message = this.settings.language === "en"
        ? "Current run progress will be lost. Return to the main menu?"
        : "目前冒險進度將會消失，確定回到遊戲主選單嗎？";
      if (window.confirm(message)) {
        this.returnToMainMenu();
      }
    }

    returnToMainMenu() {
      this.run = null;
      this.player = null;
      this.world = null;
      this.stage = null;
      this.enemies = [];
      this.projectiles = [];
      this.enemyProjectiles = [];
      this.zones = [];
      this.companions = [];
      this.pickups = [];
      this.inventoryHeld = false;
      this.hideInventoryOverlay();
      this.hud.classList.add("is-hidden");
      this.audio.stopMusic();
      this.showScreen("gameMainMenu");
      this.drawIdleCanvas();
    }

    exitToSite() {
      this.audio.stopMusic();
      if (typeof window.loadPage === "function") {
        window.loadPage(this.homeUrl);
      } else {
        window.location.href = this.homeUrl;
      }
    }

    showCharacterSelection() {
      this.run = null;
      this.companions = [];
      this.selectedCharacterId = this.selectedCharacterId || "cat";
      this.renderCharacterSelection();
      this.showScreen("characterSelectScreen");
    }

    renderCharacterSelection() {
      const list = this.root.querySelector("#characterList");
      if (!list) return;

      const characters = Object.values(this.data.characters).sort((a, b) => a.order - b.order);
      list.innerHTML = characters.map(character => `
        <button
          type="button"
          class="tyy-character-card${character.id === this.selectedCharacterId ? " is-selected" : ""}"
          data-character-id="${character.id}"
          style="--character-accent:${character.accent}"
        >
          <canvas width="176" height="148" data-character-card-canvas="${character.id}"></canvas>
          <span>
            <strong>${this.localize(character.name)}</strong>
            <span>${this.localize(character.role)}</span>
            <small>${this.localize(character.tagline)}</small>
          </span>
        </button>
      `).join("");

      list.querySelectorAll("[data-character-id]").forEach(button => {
        button.addEventListener("click", () => {
          this.selectedCharacterId = button.dataset.characterId;
          this.renderCharacterSelection();
        });
      });

      this.renderCharacterDetail();
      this.drawCharacterSelectionCanvases(performance.now() / 1000);
    }

    renderCharacterDetail() {
      const character = this.data.characters[this.selectedCharacterId];
      if (!character) return;

      this.root.querySelector("#characterRoleBadge").textContent = this.localize(character.role);
      this.root.querySelector("#characterRoleBadge").style.borderColor = `${character.accent}88`;
      this.root.querySelector("#characterRoleBadge").style.color = character.accent;
      this.root.querySelector("#characterDetailName").textContent = this.localize(character.name);
      this.root.querySelector("#characterDetailRole").textContent = this.localize(character.tagline);
      this.root.querySelector("#characterDetailRole").style.color = character.accent;
      this.root.querySelector("#characterDetailDescription").textContent = this.localize(character.description);

      const stats = [
        [this.settings.language === "en" ? "HP" : "生命", Math.round(character.stats.maxHp)],
        [this.settings.language === "en" ? "Attack" : "攻擊", Math.round(character.stats.damage)],
        [this.settings.language === "en" ? "Move speed" : "移動速度", Math.round(character.stats.moveSpeed)],
        [this.settings.language === "en" ? "Attack speed" : "攻擊速度", `${character.stats.attackRate.toFixed(2)}/s`],
        [this.settings.language === "en" ? "Critical" : "爆擊率", `${Math.round(character.stats.critChance * 100)}%`],
        [this.settings.language === "en" ? "Armor" : "護甲", Math.round(character.stats.armor)]
      ];

      this.root.querySelector("#characterStats").innerHTML = stats.map(([label, value]) => `
        <div class="tyy-stat-item"><span>${label}</span><strong>${value}</strong></div>
      `).join("");

      this.root.querySelector("#characterTalent").innerHTML = `
        <strong>${this.localize(character.talent.name)}</strong>
        <p>${this.localize(character.talent.description)}</p>
      `;

      const skillEntries = [
        {
          key: this.settings.language === "en" ? "LMB" : "左鍵",
          icon: "✦",
          name: character.attack.name,
          description: character.attack.description,
          cooldown: this.settings.language === "en" ? "Basic attack" : "普通攻擊"
        },
        ...Object.values(character.skills)
      ];

      this.root.querySelector("#characterSkills").innerHTML = skillEntries.map(skill => `
        <article class="tyy-skill-card">
          <header>
            <span class="tyy-skill-icon" style="background:${character.accent}">${skill.icon}</span>
            <strong>${this.localize(skill.name)}</strong>
          </header>
          <p>${this.localize(skill.description)}</p>
          <small>${skill.cooldown === undefined ? "" : typeof skill.cooldown === "number"
            ? `${skill.key}・CD ${skill.cooldown}s`
            : `${skill.key}・${skill.cooldown}`}</small>
        </article>
      `).join("");

      this.drawCharacterSelectionCanvases(performance.now() / 1000);
    }


    drawCharacterSelectionCanvases(time) {
      if (this.mode !== "character" && this.screens.characterSelectScreen?.classList.contains("is-hidden")) return;
      this.root.querySelectorAll("[data-character-card-canvas]").forEach((canvas, index) => {
        const characterId = canvas.dataset.characterCardCanvas;
        const character = this.data.characters[characterId];
        const context = canvas.getContext("2d");
        context.clearRect(0, 0, canvas.width, canvas.height);
        const glow = context.createRadialGradient(canvas.width * 0.5, canvas.height * 0.62, 2, canvas.width * 0.5, canvas.height * 0.62, canvas.width * 0.46);
        glow.addColorStop(0, `${character.accent}2d`);
        glow.addColorStop(1, "rgba(0,0,0,0)");
        context.fillStyle = glow;
        context.fillRect(0, 0, canvas.width, canvas.height);
        this.drawCharacterArt(
          context,
          characterId,
          canvas.width * 0.5,
          canvas.height * 0.84,
          0.94,
          1,
          time + index * 0.37,
          true,
          { moveAmount: 0.16, cycle: time * 4 + index, attackProgress: 0, airborne: false }
        );
      });

      const character = this.data.characters[this.selectedCharacterId];
      const preview = this.root.querySelector("#characterPreviewCanvas");
      if (!character || !preview) return;
      const context = preview.getContext("2d");
      context.clearRect(0, 0, preview.width, preview.height);
      const gradient = context.createLinearGradient(0, 0, 0, preview.height);
      gradient.addColorStop(0, "#174462");
      gradient.addColorStop(0.58, "#12364d");
      gradient.addColorStop(1, "#0a1d30");
      context.fillStyle = gradient;
      context.fillRect(0, 0, preview.width, preview.height);
      this.drawPreviewEnvironment(context, preview.width, preview.height);
      const attackPulse = (Math.sin(time * 1.35) + 1) * 0.5;
      this.drawCharacterArt(
        context,
        character.id,
        preview.width * 0.5,
        preview.height * 0.84,
        1.56,
        1,
        time,
        true,
        {
          moveAmount: 0.2,
          cycle: time * 4.5,
          attackProgress: attackPulse > 0.82 ? (attackPulse - 0.82) / 0.18 : 0,
          airborne: false
        }
      );
    }

    drawMainMenuParty(time) {
      const canvas = this.root.querySelector("#mainMenuParty canvas");
      if (!canvas) return;
      const context = canvas.getContext("2d");
      context.clearRect(0, 0, canvas.width, canvas.height);
      const characters = ["hippo", "rabbit", "cat", "dog", "deer"];
      const positions = [
        [130, 355, 1.55, -1],
        [300, 305, 1.62, 1],
        [465, 340, 1.75, 1],
        [635, 310, 1.6, -1],
        [790, 355, 1.55, -1]
      ];
      characters.forEach((id, index) => {
        const [x, y, scale, facing] = positions[index];
        this.drawCharacterArt(context, id, x, y, scale, facing, time + index * 0.7, true, {
          moveAmount: 0.18,
          cycle: time * 4 + index,
          attackProgress: 0,
          airborne: false
        });
      });
    }

    renderMainMenuParty() {
      const container = this.root.querySelector("#mainMenuParty");
      if (!container) return;
      container.innerHTML = '<canvas width="900" height="520"></canvas>';
      this.drawMainMenuParty(performance.now() / 1000);
    }

    drawPreviewEnvironment(context, width, height) {
      context.save();
      context.fillStyle = "rgba(77, 132, 95, 0.5)";
      context.beginPath();
      context.moveTo(0, height * 0.72);
      for (let x = 0; x <= width; x += 40) {
        context.lineTo(x, height * 0.67 + Math.sin(x * 0.035) * 9);
      }
      context.lineTo(width, height);
      context.lineTo(0, height);
      context.closePath();
      context.fill();
      context.fillStyle = "#4e8b4c";
      context.fillRect(0, height * 0.78, width, height * 0.22);
      context.fillStyle = "rgba(255,255,255,.2)";
      for (let index = 0; index < 22; index += 1) {
        const x = (index * 73) % width;
        const y = 20 + (index * 41) % 90;
        context.beginPath();
        context.arc(x, y, 2 + index % 3, 0, TAU);
        context.fill();
      }
      context.restore();
    }

    startNewRun() {
      const character = this.data.characters[this.selectedCharacterId];
      if (!character) return;

      this.run = {
        seed: Date.now() % 2147483647,
        characterId: character.id,
        chapter: 1,
        stageNumber: 1,
        bossPending: false,
        level: 1,
        xp: 0,
        xpToNext: 18,
        gold: 0,
        items: {},
        bonusStats: { maxHp: 0, damage: 0, moveSpeed: 0, attackRate: 0, critChance: 0 },
        totalKills: 0,
        totalGold: 0,
        totalDamage: 0,
        totalDamageTaken: 0,
        stagesCleared: 0,
        openedChests: 0,
        startedAt: performance.now(),
        currentNode: null,
        usedMaps: { 1: [], 2: [] }
      };

      this.pendingLevelUps = 0;
      this.companions = [];
      this.createPlayer(true);
      this.enterVillage();
      this.audio.ensureContext();
      this.audio.startMusic("village");
      this.toast(
        this.localize(character.name),
        this.settings.language === "en" ? "Adventure started. Test your abilities on the dummy, then enter the portal." : "冒險開始。可以先攻擊木樁測試傷害，再進入傳送門。",
        "success"
      );
    }

    createPlayer(fullHeal = false) {
      const character = this.data.characters[this.run.characterId];
      const oldHpRatio = this.player ? this.player.hp / Math.max(1, this.player.maxHp) : 1;
      const oldShield = this.player?.shield || 0;
      const oldCooldowns = this.player?.cooldowns || {};
      const oldBuffs = this.player?.buffs || [];
      const oldPosition = this.player ? { x: this.player.x, y: this.player.y } : { x: 180, y: 460 };
      const stats = this.calculatePlayerStats();

      this.player = {
        x: oldPosition.x,
        y: oldPosition.y,
        width: character.id === "hippo" ? 58 : 48,
        height: character.id === "hippo" ? 66 : 58,
        vx: 0,
        vy: 0,
        onGround: false,
        jumpQueued: false,
        jumpsRemaining: 2,
        coyoteUntil: 0,
        lastGroundY: oldPosition.y,
        facing: 1,
        aimAngle: 0,
        maxHp: stats.maxHp,
        hp: fullHeal ? stats.maxHp : clamp(stats.maxHp * oldHpRatio, 1, stats.maxHp),
        shield: oldShield,
        stats,
        cooldowns: oldCooldowns,
        buffs: oldBuffs,
        invulnerableUntil: 0,
        lastAttackAt: -Infinity,
        attackAnimUntil: 0,
        attackSequence: 0,
        rabbitHitTarget: null,
        rabbitHitCount: 0,
        nineLivesReady: character.id === "cat",
        checkpointX: 180,
        checkpointY: 450,
        fortressPulseAt: 0,
        wisdomShotAt: 0,
        summonHitCount: 0
      };

      if (character.id === "dog") {
        this.companions = this.companions.filter(companion => companion.duration !== Infinity);
        this.companions.push(this.createCompanion("pup", Infinity, 0));
      } else {
        this.companions = [];
      }
      this.buildAbilityBar();
    }

    calculatePlayerStats() {
      const character = this.data.characters[this.run.characterId];
      const levelsGained = Math.max(0, this.run.level - 1);
      const stats = {
        maxHp: character.stats.maxHp + character.growth.maxHp * levelsGained + this.run.bonusStats.maxHp,
        damage: character.stats.damage + character.growth.damage * levelsGained + this.run.bonusStats.damage,
        moveSpeed: character.stats.moveSpeed + character.growth.moveSpeed * levelsGained + this.run.bonusStats.moveSpeed,
        rawMoveSpeed: 0,
        attackRate: character.stats.attackRate * (1 + character.growth.attackRate * levelsGained + this.run.bonusStats.attackRate),
        critChance: character.stats.critChance + character.growth.critChance * levelsGained + this.run.bonusStats.critChance,
        critDamage: character.stats.critDamage,
        critOverflow: 0,
        blockChance: character.stats.blockChance,
        armor: character.stats.armor,
        cooldownRate: character.stats.cooldownRate,
        skillPower: character.stats.skillPower,
        shieldMultiplier: character.id === "hippo" ? 1.5 : 1,
        damageReduction: 0,
        goldMultiplier: 1,
        summonDamageMultiplier: character.id === "dog" ? 1.25 : 1
      };

      const itemCount = id => Number(this.run.items[id] || 0);
      const pill = itemCount("miraclePill");
      const shoes = itemCount("sneakers");
      const bottle = itemCount("bloodBottle");
      const headband = itemCount("redHeadband");
      const watch = itemCount("heavyWatch");
      const belt = itemCount("bountyBelt");

      if (pill > 0) stats.attackRate *= 1 + pill * 0.08;
      if (shoes > 0) stats.moveSpeed *= 1 + shoes * 0.06;
      if (bottle > 0) stats.maxHp += bottle * 16;
      if (headband > 0) stats.critChance += headband * 0.06;
      if (watch > 0) {
        stats.skillPower *= 1 + watch * 0.08;
        stats.attackRate *= 1 - Math.min(0.35, watch * 0.02);
      }
      if (belt > 0) stats.goldMultiplier *= 1 + belt * 0.04;
      if (character.id === "rabbit") stats.attackRate *= 1.12;

      stats.rawMoveSpeed = stats.moveSpeed;
      stats.moveSpeed = Math.min(this.data.balance.moveSpeedCap || 520, stats.moveSpeed);
      if (stats.critChance > 1) {
        stats.critOverflow = stats.critChance - 1;
        stats.critDamage += stats.critOverflow;
        stats.critChance = 1;
      }

      stats.maxHp = Math.round(stats.maxHp);
      stats.damage = Number(stats.damage.toFixed(2));
      stats.moveSpeed = Number(stats.moveSpeed.toFixed(2));
      stats.rawMoveSpeed = Number(stats.rawMoveSpeed.toFixed(2));
      stats.attackRate = clamp(Number(stats.attackRate.toFixed(3)), 0.45, 12);
      stats.critChance = clamp(stats.critChance, 0, 1);
      stats.critDamage = Number(stats.critDamage.toFixed(3));
      return stats;
    }

    enterVillage() {
      this.mode = "village";
      this.hideAllScreens();
      this.hud.classList.remove("is-hidden");
      this.stage = null;
      this.world = this.generateVillageWorld();
      this.enemies = [];
      this.projectiles = [];
      this.enemyProjectiles = [];
      this.zones = [];
      this.particles = [];
      this.damageTexts = [];
      this.pickups = [];
      this.scheduledEvents = [];
      this.companions = this.companions.filter(companion => companion.duration === Infinity);
      this.player.x = 210;
      this.player.y = this.getGroundY(210) - this.player.height / 2;
      this.player.vx = 0;
      this.player.vy = 0;
      this.player.hp = this.player.maxHp;
      this.player.shield = 0;
      this.player.checkpointX = 210;
      this.player.checkpointY = this.player.y;
      this.camera.x = 0;
      this.camera.y = 0;
      this.audio.startMusic("village");
      this.updateHud(true);
    }

    generateVillageWorld() {
      const length = 1800;
      const terrain = [];
      for (let x = 0; x <= length; x += 80) {
        const y = 555 + Math.sin(x * 0.004) * 7 + Math.sin(x * 0.011) * 3;
        terrain.push({ x, y });
      }
      return {
        type: "village",
        chapter: 1,
        length,
        terrain,
        pits: [],
        waters: [],
        platforms: [
          { x: 520, y: 455, width: 160, height: 18, type: "wood" },
          { x: 930, y: 475, width: 180, height: 18, type: "stone" }
        ],
        decorations: this.generateDecorations(4242, length, 1, 0.8),
        chests: [],
        dummy: { x: 700, y: 500, radius: 34, hp: Infinity },
        portal: { x: 1460, y: 485, radius: 58, unlocked: true },
        mapName: this.settings.language === "en" ? "Windbell Village" : "風鈴村莊"
      };
    }

    openRouteSelection() {
      this.mode = "route";
      this.routeChoices = this.generateRouteChoices();
      this.renderRouteChoices();
      this.showScreen("routeSelectScreen", false);
      this.audio.stopMusic();
    }

    generateRouteChoices() {
      if (this.run.bossPending) {
        return [{
          id: `boss-${this.run.chapter}`,
          type: "boss",
          modifiers: this.pickModifiers(1),
          rewardMultiplier: this.data.balance.bossRewardMultiplier
        }];
      }

      const rng = new SeededRandom(this.run.seed + this.run.chapter * 10007 + this.run.stageNumber * 997 + this.run.stagesCleared * 31);
      const types = ["normal"];
      const second = rng.next() < 0.58 ? "elite" : "normal";
      let third;
      if (this.run.stageNumber > 1 && rng.next() < 0.55) {
        third = "shop";
      } else {
        third = rng.next() < 0.45 ? "elite" : "normal";
      }
      types.push(second, third);

      return types.map((type, index) => {
        const modifierCount = type === "shop" ? 0 : clamp(1 + Math.floor((this.run.stageNumber + index) / 4), 1, 3);
        return {
          id: `${this.run.chapter}-${this.run.stageNumber}-${index}-${type}`,
          type,
          modifiers: this.pickModifiers(modifierCount, rng),
          rewardMultiplier: type === "elite"
            ? this.data.balance.eliteRewardMultiplier
            : this.data.balance.normalRewardMultiplier
        };
      });
    }

    pickModifiers(count, rng = null) {
      const random = rng || new SeededRandom(this.run.seed + performance.now());
      return random.shuffle(this.data.stageModifiers).slice(0, count);
    }

    renderRouteChoices() {
      const list = this.root.querySelector("#routeNodeList");
      const title = this.root.querySelector("#routeScreenTitle");
      const subtitle = this.root.querySelector("#routeScreenSubtitle");
      const chapter = this.data.chapters[this.run.chapter];
      const stageLabel = this.run.bossPending
        ? `${this.localize(chapter.shortName)}・BOSS`
        : `${this.localize(chapter.shortName)} ${this.run.chapter}-${this.run.stageNumber}`;

      title.textContent = this.settings.language === "en"
        ? `Choose the next route · ${stageLabel}`
        : `選擇下一個關卡・${stageLabel}`;
      subtitle.textContent = this.run.bossPending
        ? this.localize(this.data.bosses[chapter.boss].description)
        : (this.settings.language === "en"
          ? "Each route has different enemies, rewards and 1–3 stage traits."
          : "每條路線會隨機附帶 1～3 種關卡特性，菁英關卡獎勵較高。");

      const typeMeta = {
        normal: { icon: "fa-paw", color: "#4fd1c5", desc: this.settings.language === "en" ? "Balanced enemies and standard rewards." : "一般敵人配置與標準獎勵。" },
        elite: { icon: "fa-diamond", color: "#bd91ff", desc: this.settings.language === "en" ? "Stronger enemies with better XP, gold and chests." : "敵人更強，經驗、金幣與寶箱收益較高。" },
        shop: { icon: "fa-shopping-bag", color: "#ffb24f", desc: this.settings.language === "en" ? "Purchase items and healing. No combat in this node." : "購買道具與治療，本節點不會進行戰鬥。" },
        boss: { icon: "fa-fire", color: "#ff6b6b", desc: this.settings.language === "en" ? "Defeat the chapter guardian to proceed." : "擊敗章節守護者，開啟下一章。" }
      };

      list.innerHTML = this.routeChoices.map((node, index) => {
        const meta = typeMeta[node.type];
        const rewardPercent = Math.round((node.rewardMultiplier - 1 + node.modifiers.reduce((sum, modifier) => sum + modifier.rewardBonus, 0)) * 100);
        return `
          <button
            type="button"
            class="tyy-route-node"
            data-route-index="${index}"
            style="--node-color:${meta.color}"
          >
            <span class="tyy-route-node-type"><i class="fa ${meta.icon}"></i></span>
            <h4>${this.tr(node.type)}</h4>
            <p>${meta.desc}</p>
            <div class="tyy-route-node-modifiers">
              ${node.modifiers.length === 0
                ? `<span class="tyy-route-node-modifier"><i class="fa fa-check"></i>${this.settings.language === "en" ? "No combat modifiers" : "沒有戰鬥特性"}</span>`
                : node.modifiers.map(modifier => `
                  <span class="tyy-route-node-modifier">
                    <i class="fa ${modifier.icon}"></i>${this.localize(modifier.description)}
                  </span>
                `).join("")}
            </div>
            <div class="tyy-route-node-reward">${rewardPercent > 0
              ? `${this.settings.language === "en" ? "Reward" : "獎勵"} +${rewardPercent}%`
              : (this.settings.language === "en" ? "Safe supply" : "安全補給")}</div>
          </button>
        `;
      }).join("");

      list.querySelectorAll("[data-route-index]").forEach(button => {
        button.addEventListener("click", () => {
          const node = this.routeChoices[Number(button.dataset.routeIndex)];
          this.chooseRoute(node);
        });
      });
    }

    chooseRoute(node) {
      this.run.currentNode = node;
      if (node.type === "shop") {
        this.openShop();
      } else {
        this.startCombatStage(node);
      }
    }

    selectMapForStage() {
      const chapter = this.data.chapters[this.run.chapter];
      if (this.run.bossPending) return chapter.bossMap;
      const used = this.run.usedMaps[this.run.chapter] || [];
      const available = chapter.maps.filter(map => !used.includes(map.id));
      const pool = available.length ? available : chapter.maps;
      const rng = new SeededRandom(this.run.seed + this.run.stageNumber * 1103 + this.run.stagesCleared * 97);
      const map = pool[Math.floor(rng.next() * pool.length)];
      used.push(map.id);
      this.run.usedMaps[this.run.chapter] = used;
      return map;
    }

    startCombatStage(node) {
      const chapter = this.data.chapters[this.run.chapter];
      const map = this.selectMapForStage();
      const isBoss = node.type === "boss";
      const globalStage = (this.run.chapter - 1) * 10 + this.run.stageNumber;
      const modifierBonus = node.modifiers.reduce((sum, modifier) => sum + modifier.rewardBonus, 0);
      const targetKills = isBoss ? 1 : Math.round(
        (this.data.balance.killTargetBase + this.run.stageNumber * this.data.balance.killTargetPerStage)
        * (node.type === "elite" ? 1.25 : 1)
        * (node.modifiers.some(modifier => modifier.id === "crowded") ? 1.1 : 1)
      );

      this.stage = {
        node,
        map,
        chapter,
        isBoss,
        elapsed: 0,
        startedAt: performance.now(),
        kills: 0,
        targetKills,
        spawnTimer: this.data.balance.spawnIntervalStart || 2.8,
        spawnSequence: 0,
        rewardMultiplier: node.rewardMultiplier + modifierBonus,
        rewardPenaltyApplied: false,
        frenzyStarted: false,
        frenzyStacks: 0,
        lastFrenzyStack: 0,
        portalUnlocked: false,
        bossDefeated: false,
        bossSpawned: false,
        globalStage,
        mapName: this.localize(map.name)
      };

      this.world = this.generateCombatWorld(map, node);
      this.enemies = [];
      this.projectiles = [];
      this.enemyProjectiles = [];
      this.zones = [];
      this.particles = [];
      this.damageTexts = [];
      this.pickups = [];
      this.scheduledEvents = [];
      this.companions = this.companions.filter(companion => companion.duration === Infinity);

      this.createPlayer(false);
      this.player.x = 180;
      this.player.y = this.getGroundY(180) - this.player.height / 2;
      this.player.vx = 0;
      this.player.vy = 0;
      this.player.shield = 0;
      this.player.cooldowns = {};
      this.player.buffs = [];
      this.player.nineLivesReady = this.run.characterId === "cat";
      this.player.checkpointX = 180;
      this.player.checkpointY = this.player.y;
      this.camera.x = 0;
      this.camera.y = 0;
      this.mode = "stage";
      this.hideAllScreens();
      this.hud.classList.remove("is-hidden");

      if (isBoss) {
        this.spawnBoss();
        this.audio.play("boss");
      } else {
        const initialCount = node.type === "elite"
          ? (this.data.balance.initialEnemyCountElite || 5)
          : (this.data.balance.initialEnemyCountNormal || 3);
        for (let index = 0; index < initialCount; index += 1) {
          this.spawnEnemy(true);
        }
      }

      this.audio.startMusic(this.getMusicTheme());
      this.updateHud(true);
      this.toast(
        `${this.run.chapter}-${this.run.stageNumber}・${this.stage.mapName}`,
        isBoss
          ? this.localize(this.data.bosses[chapter.boss].description)
          : `${this.tr(node.type)}・${this.localize(chapter.name)}`,
        isBoss ? "danger" : "info"
      );
    }

    generateCombatWorld(map, node) {
      const rng = new SeededRandom(map.seed + this.run.seed + this.run.stageNumber * 131);
      const length = map.length;
      const terrain = [];
      const step = 70;
      let randomOffset = rng.range(-18, 18);

      for (let x = 0; x <= length; x += step) {
        randomOffset = lerp(randomOffset, rng.range(-28, 28), 0.31);
        const edgeFlatten = Math.min(1, x / 520, (length - x) / 520);
        const wave = Math.sin(x * map.hillFrequency) * map.hillAmplitude
          + Math.sin(x * map.hillFrequency * 2.4 + 1.4) * map.hillAmplitude * 0.34
          + Math.sin(x * map.hillFrequency * 0.46 + 0.4) * map.hillAmplitude * 0.18;
        const baseY = this.run.chapter === 1 ? 555 : 565;
        terrain.push({ x, y: baseY + (wave + randomOffset) * Math.max(0.15, edgeFlatten) });
      }

      const pits = [];
      for (let index = 0; index < map.pitCount; index += 1) {
        let start = rng.range(900, length - 900);
        let guard = 0;
        while (pits.some(pit => Math.abs(pit.start - start) < 620) && guard < 12) {
          start = rng.range(900, length - 900);
          guard += 1;
        }
        const width = rng.range(125, this.run.chapter === 1 ? 240 : 190);
        pits.push({ start, end: Math.min(length - 620, start + width) });
      }

      const waters = [];
      for (let index = 0; index < map.waterCount; index += 1) {
        const start = rng.range(650, length - 700);
        waters.push({
          start,
          end: Math.min(length - 420, start + rng.range(220, 520)),
          slow: 0.75
        });
      }

      const platforms = [];
      for (let index = 0; index < map.platformCount; index += 1) {
        const x = rng.range(560, length - 560);
        const ground = this.interpolateTerrain(terrain, x) || 560;
        platforms.push({
          id: `platform-${this.uid++}`,
          x,
          y: ground - rng.range(105, 235),
          width: rng.range(120, 245),
          height: 17,
          type: this.run.chapter === 1 ? (rng.next() < 0.52 ? "wood" : "stone") : (rng.next() < 0.58 ? "root" : "stone"),
          secret: false,
          revealed: true
        });
      }

      const secretRoutes = [];
      const secretRouteCount = Math.max(1, map.secretRouteCount || 1);
      for (let routeIndex = 0; routeIndex < secretRouteCount; routeIndex += 1) {
        const direction = routeIndex % 2 === 0 ? 1 : -1;
        const anchorX = rng.range(1350, length - 1450);
        const anchorGround = this.interpolateTerrain(terrain, anchorX) || 560;
        const routeId = `secret-${this.uid++}`;
        const routePlatforms = [];
        const pieces = rng.int(4, 6);
        for (let piece = 0; piece < pieces; piece += 1) {
          const x = anchorX + direction * piece * rng.range(125, 165);
          const rise = piece <= Math.ceil(pieces / 2)
            ? piece * rng.range(42, 58)
            : (pieces - piece) * rng.range(35, 48);
          const platform = {
            id: `secret-platform-${this.uid++}`,
            x: clamp(x, 420, length - 420),
            y: anchorGround - 100 - rise,
            width: rng.range(105, 155),
            height: 15,
            type: this.run.chapter === 1 ? (piece % 2 ? "wood" : "stone") : (piece % 2 ? "root" : "stone"),
            secret: true,
            secretRouteId: routeId,
            revealed: false
          };
          platforms.push(platform);
          routePlatforms.push(platform);
        }
        const finalPlatform = routePlatforms[routePlatforms.length - 1];
        secretRoutes.push({
          id: routeId,
          x: anchorX,
          y: anchorGround,
          revealRadius: 310,
          platforms: routePlatforms,
          chestX: finalPlatform.x + finalPlatform.width * 0.5,
          chestY: finalPlatform.y - 27,
          revealed: false
        });
      }

      const totalChestCount = node.type === "elite" ? rng.int(4, 5) : rng.int(3, 5);
      const secretChestCount = Math.min(secretRoutes.length, Math.max(1, Math.floor(totalChestCount / 3)));
      const regularChestCount = totalChestCount - secretChestCount;
      const chests = [];

      for (let index = 0; index < regularChestCount; index += 1) {
        const candidatePlatforms = platforms.filter(platform => !platform.secret);
        const usePlatform = candidatePlatforms.length > 0 && rng.next() < 0.46;
        let x;
        let y;
        if (usePlatform) {
          const platform = rng.pick(candidatePlatforms);
          x = platform.x + platform.width * 0.5;
          y = platform.y - 27;
        } else {
          x = 720 + (index + 0.5) * ((length - 1350) / Math.max(1, regularChestCount)) + rng.range(-180, 180);
          y = (this.interpolateTerrain(terrain, x) || 550) - 27;
        }
        chests.push({
          id: `chest-${this.uid++}`,
          x,
          y,
          opened: false,
          cost: this.getChestCost(),
          rarity: node.type === "elite" && index === regularChestCount - 1 ? "elite" : "normal",
          secret: false,
          revealed: true
        });
      }

      secretRoutes.slice(0, secretChestCount).forEach((route, index) => {
        chests.push({
          id: `secret-chest-${this.uid++}`,
          x: route.chestX,
          y: route.chestY,
          opened: false,
          cost: Math.round(this.getChestCost() * 0.85),
          rarity: node.type === "elite" || index === 1 ? "elite" : "normal",
          secret: true,
          secretRouteId: route.id,
          revealed: false
        });
      });

      return {
        type: "combat",
        chapter: this.run.chapter,
        length,
        terrain,
        pits,
        waters,
        platforms,
        secretRoutes,
        decorations: this.generateDecorations(map.seed + this.run.seed, length, this.run.chapter, map.landmarkDensity),
        chests,
        dummy: null,
        portal: { x: length - 190, y: (this.interpolateTerrain(terrain, length - 190) || 555) - 52, radius: 58, unlocked: false },
        mapName: this.localize(map.name)
      };
    }

    generateDecorations(seed, length, chapter, density = 1) {
      const rng = new SeededRandom(seed);
      const decorations = [];
      const count = Math.floor((length / 180) * density);
      for (let index = 0; index < count; index += 1) {
        const x = rng.range(80, length - 80);
        const typePool = chapter === 1
          ? ["tree", "bush", "flowers", "rock", "sign", "grass"]
          : ["deadTree", "reeds", "mushroom", "rock", "stump", "grass"];
        decorations.push({
          x,
          type: rng.pick(typePool),
          scale: rng.range(0.7, 1.35),
          layer: rng.next() < 0.42 ? "back" : "front",
          variant: rng.int(0, 3)
        });
      }
      return decorations;
    }

    getChestCost() {
      const globalStage = (this.run.chapter - 1) * 10 + this.run.stageNumber;
      return Math.round(this.data.balance.chestBaseCost * (1 + (globalStage - 1) * this.data.balance.chestStageGrowth));
    }

    openShop() {
      this.mode = "shop";
      this.audio.startMusic("village");
      this.activeShopOffers = this.getRandomItemChoices(3, true).map((choice, index) => ({
        ...choice,
        sold: false,
        price: Math.round(
          this.data.balance.shopBaseCost
          * (1 + (((this.run.chapter - 1) * 10 + this.run.stageNumber) - 1) * this.data.balance.shopStageGrowth)
          * (1 + index * 0.12)
        )
      }));
      this.renderShop();
      this.showScreen("shopScreen", false);
    }

    renderShop() {
      const list = this.root.querySelector("#shopOfferList");
      this.root.querySelector("#shopGoldText").textContent = Math.floor(this.run.gold);
      list.innerHTML = this.activeShopOffers.map((offer, index) => this.renderChoiceCard(offer, index, true)).join("");
      this.renderChoiceIcons(list);
      list.querySelectorAll("[data-choice-index]").forEach(button => {
        button.addEventListener("click", () => this.buyShopItem(Number(button.dataset.choiceIndex)));
      });
      const healCost = this.getShopHealCost();
      const healButton = this.root.querySelector("#shopHealButton");
      healButton.textContent = this.settings.language === "en"
        ? `Restore 35% HP · ${healCost} gold`
        : `恢復 35% 生命・${healCost} 金幣`;
      healButton.disabled = this.player.hp >= this.player.maxHp || this.run.gold < healCost;
    }

    getShopHealCost() {
      return Math.round(22 * (1 + ((this.run.chapter - 1) * 10 + this.run.stageNumber - 1) * 0.16));
    }

    buyShopHeal() {
      const cost = this.getShopHealCost();
      if (this.run.gold < cost || this.player.hp >= this.player.maxHp) return;
      this.run.gold -= cost;
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.player.maxHp * 0.35);
      this.audio.play("chest");
      this.toast(
        this.settings.language === "en" ? "Restored" : "補給完成",
        this.settings.language === "en" ? "Recovered 35% maximum health." : "已恢復 35% 最大生命。",
        "success"
      );
      this.renderShop();
      this.updateHud(true);
    }

    buyShopItem(index) {
      const offer = this.activeShopOffers[index];
      if (!offer || offer.sold) return;
      if (this.run.gold < offer.price) {
        this.toast(this.tr("insufficientGold"), `${offer.price} 金幣`, "danger");
        return;
      }
      this.run.gold -= offer.price;
      offer.sold = true;
      this.applyItemChoice(offer.id, "shop");
      this.renderShop();
    }

    leaveShop() {
      this.audio.stopMusic();
      this.completeCurrentNode(false);
    }

    completeCurrentNode(fromCombat = true) {
      this.run.stagesCleared += 1;

      if (this.run.bossPending) {
        if (this.run.chapter === 1) {
          this.run.chapter = 2;
          this.run.stageNumber = 1;
          this.run.bossPending = false;
          this.player.hp = this.player.maxHp;
          this.toast(
            this.settings.language === "en" ? "Chapter 2 unlocked" : "第二章開啟",
            this.settings.language === "en" ? "The Mistbound Swamp is now accessible." : "已開啟幽霧沼澤，怪物生命成長幅度提高為每關 20%。",
            "success"
          );
          this.enterVillage();
          return;
        }
        this.showResult(true);
        return;
      }

      if (this.run.stageNumber >= 10) {
        this.run.bossPending = true;
      } else {
        this.run.stageNumber += 1;
      }

      if (fromCombat) {
        const heal = this.player.maxHp * 0.08;
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + heal);
      }
      this.openRouteSelection();
    }

    showResult(victory) {
      this.mode = "result";
      this.audio.stopMusic();
      const elapsed = Math.max(1, (performance.now() - this.run.startedAt) / 1000);
      const title = this.root.querySelector("#resultTitle");
      const eyebrow = this.root.querySelector("#resultEyebrow");
      const description = this.root.querySelector("#resultDescription");

      eyebrow.textContent = victory ? "ADVENTURE COMPLETE" : "RUN ENDED";
      title.textContent = victory
        ? (this.settings.language === "en" ? "Two chapters cleared!" : "兩個章節全部通關！")
        : (this.settings.language === "en" ? "The adventure has ended" : "本次冒險結束");
      description.textContent = victory
        ? (this.settings.language === "en" ? "You defeated the Moonwhite Fox and Deepmarsh Otter. This prototype run is complete." : "你已擊敗月白狐王與深沼水獺王，完成目前測試版本的全部內容。")
        : (this.settings.language === "en" ? "Adjust your build and try another route." : "重新調整角色與道具組合，再挑戰不同路線。" );

      const stats = [
        [this.settings.language === "en" ? "Level" : "角色等級", this.run.level],
        [this.settings.language === "en" ? "Stages" : "完成關卡", this.run.stagesCleared],
        [this.settings.language === "en" ? "Kills" : "擊倒敵人", this.run.totalKills],
        [this.settings.language === "en" ? "Gold" : "累積金幣", Math.floor(this.run.totalGold)],
        [this.settings.language === "en" ? "Damage" : "造成傷害", Math.round(this.run.totalDamage)],
        [this.settings.language === "en" ? "Damage taken" : "受到傷害", Math.round(this.run.totalDamageTaken)],
        [this.settings.language === "en" ? "Chests" : "開啟寶箱", this.run.openedChests],
        [this.settings.language === "en" ? "Time" : "冒險時間", this.formatTime(elapsed)]
      ];
      this.root.querySelector("#resultStats").innerHTML = stats.map(([label, value]) => `
        <div class="tyy-result-stat"><span>${label}</span><strong>${value}</strong></div>
      `).join("");
      this.showScreen("resultScreen", false);
    }

    getGroundY(x) {
      if (!this.world) return null;
      if (this.world.pits?.some(pit => x >= pit.start && x <= pit.end)) return null;
      return this.interpolateTerrain(this.world.terrain, x);
    }

    interpolateTerrain(terrain, x) {
      if (!terrain || terrain.length === 0) return 560;
      if (x <= terrain[0].x) return terrain[0].y;
      const last = terrain[terrain.length - 1];
      if (x >= last.x) return last.y;
      const step = terrain[1].x - terrain[0].x;
      const index = clamp(Math.floor(x / step), 0, terrain.length - 2);
      const first = terrain[index];
      const second = terrain[index + 1];
      const amount = (x - first.x) / Math.max(1, second.x - first.x);
      return lerp(first.y, second.y, amount);
    }

    getWaterAt(x) {
      return this.world?.waters?.find(water => x >= water.start && x <= water.end) || null;
    }

    getPlatformLanding(entity, previousBottom) {
      if (!this.world?.platforms) return null;
      const halfWidth = entity.width / 2;
      const bottom = entity.y + entity.height / 2;
      let landing = null;
      for (const platform of this.world.platforms) {
        if (
          entity.x + halfWidth > platform.x
          && entity.x - halfWidth < platform.x + platform.width
          && previousBottom <= platform.y + 8
          && bottom >= platform.y
          && entity.vy >= 0
        ) {
          if (!landing || platform.y < landing.y) landing = platform;
        }
      }
      return landing;
    }

    loop(timestamp) {
      if (this.destroyed) return;
      const delta = clamp((timestamp - this.lastFrameTime) / 1000, 0, 0.033);
      this.lastFrameTime = timestamp;

      if (["village", "stage"].includes(this.mode)) {
        this.update(delta, timestamp / 1000);
        this.draw(timestamp / 1000);
      } else if (["pause", "levelUp", "route", "shop", "settings"].includes(this.mode) && this.world && this.player) {
        this.draw(timestamp / 1000);
      } else if (this.mode === "character") {
        this.drawCharacterSelectionCanvases(timestamp / 1000);
      } else if (this.mode === "main") {
        this.drawMainMenuParty(timestamp / 1000);
      }

      this.justPressed.clear();
      this.animationId = requestAnimationFrame(time => this.loop(time));
    }

    update(delta, now) {
      this.updateScheduledEvents(now);
      this.updatePlayer(delta, now);
      this.updateProjectiles(delta, now);
      this.updateZones(delta, now);
      this.updateCompanions(delta, now);
      this.updateParticles(delta);
      this.updateDamageTexts(delta);

      if (this.mode === "stage") {
        this.updateStage(delta, now);
        this.updateEnemies(delta, now);
        this.updatePickups(delta, now);
      } else if (this.mode === "village") {
        this.updateVillage(delta, now);
      }

      this.updateCamera(delta);
      if (performance.now() - this.lastHudUpdate > 80) {
        this.updateHud();
        this.lastHudUpdate = performance.now();
      }
    }

    updateScheduledEvents(now) {
      const ready = this.scheduledEvents.filter(event => event.time <= now);
      this.scheduledEvents = this.scheduledEvents.filter(event => event.time > now);
      ready.forEach(event => {
        try {
          event.callback();
        } catch (error) {
          console.error("排程技能執行錯誤", error);
        }
      });
    }

    schedule(delay, callback) {
      this.scheduledEvents.push({ time: performance.now() / 1000 + delay, callback });
    }

    updateVillage(delta, now) {
      if (this.dummyLastHit > 0 && now - this.dummyLastHit > 3) {
        this.dummyDamage = 0;
        this.dummyLastHit = 0;
      }
      this.updatePrompt();
    }

    updateStage(delta, now) {
      this.stage.elapsed += delta;
      const balance = this.data.balance;

      if (!this.stage.rewardPenaltyApplied && this.stage.elapsed >= balance.rewardPenaltyTime) {
        this.stage.rewardPenaltyApplied = true;
        this.toast(this.tr("rewardsReduced"), this.settings.language === "en" ? "Finish the stage soon to avoid further pressure." : "請盡快完成關卡，避免後續怪物持續增強。", "danger");
      }

      if (!this.stage.frenzyStarted && this.stage.elapsed >= balance.frenzyStartTime) {
        this.stage.frenzyStarted = true;
        this.stage.lastFrenzyStack = this.stage.elapsed;
        this.toast(this.tr("frenzyStarted"), this.settings.language === "en" ? "Enemy strength and spawn count increase every 15 seconds." : "每 15 秒提高怪物強度與數量。", "danger");
      }

      if (
        this.stage.frenzyStarted
        && this.stage.elapsed - this.stage.lastFrenzyStack >= balance.frenzyInterval
      ) {
        this.stage.frenzyStacks += 1;
        this.stage.lastFrenzyStack = this.stage.elapsed;
        this.toast(
          this.settings.language === "en" ? `Frenzy ${this.stage.frenzyStacks}` : `催促強化 ${this.stage.frenzyStacks} 層`,
          this.settings.language === "en" ? "Enemies are growing stronger." : "怪物生命、傷害與刷新數量再次提升。",
          "danger",
          1500
        );
      }

      if (!this.stage.isBoss) {
        this.stage.spawnTimer -= delta;
        const ramp = clamp(this.stage.elapsed / (balance.spawnRampTime || 240), 0, 1);
        const stagePressure = 1 + Math.max(0, this.run.stageNumber - 1) * 0.035;
        const frenzyPressure = 1 + this.stage.frenzyStacks * 0.13;
        const activeCap = Math.min(
          balance.maxEnemies,
          (balance.activeEnemyCapStart || 16)
            + Math.floor(this.stage.elapsed / 22) * 2
            + this.run.stageNumber * 2
            + (this.stage.node.type === "elite" ? 7 : 0)
            + this.stage.frenzyStacks * 3
        );

        if (this.stage.spawnTimer <= 0 && this.enemies.filter(enemy => !enemy.dead).length < activeCap) {
          let count = 1;
          if (ramp > 0.35 && Math.random() < 0.34 + ramp * 0.26) count += 1;
          if (this.stage.node.type === "elite" && ramp > 0.55 && Math.random() < 0.42) count += 1;
          if (this.stage.frenzyStacks > 0) count += Math.min(4, Math.ceil(this.stage.frenzyStacks / 2));
          count = Math.min(7, count);
          for (let index = 0; index < count; index += 1) this.spawnEnemy(false);

          const startInterval = balance.spawnIntervalStart || 2.8;
          const floorInterval = balance.spawnIntervalFloor || 0.58;
          const baseInterval = lerp(startInterval, floorInterval, Math.pow(ramp, 0.82));
          this.stage.spawnTimer = Math.max(
            floorInterval * 0.58,
            baseInterval / stagePressure / frenzyPressure
          );
        }

        if (
          !this.stage.portalUnlocked
          && this.stage.kills >= this.stage.targetKills
          && this.stage.elapsed >= balance.portalMinTime
        ) {
          this.unlockPortal();
        }
      } else if (this.stage.bossDefeated && !this.stage.portalUnlocked) {
        this.unlockPortal();
      }

      this.updatePrompt();
    }

    unlockPortal() {
      this.stage.portalUnlocked = true;
      this.world.portal.unlocked = true;
      this.audio.play("portal");
      this.toast(this.tr("portalUnlocked"), this.settings.language === "en" ? "Reach the portal at the end of the map." : "前往地圖終點，按 F 進入下一個節點。", "success");
    }

    updatePlayer(delta, now) {
      if (!this.player || !this.world) return;
      const player = this.player;
      const stats = player.stats;
      const character = this.data.characters[this.run.characterId];
      const left = this.keys.has(this.keybinds.moveLeft) || this.keys.has("ArrowLeft");
      const right = this.keys.has(this.keybinds.moveRight) || this.keys.has("ArrowRight");
      const down = this.keys.has(this.keybinds.moveDown) || this.keys.has("ArrowDown");
      const moveDirection = (right ? 1 : 0) - (left ? 1 : 0);
      const water = this.getWaterAt(player.x);
      const buffSpeed = this.getBuffValue("moveSpeedMultiplier", 1);
      const waterMultiplier = water ? water.slow : 1;
      const targetSpeed = moveDirection * stats.moveSpeed * buffSpeed * waterMultiplier;
      const wasGrounded = player.onGround;
      const acceleration = player.onGround ? 12 : 7;

      if (wasGrounded) {
        player.coyoteUntil = now + 0.14;
        player.jumpsRemaining = 2;
      }

      player.vx = lerp(player.vx, targetSpeed, clamp(acceleration * delta, 0, 1));
      if (moveDirection === 0 && player.onGround) {
        player.vx *= Math.pow(0.0008, delta);
      }
      if (moveDirection !== 0) player.facing = moveDirection;

      if (player.jumpQueued) {
        const canGroundJump = wasGrounded || now <= (player.coyoteUntil || 0);
        const canAirJump = !canGroundJump && player.jumpsRemaining > 0;
        if (canGroundJump || canAirJump) {
          const jumpIndex = canGroundJump ? 1 : 2;
          const baseJump = character.id === "rabbit" ? 665 : 615;
          player.vy = -baseJump * (jumpIndex === 2 ? 0.9 : 1);
          player.onGround = false;
          player.coyoteUntil = 0;
          player.jumpsRemaining = Math.max(0, (canGroundJump ? 2 : player.jumpsRemaining) - 1);
          this.spawnDust(player.x, player.y + player.height / 2, character.accent, jumpIndex === 2 ? 14 : 10);
          if (jumpIndex === 2) {
            this.spawnShockwave(player.x, player.y + player.height * 0.35, 48, `${character.accent}cc`);
            this.toast(
              this.settings.language === "en" ? "Double jump" : "二段跳",
              this.settings.language === "en" ? "Air step activated." : "空中踏步啟動。",
              "info",
              650
            );
          }
          this.audio.tone(jumpIndex === 2 ? 470 : 350, 0.075, "triangle", 0.06);
        }
        player.jumpQueued = false;
      }

      player.vy += (down ? 2200 : 1680) * delta;
      const previousBottom = player.y + player.height / 2;
      player.x += player.vx * delta;
      player.y += player.vy * delta;
      player.x = clamp(player.x, 25, this.world.length - 25);
      player.onGround = false;

      const platform = this.getPlatformLanding(player, previousBottom);
      if (platform) {
        player.y = platform.y - player.height / 2;
        player.vy = 0;
        player.onGround = true;
        player.lastGroundY = platform.y;
      } else {
        const groundY = this.getGroundY(player.x);
        const slopeSnap = wasGrounded ? 76 : 34;
        if (
          groundY !== null
          && player.y + player.height / 2 >= groundY
          && previousBottom <= groundY + slopeSnap
          && player.vy >= 0
        ) {
          player.y = groundY - player.height / 2;
          player.vy = 0;
          player.onGround = true;
          player.lastGroundY = groundY;
        }
      }

      if (player.onGround) {
        player.coyoteUntil = now + 0.14;
        player.jumpsRemaining = 2;
      }

      this.updateSecretRouteDiscovery();

      if (player.y > this.canvas.height + 260) {
        this.fallIntoPit();
      }

      if (player.x > player.checkpointX + 520) {
        const checkpointGround = this.getGroundY(player.x - 130);
        if (checkpointGround !== null) {
          player.checkpointX = player.x - 130;
          player.checkpointY = checkpointGround - player.height / 2;
        }
      }

      this.mouse.worldX = this.camera.x + this.mouse.x;
      this.mouse.worldY = this.camera.y + this.mouse.y;
      player.aimAngle = Math.atan2(this.mouse.worldY - player.y, this.mouse.worldX - player.x);

      if (this.mouse.left) this.performBasicAttack();
      this.updateBuffs(now);
      this.updateAutomaticItems(now);
      this.updateFortress(now);
    }


    updateSecretRouteDiscovery() {
      for (const route of this.world?.secretRoutes || []) {
        if (route.revealed) continue;
        const nearAnchor = Math.hypot(this.player.x - route.x, this.player.y - (route.y - 70)) <= route.revealRadius;
        const nearPlatform = route.platforms.some(platform => (
          Math.abs(this.player.x - (platform.x + platform.width * 0.5)) < 180
          && Math.abs(this.player.y - platform.y) < 150
        ));
        if (!nearAnchor && !nearPlatform) continue;
        route.revealed = true;
        route.platforms.forEach(platform => { platform.revealed = true; });
        (this.world.chests || []).forEach(chest => {
          if (chest.secretRouteId === route.id) chest.revealed = true;
        });
        this.spawnBurst(route.x, route.y - 85, this.run.chapter === 1 ? "#f9dc72" : "#7ce4c5", 28);
        this.toast(
          this.settings.language === "en" ? "Hidden route discovered" : "發現隱藏通路",
          this.settings.language === "en" ? "Follow the faint platforms to find a secret chest." : "沿著浮現的平台探索，可找到隱藏寶箱。",
          "success",
          2400
        );
      }
    }

    fallIntoPit() {
      if (!this.player) return;
      this.player.x = this.player.checkpointX;
      this.player.y = this.player.checkpointY - 40;
      this.player.vx = 0;
      this.player.vy = 0;
      this.playerTakeDamage(Math.max(8, this.player.maxHp * 0.12), "pit", true);
      this.camera.shake = 10;
      this.toast(
        this.settings.language === "en" ? "Fell into a pit" : "掉入凹洞",
        this.settings.language === "en" ? "Returned to the latest safe point." : "已返回最近的安全位置並受到傷害。",
        "danger",
        1600
      );
    }

    updateBuffs(now) {
      this.player.buffs = this.player.buffs.filter(buff => buff.until > now);
    }

    getBuffValue(property, defaultValue = 1) {
      let value = defaultValue;
      for (const buff of this.player?.buffs || []) {
        if (buff[property] !== undefined) {
          if (property.endsWith("Multiplier")) value *= buff[property];
          else value += buff[property];
        }
      }
      return value;
    }

    addBuff(buff) {
      const now = performance.now() / 1000;
      this.player.buffs = this.player.buffs.filter(existing => existing.id !== buff.id);
      this.player.buffs.push({ ...buff, until: now + buff.duration });
    }

    updateAutomaticItems(now) {
      const staffLevel = Number(this.run.items.wisdomStaff || 0);
      if (staffLevel > 0) {
        const interval = Math.max(0.45, 2 - (staffLevel - 1) * 0.09);
        if (now - this.player.wisdomShotAt >= interval) {
          const target = this.findNearestEnemy(this.player.x, this.player.y, 720);
          if (target) {
            this.player.wisdomShotAt = now;
            const angle = Math.atan2(target.y - this.player.y, target.x - this.player.x);
            this.createPlayerProjectile({
              angle,
              speed: 520,
              damage: this.player.stats.damage * (0.45 + (staffLevel - 1) * 0.1),
              radius: 10,
              life: 2,
              kind: "ice",
              color: "#9ee9ff",
              slow: 0.35,
              slowDuration: 1.8,
              isSkill: false
            });
          }
        }
      }
    }

    updateFortress(now) {
      const fortress = this.player.buffs.find(buff => buff.id === "fortress");
      if (!fortress) return;
      if (now >= this.player.fortressPulseAt) {
        this.player.fortressPulseAt = now + 0.8;
        this.areaDamage(this.player.x, this.player.y, 165, this.player.stats.damage * 0.55, {
          isSkill: true,
          knockback: 260,
          color: "#72d7dc"
        });
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.player.maxHp * 0.012);
      }
    }

    updateCamera(delta) {
      if (!this.player || !this.world) return;
      const aimOffsetX = clamp((this.mouse.x - this.canvas.width / 2) * 0.2, -this.canvas.width * 0.1, this.canvas.width * 0.1);
      const aimOffsetY = clamp((this.mouse.y - this.canvas.height / 2) * 0.12, -this.canvas.height * 0.08, this.canvas.height * 0.08);
      const targetX = clamp(this.player.x - this.canvas.width / 2 + aimOffsetX, 0, Math.max(0, this.world.length - this.canvas.width));
      const targetY = clamp(this.player.y - this.canvas.height * 0.58 + aimOffsetY, -190, 150);
      this.camera.x = lerp(this.camera.x, targetX, clamp(delta * 5.8, 0, 1));
      this.camera.y = lerp(this.camera.y, targetY, clamp(delta * 4.2, 0, 1));
      this.camera.shake = Math.max(0, this.camera.shake - delta * 26);
    }

    interact() {
      if (!this.player || !this.world) return;
      const chest = this.findNearestChest();
      if (chest) {
        this.openChest(chest);
        return;
      }
      const portal = this.world.portal;
      if (portal && distance(this.player, portal) < 105) {
        if (this.mode === "village") {
          this.audio.play("portal");
          this.openRouteSelection();
        } else if (this.mode === "stage" && portal.unlocked) {
          this.audio.play("portal");
          this.completeCurrentNode(true);
        } else if (this.mode === "stage") {
          this.toast(
            this.settings.language === "en" ? "Portal locked" : "傳送門尚未開啟",
            this.stage.isBoss
              ? this.tr("bossObjective")
              : `${this.stage.kills} / ${this.stage.targetKills}`,
            "danger",
            1400
          );
        }
      }
    }

    findNearestChest() {
      return this.world?.chests?.find(chest => !chest.opened && Math.hypot(this.player.x - chest.x, this.player.y - chest.y) < 82) || null;
    }

    openChest(chest) {
      if (this.run.gold < chest.cost) {
        this.toast(this.tr("insufficientGold"), `${chest.cost} 金幣`, "danger");
        return;
      }
      this.run.gold -= chest.cost;
      chest.opened = true;
      this.run.openedChests += 1;
      const choices = this.getRandomItemChoices(1, false);
      const item = choices[0];
      if (item) this.applyItemChoice(item.id, "chest");
      this.audio.play("chest");
      this.spawnBurst(chest.x, chest.y, chest.rarity === "elite" ? "#bd91ff" : "#ffcf68", 24);
    }

    updatePrompt() {
      if (!this.player || !this.world) {
        this.prompt.classList.add("is-hidden");
        return;
      }
      const chest = this.findNearestChest();
      const portal = this.world.portal;
      let text = "";
      if (chest) {
        text = `<kbd>${this.formatKeyCode(this.keybinds.interact)}</kbd>${this.tr("openChest")}・${chest.cost} 金幣`;
      } else if (portal && distance(this.player, portal) < 105) {
        if (this.mode === "village") {
          text = `<kbd>${this.formatKeyCode(this.keybinds.interact)}</kbd>${this.tr("enterPortal")}`;
        } else if (portal.unlocked) {
          text = `<kbd>${this.formatKeyCode(this.keybinds.interact)}</kbd>${this.tr("enterPortal")}`;
        } else {
          text = this.stage.isBoss
            ? this.tr("bossObjective")
            : `${this.settings.language === "en" ? "Portal locked" : "傳送門未開啟"}・${this.stage.kills}/${this.stage.targetKills}`;
        }
      } else if (this.world.dummy && distance(this.player, this.world.dummy) < 125) {
        text = `${this.tr("dummy")}・${this.settings.language === "en" ? "Damage" : "累積傷害"} ${Math.round(this.dummyDamage)}`;
      }

      if (text) {
        this.prompt.innerHTML = text;
        this.prompt.classList.remove("is-hidden");
      } else {
        this.prompt.classList.add("is-hidden");
      }
    }

    performBasicAttack() {
      if (!this.player || !["village", "stage"].includes(this.mode)) return;
      const now = performance.now() / 1000;
      const attackSpeedBuff = this.getBuffValue("attackSpeedMultiplier", 1);
      const interval = 1 / Math.max(0.1, this.player.stats.attackRate * attackSpeedBuff);
      if (now - this.player.lastAttackAt < interval) return;

      this.player.lastAttackAt = now;
      this.player.attackAnimUntil = now + Math.min(0.22, interval * 0.8);
      this.player.attackSequence += 1;
      const character = this.data.characters[this.run.characterId];
      const angle = this.player.aimAngle;

      if (character.attack.type === "melee") {
        const centerX = this.player.x + Math.cos(angle) * character.attack.range * 0.55;
        const centerY = this.player.y + Math.sin(angle) * character.attack.range * 0.35;
        this.meleeAttack(centerX, centerY, character.attack.range, character.attack.arc, angle, this.player.stats.damage * character.attack.damageMultiplier, {
          isSkill: false,
          knockback: this.run.characterId === "hippo" ? 230 : 95,
          color: character.accent
        });
        this.audio.play("attack");
      } else if (character.attack.type === "boomerang") {
        this.createPlayerProjectile({
          angle,
          speed: character.attack.projectileSpeed,
          damage: this.player.stats.damage * character.attack.damageMultiplier,
          radius: 12,
          life: 1.15,
          kind: "bone",
          color: character.accent,
          returning: true,
          pierce: 2,
          isSkill: false
        });
        this.audio.play("shoot");
      } else {
        this.createPlayerProjectile({
          angle,
          speed: character.attack.projectileSpeed,
          damage: this.player.stats.damage * character.attack.damageMultiplier,
          radius: this.run.characterId === "rabbit" ? 9 : 8,
          life: 2,
          kind: this.run.characterId === "rabbit" ? "carrot" : "leaf",
          color: character.accent,
          pierce: character.attack.pierce || 0,
          isSkill: false
        });
        this.audio.play("shoot");
      }

      this.triggerBasicAttackItems(angle);
    }

    triggerBasicAttackItems(angle) {
      const knifeCount = Number(this.run.items.butterflyKnife || 0);
      const knifeChance = Math.min(0.8, 0.12 + Math.max(0, knifeCount - 1) * 0.035);
      if (knifeCount > 0 && Math.random() < knifeChance) {
        const knifeAmount = Math.min(4, 1 + Math.floor((knifeCount - 1) / 8));
        for (let index = 0; index < knifeAmount; index += 1) {
          const offset = (index - (knifeAmount - 1) / 2) * 0.09;
          this.createPlayerProjectile({
            angle: angle + offset + (Math.random() - 0.5) * 0.05,
            speed: 720,
            damage: this.player.stats.damage * (0.55 + Math.max(0, knifeCount - 1) * 0.06),
            radius: 7,
            life: 1.4,
            kind: "knife",
            color: "#c9a4ff",
            pierce: 1,
            isSkill: false
          });
        }
      }

      const snowCount = Number(this.run.items.snowball || 0);
      const snowChance = Math.min(0.75, 0.25 + Math.max(0, snowCount - 1) * 0.025);
      if (snowCount > 0 && Math.random() < snowChance) {
        const snowAmount = Math.min(3, 1 + Math.floor((snowCount - 1) / 10));
        for (let index = 0; index < snowAmount; index += 1) {
          const offset = (index - (snowAmount - 1) / 2) * 0.12;
          this.createPlayerProjectile({
            angle: angle + offset + (Math.random() - 0.5) * 0.05,
            speed: 480,
            damage: this.player.stats.damage * (0.4 + Math.max(0, snowCount - 1) * 0.08),
            radius: 13,
            life: 1.8,
            kind: "snowball",
            color: "#e6f8ff",
            slow: 0.42,
            slowDuration: 2,
            isSkill: false
          });
        }
      }
    }

    meleeAttack(centerX, centerY, range, arc, angle, damage, options = {}) {
      const targets = this.mode === "village" && this.world.dummy
        ? []
        : this.enemies;
      let hitCount = 0;
      for (const enemy of targets) {
        if (enemy.dead) continue;
        const dx = enemy.x - this.player.x;
        const dy = enemy.y - this.player.y;
        const targetDistance = Math.hypot(dx, dy);
        if (targetDistance > range + enemy.radius) continue;
        const targetAngle = Math.atan2(dy, dx);
        const difference = Math.atan2(Math.sin(targetAngle - angle), Math.cos(targetAngle - angle));
        if (Math.abs(difference) <= arc / 2) {
          this.damageEnemy(enemy, damage, options);
          if (options.knockback) this.knockbackEnemy(enemy, angle, options.knockback);
          hitCount += 1;
        }
      }

      if (this.mode === "village" && this.world.dummy) {
        const dummy = this.world.dummy;
        const dx = dummy.x - this.player.x;
        const dy = dummy.y - this.player.y;
        const targetDistance = Math.hypot(dx, dy);
        const targetAngle = Math.atan2(dy, dx);
        const difference = Math.atan2(Math.sin(targetAngle - angle), Math.cos(targetAngle - angle));
        if (targetDistance <= range + dummy.radius && Math.abs(difference) <= arc / 2) {
          this.damageDummy(damage, options);
          hitCount += 1;
        }
      }

      this.createSlashEffect(centerX, centerY, angle, range, options.color || "#fff");
      return hitCount;
    }

    damageDummy(amount, options = {}) {
      const result = this.rollPlayerDamage(amount, options.isSkill);
      this.dummyDamage += result.damage;
      this.dummyLastHit = performance.now() / 1000;
      this.addDamageText(this.world.dummy.x, this.world.dummy.y - 45, result.damage, result.critical, "#ffdc75");
      this.spawnBurst(this.world.dummy.x, this.world.dummy.y, "#d8b06c", 7);
      this.run.totalDamage += result.damage;
      if (result.critical) this.audio.play("crit");
      else this.audio.play("hit");
    }

    useSkill(slot) {
      if (!this.player || !["village", "stage"].includes(this.mode)) return;
      const character = this.data.characters[this.run.characterId];
      const skill = character.skills[slot];
      if (!skill) return;
      const now = performance.now() / 1000;
      const readyAt = Number(this.player.cooldowns[slot] || 0);
      if (now < readyAt) return;

      const cooldownPenalty = this.stage?.node?.modifiers?.some(modifier => modifier.id === "slowCooldown") ? 1.1 : 1;
      const cooldown = skill.cooldown * cooldownPenalty / Math.max(0.35, this.player.stats.cooldownRate);
      this.player.cooldowns[slot] = now + cooldown;
      this.player.attackAnimUntil = now + 0.3;
      this.audio.play("skill");

      const handlers = {
        cat: () => this.useCatSkill(slot),
        rabbit: () => this.useRabbitSkill(slot),
        hippo: () => this.useHippoSkill(slot),
        deer: () => this.useDeerSkill(slot),
        dog: () => this.useDogSkill(slot)
      };
      handlers[this.run.characterId]?.();
      this.buildAbilityBar();
    }

    getAimPoint(maxDistance = 650) {
      const dx = this.mouse.worldX - this.player.x;
      const dy = this.mouse.worldY - this.player.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      const distanceValue = Math.min(maxDistance, length);
      return {
        x: this.player.x + dx / length * distanceValue,
        y: this.player.y + dy / length * distanceValue,
        angle: Math.atan2(dy, dx)
      };
    }

    dashPlayer(angle, distanceValue, damage = 0, radius = 55, options = {}) {
      const steps = Math.max(3, Math.ceil(distanceValue / 45));
      const startX = this.player.x;
      const startY = this.player.y;
      let endX = startX;
      let endY = startY;
      const hit = new Set();

      for (let index = 1; index <= steps; index += 1) {
        const amount = index / steps;
        const testX = startX + Math.cos(angle) * distanceValue * amount;
        const testY = startY + Math.sin(angle) * distanceValue * amount * 0.55;
        const ground = this.getGroundY(testX);
        if (ground === null) break;
        endX = clamp(testX, 30, this.world.length - 30);
        endY = Math.min(testY, ground - this.player.height / 2);
        if (damage > 0) {
          for (const enemy of this.enemies) {
            if (enemy.dead || hit.has(enemy.id)) continue;
            if (Math.hypot(enemy.x - endX, enemy.y - endY) <= radius + enemy.radius) {
              hit.add(enemy.id);
              this.damageEnemy(enemy, damage, { isSkill: true, ...options });
            }
          }
        }
      }

      this.player.x = endX;
      this.player.y = endY;
      this.player.vx = Math.cos(angle) * 120;
      this.player.vy = Math.sin(angle) * 80;
      this.spawnDashTrail(startX, startY, endX, endY, options.color || "#fff");
      return hit.size;
    }

    useCatSkill(slot) {
      const angle = this.player.aimAngle;
      const damage = this.player.stats.damage * this.player.stats.skillPower;
      if (slot === "secondary") {
        this.player.invulnerableUntil = performance.now() / 1000 + 0.35;
        this.dashPlayer(angle, 260, damage * 1.5, 62, { color: "#ffd06b", knockback: 140 });
      } else if (slot === "q") {
        [-0.28, 0, 0.28].forEach((offset, index) => {
          this.schedule(index * 0.08, () => {
            this.createPlayerProjectile({
              angle: angle + offset,
              speed: 610,
              damage: damage * 1.05,
              radius: 16,
              life: 1.15,
              kind: "clawWave",
              color: "#f8c65f",
              pierce: 3,
              isSkill: true
            });
          });
        });
      } else if (slot === "e") {
        this.player.shield += this.player.maxHp * 0.22;
        this.player.invulnerableUntil = performance.now() / 1000 + 1.2;
        this.addBuff({ id: "catNineLives", duration: 4, moveSpeedMultiplier: 1.25 });
        this.spawnBurst(this.player.x, this.player.y, "#ffe59d", 24);
      } else if (slot === "r") {
        this.addBuff({
          id: "midnightHunt",
          duration: 8,
          moveSpeedMultiplier: 1.35,
          attackSpeedMultiplier: 1.65,
          critChanceBonus: 0.3
        });
        this.spawnBurst(this.player.x, this.player.y, "#b08cff", 36);
      }
    }

    useRabbitSkill(slot) {
      const angle = this.player.aimAngle;
      const damage = this.player.stats.damage * this.player.stats.skillPower;
      if (slot === "secondary") {
        [-0.17, 0, 0.17].forEach(offset => {
          this.createPlayerProjectile({
            angle: angle + offset,
            speed: 720,
            damage: damage * 0.9,
            radius: 9,
            life: 2,
            kind: "carrot",
            color: "#ff9f6e",
            isSkill: true
          });
        });
      } else if (slot === "q") {
        const point = this.getAimPoint(560);
        for (let index = 0; index < 12; index += 1) {
          this.schedule(index * 0.075, () => {
            const x = point.x + (Math.random() - 0.5) * 260;
            this.createFallingProjectile(x, point.y - 360 - Math.random() * 160, damage * 0.72, "carrotRain", "#ffb475");
          });
        }
      } else if (slot === "e") {
        this.player.invulnerableUntil = performance.now() / 1000 + 0.7;
        this.dashPlayer(angle, 340, 0, 40, { color: "#f3eee1" });
        this.spawnBurst(this.player.x, this.player.y, "#d6c3a6", 18);
      } else if (slot === "r") {
        for (let index = 0; index < 24; index += 1) {
          this.schedule(index * 0.12, () => {
            const target = this.findNearestEnemy(this.player.x, this.player.y, 950);
            const targetAngle = target
              ? Math.atan2(target.y - this.player.y, target.x - this.player.x)
              : this.player.aimAngle + (Math.random() - 0.5) * 0.5;
            this.createPlayerProjectile({
              angle: targetAngle,
              speed: 690,
              damage: damage * 0.62,
              radius: 9,
              life: 2.3,
              kind: "moonCarrot",
              color: "#fff0a5",
              homing: 2.8,
              isSkill: true
            });
          });
        }
      }
    }

    useHippoSkill(slot) {
      const angle = this.player.aimAngle;
      const damage = this.player.stats.damage * this.player.stats.skillPower;
      if (slot === "secondary") {
        this.player.shield += this.player.maxHp * 0.12 * this.player.stats.shieldMultiplier;
        this.dashPlayer(angle, 240, damage * 1.2, 72, { color: "#88e0dc", knockback: 420 });
      } else if (slot === "q") {
        const hits = this.areaDamage(this.player.x, this.player.y, 210, damage * 1.8, {
          isSkill: true,
          stun: 1.15,
          knockback: 300,
          color: "#89d3c8"
        });
        this.camera.shake = Math.max(this.camera.shake, 13);
        this.spawnShockwave(this.player.x, this.player.y, 210, "#88e0dc");
        if (hits >= 4) this.player.shield += this.player.maxHp * 0.08 * this.player.stats.shieldMultiplier;
      } else if (slot === "e") {
        this.player.shield += this.player.maxHp * 0.42 * this.player.stats.shieldMultiplier;
        this.addBuff({ id: "guardianPool", duration: 7, damageReduction: 0.18 });
        this.zones.push({
          id: this.uid++,
          x: this.player.x,
          y: this.player.y,
          followPlayer: true,
          radius: 180,
          duration: 7,
          elapsed: 0,
          tickTimer: 0,
          damage: 0,
          slow: 0.42,
          color: "rgba(93,210,216,.28)",
          kind: "guardian"
        });
      } else if (slot === "r") {
        this.addBuff({ id: "fortress", duration: 10, damageReduction: 0.55, moveSpeedMultiplier: 0.82 });
        this.player.shield += this.player.maxHp * 0.3 * this.player.stats.shieldMultiplier;
        this.player.fortressPulseAt = 0;
        this.spawnBurst(this.player.x, this.player.y, "#72d7dc", 40);
      }
    }

    useDeerSkill(slot) {
      const angle = this.player.aimAngle;
      const damage = this.player.stats.damage * this.player.stats.skillPower;
      if (slot === "secondary") {
        this.createPlayerProjectile({
          angle,
          speed: 780,
          damage: damage * 1.6,
          radius: 12,
          life: 1.5,
          kind: "thornLance",
          color: "#8edf8f",
          pierce: 8,
          isSkill: true
        });
      } else if (slot === "q") {
        const point = this.getAimPoint(560);
        this.zones.push({
          id: this.uid++,
          x: point.x,
          y: point.y,
          radius: 190,
          duration: 6,
          elapsed: 0,
          tickTimer: 0,
          tickInterval: 0.55,
          damage: damage * 0.42,
          slow: 0.38,
          color: "rgba(94,190,105,.28)",
          kind: "forestCircle",
          isSkill: true
        });
      } else if (slot === "e") {
        const startX = this.player.x;
        const startY = this.player.y;
        this.dashPlayer(angle, 300, 0, 40, { color: "#98e8a1" });
        this.schedule(0.22, () => {
          this.areaDamage(startX, startY, 150, damage * 1.25, { isSkill: true, color: "#8edf8f" });
          this.spawnBurst(startX, startY, "#8edf8f", 26);
        });
      } else if (slot === "r") {
        const point = this.getAimPoint(620);
        let totalHits = 0;
        for (let wave = 0; wave < 4; wave += 1) {
          this.schedule(wave * 0.55, () => {
            for (let index = 0; index < 5; index += 1) {
              const x = point.x + (Math.random() - 0.5) * 420;
              const y = point.y + (Math.random() - 0.5) * 160;
              this.schedule(index * 0.08, () => {
                const hits = this.areaDamage(x, y, 80, damage * 0.85, { isSkill: true, color: "#dffcae" });
                totalHits += hits;
                this.spawnStarfall(x, y);
              });
            }
          });
        }
        this.schedule(2.4, () => {
          if (totalHits >= 4) this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.player.maxHp * 0.04);
        });
      }
    }

    useDogSkill(slot) {
      const angle = this.player.aimAngle;
      const damage = this.player.stats.damage * this.player.stats.skillPower;
      if (slot === "secondary") {
        this.companions.push(this.createCompanion("pup", 12, this.companions.length));
        this.spawnBurst(this.player.x, this.player.y, "#ffe18a", 18);
      } else if (slot === "q") {
        for (let index = 0; index < 5; index += 1) {
          this.schedule(index * 0.1, () => {
            const offset = (index - 2) * 34;
            const x = this.player.x - Math.sin(angle) * offset;
            const y = this.player.y + Math.cos(angle) * offset * 0.35;
            this.createPlayerProjectile({
              x,
              y,
              angle,
              speed: 760,
              damage: damage * 0.75,
              radius: 18,
              life: 1.1,
              kind: "houndRush",
              color: "#ffe18a",
              pierce: 5,
              knockback: 240,
              isSkill: true
            });
          });
        }
      } else if (slot === "e") {
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.player.maxHp * 0.28);
        this.player.shield += this.player.maxHp * 0.18;
        this.spawnBurst(this.player.x, this.player.y, "#83e2a2", 28);
      } else if (slot === "r") {
        for (let index = 0; index < 3; index += 1) {
          this.companions.push(this.createCompanion("hound", 12, index + 1));
        }
        this.addBuff({ id: "loyalPack", duration: 12, summonDamageMultiplier: 1.5 });
        this.spawnBurst(this.player.x, this.player.y, "#ffd66f", 36);
      }
    }

    createPlayerProjectile(options) {
      const angle = options.angle ?? this.player.aimAngle;
      const x = options.x ?? (this.player.x + Math.cos(angle) * 34);
      const y = options.y ?? (this.player.y + Math.sin(angle) * 24);
      this.projectiles.push({
        id: this.uid++,
        x,
        y,
        startX: x,
        startY: y,
        vx: Math.cos(angle) * options.speed,
        vy: Math.sin(angle) * options.speed,
        angle,
        speed: options.speed,
        damage: options.damage,
        radius: options.radius || 8,
        life: options.life || 1.5,
        maxLife: options.life || 1.5,
        kind: options.kind || "orb",
        color: options.color || "#fff",
        pierce: options.pierce || 0,
        hitIds: new Set(),
        returning: Boolean(options.returning),
        homing: options.homing || 0,
        slow: options.slow || 0,
        slowDuration: options.slowDuration || 0,
        knockback: options.knockback || 0,
        isSkill: Boolean(options.isSkill),
        gravity: options.gravity || 0,
        owner: "player"
      });
    }

    createFallingProjectile(x, y, damage, kind, color) {
      this.projectiles.push({
        id: this.uid++,
        x,
        y,
        startX: x,
        startY: y,
        vx: (Math.random() - 0.5) * 35,
        vy: 640,
        angle: Math.PI / 2,
        speed: 640,
        damage,
        radius: 10,
        life: 1.2,
        maxLife: 1.2,
        kind,
        color,
        pierce: 1,
        hitIds: new Set(),
        returning: false,
        homing: 0,
        slow: 0,
        slowDuration: 0,
        knockback: 60,
        isSkill: true,
        gravity: 160,
        owner: "player"
      });
    }

    createEnemyProjectile(enemy, angle, options = {}) {
      this.enemyProjectiles.push({
        id: this.uid++,
        x: enemy.x,
        y: enemy.y,
        vx: Math.cos(angle) * (options.speed || 260),
        vy: Math.sin(angle) * (options.speed || 260),
        radius: options.radius || 9,
        damage: options.damage || enemy.attack,
        life: options.life || 3,
        kind: options.kind || "enemyOrb",
        color: options.color || enemy.accent || "#ff6b6b",
        slow: options.slow || 0,
        owner: "enemy"
      });
    }

    updateProjectiles(delta, now) {
      for (const projectile of this.projectiles) {
        projectile.life -= delta;
        if (projectile.homing > 0) {
          const target = this.findNearestEnemy(projectile.x, projectile.y, 450, projectile.hitIds);
          if (target) {
            const desired = Math.atan2(target.y - projectile.y, target.x - projectile.x);
            const current = Math.atan2(projectile.vy, projectile.vx);
            const difference = Math.atan2(Math.sin(desired - current), Math.cos(desired - current));
            const next = current + difference * clamp(projectile.homing * delta, 0, 1);
            projectile.vx = Math.cos(next) * projectile.speed;
            projectile.vy = Math.sin(next) * projectile.speed;
          }
        }
        if (projectile.returning && projectile.life < projectile.maxLife * 0.52) {
          const desired = Math.atan2(this.player.y - projectile.y, this.player.x - projectile.x);
          projectile.vx = lerp(projectile.vx, Math.cos(desired) * projectile.speed, clamp(delta * 5, 0, 1));
          projectile.vy = lerp(projectile.vy, Math.sin(desired) * projectile.speed, clamp(delta * 5, 0, 1));
        }
        projectile.vy += projectile.gravity * delta;
        projectile.x += projectile.vx * delta;
        projectile.y += projectile.vy * delta;

        if (this.mode === "village" && this.world.dummy) {
          const dummy = this.world.dummy;
          if (!projectile.hitIds.has("dummy") && Math.hypot(projectile.x - dummy.x, projectile.y - dummy.y) < projectile.radius + dummy.radius) {
            projectile.hitIds.add("dummy");
            this.damageDummy(projectile.damage, { isSkill: projectile.isSkill });
            projectile.pierce -= 1;
            if (projectile.pierce < 0 && !projectile.returning) projectile.life = 0;
          }
        }

        if (this.mode === "stage") {
          for (const enemy of this.enemies) {
            if (enemy.dead || projectile.hitIds.has(enemy.id)) continue;
            if (Math.hypot(projectile.x - enemy.x, projectile.y - enemy.y) <= projectile.radius + enemy.radius) {
              projectile.hitIds.add(enemy.id);
              this.damageEnemy(enemy, projectile.damage, {
                isSkill: projectile.isSkill,
                slow: projectile.slow,
                slowDuration: projectile.slowDuration,
                knockback: projectile.knockback,
                angle: Math.atan2(projectile.vy, projectile.vx)
              });
              if (projectile.knockback) {
                this.knockbackEnemy(enemy, Math.atan2(projectile.vy, projectile.vx), projectile.knockback);
              }
              projectile.pierce -= 1;
              if (projectile.pierce < 0 && !projectile.returning) {
                projectile.life = 0;
                break;
              }
            }
          }
        }
      }

      this.projectiles = this.projectiles.filter(projectile => (
        projectile.life > 0
        && projectile.x > -300
        && projectile.x < (this.world?.length || 2000) + 300
        && projectile.y > -500
        && projectile.y < 1100
      ));

      for (const projectile of this.enemyProjectiles) {
        projectile.life -= delta;
        projectile.x += projectile.vx * delta;
        projectile.y += projectile.vy * delta;
        if (
          projectile.life > 0
          && Math.hypot(projectile.x - this.player.x, projectile.y - this.player.y) <= projectile.radius + Math.max(this.player.width, this.player.height) * 0.38
        ) {
          this.playerTakeDamage(projectile.damage, projectile.kind);
          projectile.life = 0;
          if (projectile.slow) {
            this.addBuff({ id: `enemySlow-${projectile.id}`, duration: 1.5, moveSpeedMultiplier: 1 - projectile.slow });
          }
        }
      }
      this.enemyProjectiles = this.enemyProjectiles.filter(projectile => projectile.life > 0);
    }

    updateZones(delta, now) {
      for (const zone of this.zones) {
        zone.duration -= delta;
        zone.elapsed += delta;
        zone.tickTimer -= delta;
        if (zone.followPlayer) {
          zone.x = this.player.x;
          zone.y = this.player.y;
        }
        if (zone.tickTimer <= 0) {
          zone.tickTimer = zone.tickInterval || 0.55;
          let hitCount = 0;
          for (const enemy of this.enemies) {
            if (enemy.dead) continue;
            if (Math.hypot(enemy.x - zone.x, enemy.y - zone.y) <= zone.radius + enemy.radius) {
              if (zone.damage > 0) {
                this.damageEnemy(enemy, zone.damage, { isSkill: zone.isSkill, noCrit: false });
                hitCount += 1;
              }
              if (zone.slow) {
                enemy.status.slowUntil = Math.max(enemy.status.slowUntil || 0, now + 0.75);
                enemy.status.slowAmount = Math.max(enemy.status.slowAmount || 0, zone.slow);
              }
            }
          }
          if (zone.kind === "forestCircle" && hitCount >= 4 && this.run.characterId === "deer" && !zone.healed) {
            zone.healed = true;
            this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.player.maxHp * 0.04);
          }
        }

        // BOSS 與怪物建立的危險區域會定時傷害玩家；純泥濘區則只負責視覺與緩速。
        if (zone.hostile) {
          zone.playerTickTimer = (zone.playerTickTimer ?? 0) - delta;
          const playerInside = Math.hypot(this.player.x - zone.x, this.player.y - zone.y)
            <= zone.radius + Math.max(this.player.width, this.player.height) * 0.28;
          if (playerInside && zone.playerTickTimer <= 0) {
            zone.playerTickTimer = zone.playerTickInterval || 0.65;
            if (zone.playerDamage > 0) {
              this.playerTakeDamage(zone.playerDamage, zone.kind || "hazard");
            }
            if (zone.kind === "mud") {
              this.addBuff({
                id: `mudSlow-${zone.id}`,
                duration: 0.8,
                moveSpeedMultiplier: 0.72
              });
            }
          }
        }
      }
      this.zones = this.zones.filter(zone => zone.duration > 0);
    }

    areaDamage(x, y, radius, damage, options = {}) {
      let hits = 0;
      for (const enemy of this.enemies) {
        if (enemy.dead) continue;
        const dx = enemy.x - x;
        const dy = enemy.y - y;
        if (Math.hypot(dx, dy) <= radius + enemy.radius) {
          this.damageEnemy(enemy, damage, options);
          if (options.knockback) this.knockbackEnemy(enemy, Math.atan2(dy, dx), options.knockback);
          if (options.stun) enemy.status.stunUntil = Math.max(enemy.status.stunUntil || 0, performance.now() / 1000 + options.stun);
          hits += 1;
        }
      }
      if (this.mode === "village" && this.world.dummy && Math.hypot(this.world.dummy.x - x, this.world.dummy.y - y) <= radius + this.world.dummy.radius) {
        this.damageDummy(damage, options);
        hits += 1;
      }
      if (options.color) this.spawnShockwave(x, y, radius, options.color);
      return hits;
    }

    rollPlayerDamage(baseDamage, isSkill = false, noCrit = false) {
      const critBonus = this.getBuffValue("critChanceBonus", 0);
      const critical = !noCrit && Math.random() < clamp(this.player.stats.critChance + critBonus, 0, 1);
      // 技能在建立傷害時已套用 skillPower，這裡只處理共通增傷與爆擊，避免技能倍率重複計算。
      let damage = baseDamage * this.getBuffValue("damageMultiplier", 1);
      if (critical) damage *= this.player.stats.critDamage;
      return { damage, critical };
    }

    damageEnemy(enemy, amount, options = {}) {
      if (!enemy || enemy.dead || amount <= 0) return { damage: 0, critical: false };
      const result = this.rollPlayerDamage(amount, options.isSkill, options.noCrit);
      let finalDamage = result.damage;
      if (enemy.ai === "armored" && !options.isSkill) {
        const incomingAngle = options.angle ?? this.player.aimAngle;
        const facingDifference = Math.abs(Math.atan2(Math.sin(incomingAngle - enemy.facingAngle), Math.cos(incomingAngle - enemy.facingAngle)));
        if (facingDifference > Math.PI * 0.55) finalDamage *= 0.5;
      }
      enemy.hp -= finalDamage;
      enemy.hitFlash = 0.12;
      this.run.totalDamage += finalDamage;
      this.addDamageText(enemy.x, enemy.y - enemy.radius, finalDamage, result.critical, result.critical ? "#ffe278" : "#ffffff");
      this.spawnBurst(enemy.x, enemy.y, result.critical ? "#ffe278" : enemy.accent, result.critical ? 10 : 5);
      if (result.critical) this.audio.play("crit");
      else this.audio.play("hit");

      if (options.slow) {
        const now = performance.now() / 1000;
        enemy.status.slowUntil = Math.max(enemy.status.slowUntil || 0, now + (options.slowDuration || 1.5));
        enemy.status.slowAmount = Math.max(enemy.status.slowAmount || 0, options.slow);
      }

      const nailLevel = Number(this.run.items.nail || 0);
      const nailChance = Math.min(0.65, 0.1 + Math.max(0, nailLevel - 1) * 0.03);
      if (!options.isBleed && nailLevel > 0 && !options.isSkill && Math.random() < nailChance) {
        enemy.status.bleeds.push({
          nextTick: performance.now() / 1000 + 0.5,
          remainingTicks: 6,
          damage: this.player.stats.damage * (0.7 + Math.max(0, nailLevel - 1) * 0.15) * 0.5
        });
      }

      if (enemy.hp <= 0) this.killEnemy(enemy, result.critical);
      return { damage: finalDamage, critical: result.critical };
    }

    knockbackEnemy(enemy, angle, force) {
      if (enemy.isBoss) force *= 0.18;
      enemy.vx += Math.cos(angle) * force;
      enemy.vy += Math.sin(angle) * force * 0.35 - force * 0.12;
    }

    killEnemy(enemy, criticalKill = false) {
      if (enemy.dead) return;
      enemy.dead = true;
      enemy.deathTimer = 0.38;
      this.stage.kills += enemy.isBoss ? 1 : 1;
      this.run.totalKills += 1;

      const rewardPenalty = this.stage.rewardPenaltyApplied ? this.data.balance.rewardPenaltyMultiplier : 1;
      const frenzyReward = 1 + this.stage.frenzyStacks * 0.03;
      const reward = this.stage.rewardMultiplier * rewardPenalty * frenzyReward;
      const xp = Math.max(1, Math.round(enemy.xp * reward));
      const gold = Math.max(0, Math.round(enemy.gold * reward * this.player.stats.goldMultiplier));
      this.gainExperience(xp);
      this.run.gold += gold;
      this.run.totalGold += gold;
      this.spawnPickupText(enemy.x, enemy.y, xp, gold);
      this.spawnBurst(enemy.x, enemy.y, enemy.accent, enemy.isBoss ? 60 : 16);
      if (gold > 0) this.audio.play("coin");

      if (enemy.dataId === "poisonCaterpillar") {
        this.zones.push({
          id: this.uid++,
          x: enemy.x,
          y: enemy.y,
          radius: 90,
          duration: 3.5,
          elapsed: 0,
          tickTimer: 0.4,
          tickInterval: 0.65,
          damage: 0,
          slow: 0.2,
          color: "rgba(127,73,150,.28)",
          kind: "poisonCloud",
          hostile: true,
          playerDamage: enemy.attack * 0.35
        });
      }

      if (criticalKill && this.run.characterId === "cat") {
        Object.keys(this.player.cooldowns).forEach(key => {
          this.player.cooldowns[key] = Math.max(performance.now() / 1000, this.player.cooldowns[key] - 0.4);
        });
      }

      if (enemy.isBoss) {
        this.stage.bossDefeated = true;
        this.stage.portalUnlocked = false;
        this.world.portal.x = Math.min(this.world.length - 160, enemy.x + 350);
        this.world.portal.y = (this.getGroundY(this.world.portal.x) || 555) - 52;
        this.camera.shake = 24;
        this.toast(
          this.settings.language === "en" ? "Boss defeated" : "BOSS 已擊敗",
          this.settings.language === "en" ? "The exit portal is opening." : "出口傳送門正在開啟。",
          "success"
        );
      }
    }

    playerTakeDamage(amount, source = "enemy", ignoreInvulnerability = false) {
      const now = performance.now() / 1000;
      if (!ignoreInvulnerability && now < this.player.invulnerableUntil) return;

      const blockChance = this.player.stats.blockChance;
      if (!ignoreInvulnerability && Math.random() < blockChance) {
        this.player.invulnerableUntil = now + 0.22;
        this.audio.play("block");
        this.addDamageText(this.player.x, this.player.y - 40, 0, false, "#8fe5e0", this.settings.language === "en" ? "BLOCK" : "格擋");
        if (this.run.characterId === "hippo") {
          this.addBuff({ id: "hippoBlockPower", duration: 2, damageMultiplier: 1.12 });
        }
        return;
      }

      let incoming = amount;
      if (this.stage?.node?.modifiers?.some(modifier => modifier.id === "vulnerable")) incoming *= 1.05;
      const armorFactor = 100 / (100 + this.player.stats.armor * 6);
      const buffReduction = this.getBuffValue("damageReduction", 0);
      incoming *= armorFactor * (1 - clamp(this.player.stats.damageReduction + buffReduction, 0, 0.8));

      if (this.player.shield > 0) {
        const absorbed = Math.min(this.player.shield, incoming);
        this.player.shield -= absorbed;
        incoming -= absorbed;
      }

      if (incoming > 0) {
        this.player.hp -= incoming;
        this.run.totalDamageTaken += incoming;
        this.addDamageText(this.player.x, this.player.y - 42, incoming, false, "#ff7777");
      } else {
        this.addDamageText(this.player.x, this.player.y - 42, 0, false, "#8fe5e0", this.settings.language === "en" ? "SHIELD" : "護盾");
      }
      this.player.invulnerableUntil = now + this.data.balance.playerInvulnerability;
      this.camera.shake = Math.max(this.camera.shake, 8);
      this.audio.play("hurt");

      if (this.player.hp <= 0) {
        if (this.run.characterId === "cat" && this.player.nineLivesReady) {
          this.player.nineLivesReady = false;
          this.player.hp = 1;
          this.player.invulnerableUntil = now + 1.8;
          this.player.shield += this.player.maxHp * 0.22;
          this.toast(
            this.settings.language === "en" ? "Nine Lives" : "九命觸發",
            this.settings.language === "en" ? "A fatal hit was prevented once this stage." : "本關第一次致命傷害已被抵擋。",
            "success"
          );
          return;
        }
        this.player.hp = 0;
        this.showResult(false);
      }
    }

    gainExperience(amount) {
      this.run.xp += amount;
      while (this.run.xp >= this.run.xpToNext) {
        this.run.xp -= this.run.xpToNext;
        this.run.level += 1;
        this.run.xpToNext = Math.round(18 + Math.pow(this.run.level, 1.35) * 7.5);
        this.pendingLevelUps += 1;
      }
      if (this.pendingLevelUps > 0 && ["stage", "village"].includes(this.mode)) {
        this.showLevelUp();
      }
    }

    showLevelUp() {
      if (this.pendingLevelUps <= 0) return;
      this.resumeMode = this.mode;
      this.pendingLevelUps -= 1;
      const oldMaxHp = this.player.maxHp;
      this.player.stats = this.calculatePlayerStats();
      this.player.maxHp = this.player.stats.maxHp;
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + Math.max(1, this.player.maxHp - oldMaxHp));
      this.activeLevelChoices = this.getRandomItemChoices(3, false);
      this.renderLevelChoices();
      this.mode = "levelUp";
      this.showScreen("levelUpScreen", false);
      this.audio.play("level");
    }

    renderLevelChoices() {
      const character = this.data.characters[this.run.characterId];
      const growth = character.growth;
      const growthText = this.root.querySelector("#levelUpGrowthText");
      growthText.textContent = this.settings.language === "en"
        ? `Automatic growth: HP +${growth.maxHp}, Attack +${growth.damage}, Move +${growth.moveSpeed}, Attack speed +${(growth.attackRate * 100).toFixed(1)}%.`
        : `本次升級自動成長：生命 +${growth.maxHp}、攻擊 +${growth.damage}、移動 +${growth.moveSpeed}、攻速 +${(growth.attackRate * 100).toFixed(1)}%。`;
      const list = this.root.querySelector("#levelUpChoiceList");
      list.innerHTML = this.activeLevelChoices.map((choice, index) => this.renderChoiceCard(choice, index, false)).join("");
      this.renderChoiceIcons(list);
      list.querySelectorAll("[data-choice-index]").forEach(button => {
        button.addEventListener("click", () => this.chooseLevelItem(Number(button.dataset.choiceIndex)));
      });
    }

    getRandomItemChoices(count, forShop = false) {
      const available = Object.values(this.data.items).filter(item => (
        item.maxLevel === null
        || item.maxLevel === undefined
        || (this.run.items[item.id] || 0) < item.maxLevel
      ));
      const rng = new SeededRandom(this.run.seed + this.run.level * 1907 + this.run.stagesCleared * 313 + Math.floor(performance.now()));
      const selected = rng.shuffle(available).slice(0, count).map(item => ({ id: item.id, type: "item" }));
      const statBoosts = [
        { id: "statVitality", type: "stat", icon: "♥", color: "#ff7777", name: { "zh-TW": "生命鍛鍊", en: "Vitality Training" }, description: { "zh-TW": "永久增加 12 最大生命。", en: "Permanently gain 12 max health." } },
        { id: "statPower", type: "stat", icon: "✦", color: "#ffb24f", name: { "zh-TW": "力量鍛鍊", en: "Power Training" }, description: { "zh-TW": "永久增加 2 攻擊力。", en: "Permanently gain 2 attack damage." } },
        { id: "statAgility", type: "stat", icon: "➟", color: "#4fd1c5", name: { "zh-TW": "敏捷鍛鍊", en: "Agility Training" }, description: { "zh-TW": "永久增加 3% 攻速與 5 移動速度。", en: "Permanently gain 3% attack speed and 5 movement speed." } }
      ];
      while (selected.length < count) {
        selected.push(statBoosts[selected.length % statBoosts.length]);
      }
      return selected;
    }

    renderChoiceCard(choice, index, isShop) {
      if (choice.type === "stat") {
        return `
          <button type="button" class="tyy-choice-card" data-choice-index="${index}" style="--item-color:${choice.color}">
            <span class="tyy-choice-card-icon">${choice.icon}</span>
            <h4>${this.localize(choice.name)}</h4>
            <div class="tyy-choice-level">永久能力</div>
            <p>${this.localize(choice.description)}</p>
            <div class="tyy-choice-next-effect">${this.settings.language === "en" ? "Can be selected repeatedly." : "可重複選擇，效果永久保留至本次冒險結束。"}</div>
            ${isShop ? `<div class="tyy-choice-price">${choice.price || 0} 金幣</div>` : ""}
          </button>
        `;
      }
      const item = this.data.items[choice.id];
      const currentCount = Number(this.run.items[item.id] || 0);
      const nextCount = currentCount + 1;
      const sold = Boolean(choice.sold);
      return `
        <button
          type="button"
          class="tyy-choice-card${sold ? " is-disabled" : ""}"
          data-choice-index="${index}"
          style="--item-color:${item.color}"
          ${sold ? "disabled" : ""}
        >
          <span class="tyy-choice-card-icon tyy-choice-card-icon-canvas">
            <canvas width="96" height="96" data-item-icon="${item.id}"></canvas>
          </span>
          <h4>${this.localize(item.name)}</h4>
          <div class="tyy-choice-level">×${currentCount} → ×${nextCount}</div>
          <p>${this.localize(item.description)}</p>
          <div class="tyy-choice-next-effect">${this.localize(item.effectText(nextCount))}</div>
          ${isShop ? `<div class="tyy-choice-price">${sold ? "已購買" : `${choice.price} 金幣`}</div>` : ""}
        </button>
      `;
    }

    chooseLevelItem(index) {
      const choice = this.activeLevelChoices[index];
      if (!choice) return;
      this.applyItemChoice(choice.id, "level");
      if (this.pendingLevelUps > 0) {
        this.showLevelUp();
      } else {
        this.hideAllScreens();
        this.mode = this.resumeMode;
        this.updateHud(true);
      }
    }

    applyItemChoice(id, source = "level") {
      if (id.startsWith("stat")) {
        if (id === "statVitality") this.run.bonusStats.maxHp += 12;
        if (id === "statPower") this.run.bonusStats.damage += 2;
        if (id === "statAgility") {
          this.run.bonusStats.attackRate += 0.03;
          this.run.bonusStats.moveSpeed += 5;
        }
        const oldMax = this.player.maxHp;
        this.player.stats = this.calculatePlayerStats();
        this.player.maxHp = this.player.stats.maxHp;
        this.player.hp += Math.max(0, this.player.maxHp - oldMax);
        return;
      }

      const item = this.data.items[id];
      if (!item) return;
      const oldLevel = Number(this.run.items[id] || 0);
      if (item.maxLevel !== null && item.maxLevel !== undefined && oldLevel >= item.maxLevel) return;
      const oldMax = this.player.maxHp;
      this.run.items[id] = oldLevel + 1;
      this.player.stats = this.calculatePlayerStats();
      this.player.maxHp = this.player.stats.maxHp;
      if (id === "bloodBottle") this.player.hp += this.player.maxHp - oldMax;
      this.player.hp = Math.min(this.player.maxHp, this.player.hp);
      this.audio.play("chest");
      this.showItemAcquired(item, this.run.items[id], source);
      this.toast(
        source === "chest" ? this.tr("chestReward") : this.localize(item.name),
        `${this.localize(item.name)} ×${this.run.items[id]}・${this.localize(item.effectText(this.run.items[id]))}`,
        "success"
      );
      if (this.inventoryHeld) this.renderInventoryOverlay();
    }

    spawnEnemy(initial = false) {
      if (!this.stage || this.stage.isBoss) return;
      const chapter = this.stage.chapter;
      const rng = new SeededRandom(this.run.seed + this.stage.spawnSequence * 71 + Math.floor(this.stage.elapsed * 100));
      this.stage.spawnSequence += 1;
      const dataId = rng.pick(chapter.enemyPool);
      const data = this.data.enemies[dataId];
      const playerX = this.player.x;
      const direction = rng.next() < 0.5 ? -1 : 1;
      let x = playerX + direction * rng.range(initial ? 300 : 520, initial ? 780 : 980);
      x = clamp(x, 120, this.world.length - 220);
      if (this.getGroundY(x) === null) x = clamp(playerX - direction * 560, 120, this.world.length - 220);
      const ground = this.getGroundY(x) || 550;
      const flying = ["flying"].includes(data.ai);
      const scale = this.getEnemyScale();
      const elite = this.stage.node.type === "elite" && rng.next() < 0.2;
      const enemy = {
        id: `enemy-${this.uid++}`,
        dataId,
        data,
        name: this.localize(data.name),
        x,
        y: flying ? ground - rng.range(120, 270) : ground - data.base.radius,
        vx: 0,
        vy: 0,
        radius: data.base.radius * (elite ? 1.18 : 1),
        hp: data.base.hp * scale.hp * (elite ? 1.65 : 1),
        maxHp: data.base.hp * scale.hp * (elite ? 1.65 : 1),
        attack: data.base.attack * scale.attack * (elite ? 1.25 : 1),
        speed: data.base.speed * scale.speed * (elite ? 1.08 : 1),
        xp: data.base.xp * (elite ? 1.7 : 1),
        gold: data.base.gold * (elite ? 1.7 : 1),
        accent: elite ? "#d9a2ff" : data.accent,
        ai: data.ai,
        elite,
        isBoss: false,
        dead: false,
        hitFlash: 0,
        attackTimer: rng.range(0.2, data.base.cooldown),
        specialTimer: rng.range(0.5, 2.5),
        state: "chase",
        stateTimer: 0,
        facingAngle: direction > 0 ? 0 : Math.PI,
        status: { slowUntil: 0, slowAmount: 0, stunUntil: 0, bleeds: [] }
      };
      this.enemies.push(enemy);
    }

    getEnemyScale() {
      const chapter = this.stage.chapter;
      const stageNumber = this.run.stageNumber;
      const frenzy = this.stage.frenzyStacks;
      return {
        hp: (chapter.baseHpMultiplier + stageNumber * chapter.hpStep) * (1 + frenzy * 0.05),
        attack: (chapter.baseAttackMultiplier + stageNumber * chapter.attackStep) * (1 + frenzy * 0.035),
        speed: (chapter.baseSpeedMultiplier + stageNumber * chapter.speedStep) * (1 + frenzy * 0.012)
      };
    }

    spawnBoss() {
      const chapter = this.stage.chapter;
      const data = this.data.bosses[chapter.boss];
      const scale = this.run.chapter === 1 ? 2.15 : 4.2;
      const x = this.world.length - 650;
      const ground = this.getGroundY(x) || 550;
      this.enemies.push({
        id: `boss-${this.uid++}`,
        dataId: data.id,
        data,
        name: this.localize(data.name),
        x,
        y: ground - data.base.radius,
        vx: 0,
        vy: 0,
        radius: data.base.radius,
        hp: data.base.hp * (this.run.chapter === 1 ? 1 : 1.15),
        maxHp: data.base.hp * (this.run.chapter === 1 ? 1 : 1.15),
        attack: data.base.attack * (this.run.chapter === 1 ? 1.1 : 1.18),
        speed: data.base.speed,
        xp: data.base.xp,
        gold: data.base.gold,
        accent: data.accent,
        ai: "boss",
        elite: true,
        isBoss: true,
        dead: false,
        hitFlash: 0,
        attackTimer: 1.2,
        specialTimer: 1.5,
        phase: 1,
        state: "chase",
        stateTimer: 0,
        facingAngle: Math.PI,
        status: { slowUntil: 0, slowAmount: 0, stunUntil: 0, bleeds: [] }
      });
      this.stage.bossSpawned = true;
    }

    updateEnemies(delta, now) {
      for (const enemy of this.enemies) {
        if (enemy.dead) {
          enemy.deathTimer -= delta;
          continue;
        }

        enemy.hitFlash = Math.max(0, enemy.hitFlash - delta);
        this.updateEnemyStatuses(enemy, delta, now);
        if (enemy.status.stunUntil > now) continue;

        if (enemy.isBoss) {
          this.updateBoss(enemy, delta, now);
        } else {
          this.updateRegularEnemy(enemy, delta, now);
        }
      }
      this.enemies = this.enemies.filter(enemy => !enemy.dead || enemy.deathTimer > 0);
    }

    updateEnemyStatuses(enemy, delta, now) {
      for (const bleed of enemy.status.bleeds) {
        if (now >= bleed.nextTick && bleed.remainingTicks > 0) {
          bleed.nextTick += 0.5;
          bleed.remainingTicks -= 1;
          this.damageEnemy(enemy, bleed.damage, { isBleed: true, noCrit: true });
        }
      }
      enemy.status.bleeds = enemy.status.bleeds.filter(bleed => bleed.remainingTicks > 0 && !enemy.dead);
      if (enemy.status.slowUntil <= now) enemy.status.slowAmount = 0;
    }

    updateRegularEnemy(enemy, delta, now) {
      const dx = this.player.x - enemy.x;
      const dy = this.player.y - enemy.y;
      const dist = Math.max(1, Math.hypot(dx, dy));
      const slowMultiplier = enemy.status.slowUntil > now ? 1 - enemy.status.slowAmount : 1;
      const speed = enemy.speed * slowMultiplier;
      enemy.attackTimer -= delta;
      enemy.specialTimer -= delta;
      enemy.stateTimer -= delta;
      enemy.facingAngle = dx >= 0 ? 0 : Math.PI;

      switch (enemy.ai) {
        case "ranged":
          if (dist > 330) enemy.vx = lerp(enemy.vx, Math.sign(dx) * speed, delta * 3);
          else if (dist < 220) enemy.vx = lerp(enemy.vx, -Math.sign(dx) * speed, delta * 3);
          else enemy.vx *= Math.pow(0.02, delta);
          if (enemy.attackTimer <= 0 && dist < 520) {
            this.createEnemyProjectile(enemy, Math.atan2(dy, dx), {
              speed: 245,
              radius: 11,
              damage: enemy.attack,
              kind: "poisonOrb",
              color: "#a06cc2",
              slow: 0.18
            });
            enemy.attackTimer = enemy.data.base.cooldown;
          }
          break;

        case "flying": {
          const desiredY = this.player.y - 80 + Math.sin(now * 2 + Number(enemy.id.replace(/\D/g, ""))) * 45;
          enemy.vx = lerp(enemy.vx, dx / dist * speed, delta * 2.5);
          enemy.vy = lerp(enemy.vy, clamp((desiredY - enemy.y) * 2.2, -speed, speed), delta * 2.4);
          enemy.x += enemy.vx * delta;
          enemy.y += enemy.vy * delta;
          if (enemy.attackTimer <= 0 && dist < 75) {
            this.enemyContactAttack(enemy);
            enemy.attackTimer = enemy.data.base.cooldown;
          }
          return;
        }

        case "mimic":
          if (dist > 250 && enemy.state !== "leap") {
            enemy.vx *= Math.pow(0.005, delta);
          } else if (enemy.state !== "leap" && enemy.specialTimer <= 0) {
            enemy.state = "leap";
            enemy.vx = dx / dist * 310;
            enemy.vy = -430;
            enemy.specialTimer = 2.8;
          } else if (enemy.state !== "leap") {
            enemy.vx = lerp(enemy.vx, Math.sign(dx) * speed, delta * 2);
          }
          break;

        case "charger":
          if (enemy.state === "windup") {
            enemy.vx *= 0.85;
            if (enemy.stateTimer <= 0) {
              enemy.state = "charge";
              enemy.stateTimer = 0.7;
              enemy.vx = Math.sign(dx) * speed * 3.6;
            }
          } else if (enemy.state === "charge") {
            if (enemy.stateTimer <= 0) {
              enemy.state = "chase";
              enemy.specialTimer = 2.6;
            }
          } else if (enemy.specialTimer <= 0 && dist < 470) {
            enemy.state = "windup";
            enemy.stateTimer = 0.65;
          } else {
            enemy.vx = lerp(enemy.vx, Math.sign(dx) * speed, delta * 2.4);
          }
          break;

        case "hopper":
          enemy.vx = lerp(enemy.vx, Math.sign(dx) * speed * 0.75, delta * 2);
          if (enemy.specialTimer <= 0 && enemy.onGround) {
            enemy.vy = -360;
            enemy.vx = Math.sign(dx) * speed * 1.8;
            enemy.specialTimer = 1.7;
            this.zones.push({
              id: this.uid++,
              x: enemy.x,
              y: enemy.y + enemy.radius,
              radius: 65,
              duration: 3,
              elapsed: 0,
              tickTimer: 0,
              damage: 0,
              slow: 0.25,
              color: "rgba(83,111,71,.25)",
              kind: "mud",
              hostile: true,
              playerDamage: 0
            });
          }
          break;

        case "swarm":
          enemy.vx = lerp(enemy.vx, dx / dist * speed, delta * 4);
          break;

        case "armored":
          enemy.vx = lerp(enemy.vx, Math.sign(dx) * speed, delta * 2);
          break;

        case "spider":
          enemy.vx = lerp(enemy.vx, Math.sign(dx) * speed, delta * 3.1);
          if (enemy.attackTimer <= 0 && dist > 90 && dist < 270) {
            this.createEnemyProjectile(enemy, Math.atan2(dy, dx), {
              speed: 290,
              radius: 7,
              damage: enemy.attack * 0.8,
              kind: "web",
              color: "#e8e3d3",
              slow: 0.25
            });
            enemy.attackTimer = 2.2;
          }
          break;

        default:
          enemy.vx = lerp(enemy.vx, Math.sign(dx) * speed, delta * 2.7);
      }

      this.applyEnemyGroundPhysics(enemy, delta);
      if (dist < enemy.radius + Math.max(this.player.width, this.player.height) * 0.42 && enemy.attackTimer <= 0) {
        this.enemyContactAttack(enemy);
        enemy.attackTimer = enemy.data.base.cooldown;
      }
    }

    applyEnemyGroundPhysics(enemy, delta) {
      const previousBottom = enemy.y + enemy.radius;
      enemy.vy += 1450 * delta;
      enemy.x += enemy.vx * delta;
      enemy.y += enemy.vy * delta;
      enemy.x = clamp(enemy.x, 20, this.world.length - 20);
      enemy.onGround = false;
      const ground = this.getGroundY(enemy.x);
      if (ground !== null && enemy.y + enemy.radius >= ground && previousBottom <= ground + 30 && enemy.vy >= 0) {
        enemy.y = ground - enemy.radius;
        enemy.vy = 0;
        enemy.onGround = true;
        if (enemy.ai === "mimic" && enemy.state === "leap") {
          enemy.state = "chase";
          this.areaEnemyImpact(enemy, 95, enemy.attack * 0.9);
        }
      }
      if (ground === null && enemy.y > 850) {
        enemy.dead = true;
        enemy.deathTimer = 0;
      }
    }

    enemyContactAttack(enemy) {
      this.playerTakeDamage(enemy.attack, enemy.dataId);
      const angle = Math.atan2(this.player.y - enemy.y, this.player.x - enemy.x);
      this.player.vx += Math.cos(angle) * 170;
      this.player.vy -= 90;
    }

    areaEnemyImpact(enemy, radius, damage) {
      if (Math.hypot(this.player.x - enemy.x, this.player.y - enemy.y) <= radius) {
        this.playerTakeDamage(damage, enemy.dataId);
      }
      this.spawnShockwave(enemy.x, enemy.y, radius, enemy.accent);
      this.camera.shake = Math.max(this.camera.shake, 8);
    }

    updateBoss(enemy, delta, now) {
      const dx = this.player.x - enemy.x;
      const dy = this.player.y - enemy.y;
      const dist = Math.max(1, Math.hypot(dx, dy));
      enemy.attackTimer -= delta;
      enemy.specialTimer -= delta;
      enemy.stateTimer -= delta;
      enemy.phase = enemy.hp / enemy.maxHp < 0.35 ? 3 : enemy.hp / enemy.maxHp < 0.68 ? 2 : 1;
      enemy.facingAngle = dx >= 0 ? 0 : Math.PI;

      if (enemy.dataId === "whiteFox") {
        this.updateWhiteFox(enemy, delta, now, dx, dy, dist);
      } else {
        this.updateOtterBoss(enemy, delta, now, dx, dy, dist);
      }
      this.applyEnemyGroundPhysics(enemy, delta);
    }

    updateWhiteFox(enemy, delta, now, dx, dy, dist) {
      if (enemy.state === "dash") {
        if (enemy.stateTimer <= 0) {
          enemy.state = "chase";
          enemy.vx *= 0.2;
        } else if (dist < enemy.radius + 45 && enemy.attackTimer <= 0) {
          this.playerTakeDamage(enemy.attack * 1.25, "whiteFoxDash");
          enemy.attackTimer = 0.5;
        }
        return;
      }

      enemy.vx = lerp(enemy.vx, Math.sign(dx) * enemy.speed * (enemy.phase === 3 ? 1.25 : 0.85), delta * 2.2);
      if (enemy.specialTimer <= 0) {
        const pattern = Math.floor(now * 10 + enemy.hp) % 3;
        if (pattern === 0) {
          enemy.state = "dash";
          enemy.stateTimer = 0.8;
          enemy.vx = Math.sign(dx) * enemy.speed * 4.4;
          this.spawnDashTrail(enemy.x, enemy.y, enemy.x + Math.sign(dx) * 300, enemy.y, "#d9fbff");
        } else if (pattern === 1) {
          const baseAngle = Math.atan2(dy, dx);
          const count = 5 + enemy.phase * 2;
          for (let index = 0; index < count; index += 1) {
            const spread = (index - (count - 1) / 2) * 0.12;
            this.createEnemyProjectile(enemy, baseAngle + spread, {
              speed: 320 + enemy.phase * 20,
              radius: 10,
              damage: enemy.attack * 0.75,
              kind: "foxIce",
              color: "#b8f1ff",
              slow: 0.2
            });
          }
        } else {
          const adds = 2 + enemy.phase;
          for (let index = 0; index < adds; index += 1) this.spawnBossAdd("skyMoth", enemy.x + (index - 1) * 90);
        }
        enemy.specialTimer = Math.max(1.8, 3.8 - enemy.phase * 0.55);
      }
      if (dist < enemy.radius + 50 && enemy.attackTimer <= 0) {
        this.playerTakeDamage(enemy.attack, "whiteFox");
        enemy.attackTimer = 1.1;
      }
    }

    updateOtterBoss(enemy, delta, now, dx, dy, dist) {
      if (enemy.state === "slide") {
        if (enemy.stateTimer <= 0) {
          enemy.state = "chase";
          enemy.vx *= 0.25;
        } else if (dist < enemy.radius + 55 && enemy.attackTimer <= 0) {
          this.playerTakeDamage(enemy.attack * 1.2, "otterSlide");
          enemy.attackTimer = 0.5;
        }
        return;
      }

      enemy.vx = lerp(enemy.vx, Math.sign(dx) * enemy.speed * 0.72, delta * 1.9);
      if (enemy.specialTimer <= 0) {
        const pattern = Math.floor(now * 7 + enemy.hp) % 3;
        if (pattern === 0) {
          enemy.state = "slide";
          enemy.stateTimer = 1;
          enemy.vx = Math.sign(dx) * enemy.speed * 4.1;
          this.spawnDashTrail(enemy.x, enemy.y, enemy.x + Math.sign(dx) * 340, enemy.y, "#68dbe6");
        } else if (pattern === 1) {
          for (let index = 0; index < 8 + enemy.phase * 2; index += 1) {
            const angle = index / (8 + enemy.phase * 2) * TAU;
            this.createEnemyProjectile(enemy, angle, {
              speed: 220 + enemy.phase * 25,
              radius: 13,
              damage: enemy.attack * 0.65,
              kind: "bubble",
              color: "#73e4ef",
              slow: 0.16
            });
          }
        } else {
          const pointCount = 3 + enemy.phase;
          for (let index = 0; index < pointCount; index += 1) {
            const x = this.player.x + (index - (pointCount - 1) / 2) * 150;
            this.schedule(index * 0.12, () => {
              this.zones.push({
                id: this.uid++,
                x,
                y: this.getGroundY(x) || 560,
                radius: 72,
                duration: 1.3,
                elapsed: 0,
                tickTimer: 0.85,
                tickInterval: 1,
                damage: 0,
                slow: 0,
                color: "rgba(83,211,225,.25)",
                kind: "waterPillar",
                hostile: true,
                playerDamage: enemy.attack * 1.05
              });
            });
          }
        }
        enemy.specialTimer = Math.max(1.7, 3.5 - enemy.phase * 0.48);
      }
      if (dist < enemy.radius + 50 && enemy.attackTimer <= 0) {
        this.playerTakeDamage(enemy.attack, "otterKing");
        enemy.attackTimer = 1;
      }
    }

    spawnBossAdd(dataId, x) {
      const data = this.data.enemies[dataId];
      if (!data) return;
      const ground = this.getGroundY(x) || 550;
      const scale = this.getEnemyScale();
      this.enemies.push({
        id: `add-${this.uid++}`,
        dataId,
        data,
        name: this.localize(data.name),
        x: clamp(x, 80, this.world.length - 80),
        y: data.ai === "flying" ? ground - 170 : ground - data.base.radius,
        vx: 0,
        vy: 0,
        radius: data.base.radius,
        hp: data.base.hp * scale.hp * 0.8,
        maxHp: data.base.hp * scale.hp * 0.8,
        attack: data.base.attack * scale.attack,
        speed: data.base.speed * scale.speed,
        xp: data.base.xp,
        gold: data.base.gold,
        accent: data.accent,
        ai: data.ai,
        elite: false,
        isBoss: false,
        dead: false,
        hitFlash: 0,
        attackTimer: 1,
        specialTimer: 1.5,
        state: "chase",
        stateTimer: 0,
        facingAngle: 0,
        status: { slowUntil: 0, slowAmount: 0, stunUntil: 0, bleeds: [] }
      });
    }

    createCompanion(type, duration, slot) {
      return {
        id: `companion-${this.uid++}`,
        type,
        duration,
        slot,
        angle: slot * 1.8,
        x: this.player?.x || 0,
        y: this.player?.y || 0,
        attackTimer: 0.3 + slot * 0.15,
        radius: type === "hound" ? 20 : 16
      };
    }

    updateCompanions(delta, now) {
      for (const companion of this.companions) {
        if (companion.duration !== Infinity) companion.duration -= delta;
        companion.angle += delta * (companion.type === "hound" ? 1.7 : 1.25);
        const orbit = companion.type === "hound" ? 82 + companion.slot * 18 : 58 + companion.slot * 12;
        const desiredX = this.player.x + Math.cos(companion.angle) * orbit;
        const desiredY = this.player.y - 20 + Math.sin(companion.angle * 1.3) * 35;
        companion.x = lerp(companion.x, desiredX, clamp(delta * 5, 0, 1));
        companion.y = lerp(companion.y, desiredY, clamp(delta * 5, 0, 1));
        companion.attackTimer -= delta;
        if (companion.attackTimer <= 0 && this.mode === "stage") {
          const target = this.findNearestEnemy(companion.x, companion.y, companion.type === "hound" ? 580 : 430);
          if (target) {
            const angle = Math.atan2(target.y - companion.y, target.x - companion.x);
            const buff = this.getBuffValue("summonDamageMultiplier", 1);
            this.projectiles.push({
              id: this.uid++,
              x: companion.x,
              y: companion.y,
              startX: companion.x,
              startY: companion.y,
              vx: Math.cos(angle) * 560,
              vy: Math.sin(angle) * 560,
              angle,
              speed: 560,
              damage: this.player.stats.damage * (companion.type === "hound" ? 0.78 : 0.45) * this.player.stats.summonDamageMultiplier * buff,
              radius: companion.type === "hound" ? 9 : 7,
              life: 1.4,
              maxLife: 1.4,
              kind: companion.type === "hound" ? "houndFang" : "pupBark",
              color: "#ffe18a",
              pierce: 0,
              hitIds: new Set(),
              returning: false,
              homing: 1.8,
              slow: 0,
              slowDuration: 0,
              knockback: 35,
              isSkill: true,
              gravity: 0,
              owner: "player"
            });
            companion.attackTimer = companion.type === "hound" ? 0.65 : 1.25;
            this.player.summonHitCount += 1;
            if (this.run.characterId === "dog" && this.player.summonHitCount >= 8) {
              this.player.summonHitCount = 0;
              this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.player.maxHp * 0.02);
            }
          }
        }
      }
      this.companions = this.companions.filter(companion => companion.duration === Infinity || companion.duration > 0);
    }

    findNearestEnemy(x, y, maxDistance = Infinity, ignoredIds = null) {
      let nearest = null;
      let nearestDistance = maxDistance;
      for (const enemy of this.enemies) {
        if (enemy.dead || ignoredIds?.has(enemy.id)) continue;
        const currentDistance = Math.hypot(enemy.x - x, enemy.y - y);
        if (currentDistance < nearestDistance) {
          nearest = enemy;
          nearestDistance = currentDistance;
        }
      }
      return nearest;
    }

    updatePickups(delta, now) {
      for (const pickup of this.pickups) {
        pickup.life -= delta;
        const dx = this.player.x - pickup.x;
        const dy = this.player.y - pickup.y;
        const dist = Math.max(1, Math.hypot(dx, dy));
        if (dist < 180) {
          pickup.vx = lerp(pickup.vx, dx / dist * 420, delta * 6);
          pickup.vy = lerp(pickup.vy, dy / dist * 420, delta * 6);
        }
        pickup.x += pickup.vx * delta;
        pickup.y += pickup.vy * delta;
        if (dist < 26) pickup.life = 0;
      }
      this.pickups = this.pickups.filter(pickup => pickup.life > 0);
    }

    spawnPickupText(x, y, xp, gold) {
      this.pickups.push({
        id: this.uid++,
        x,
        y,
        vx: (Math.random() - 0.5) * 80,
        vy: -120,
        life: 0.8,
        xp,
        gold
      });
    }

    updateParticles(delta) {
      for (const particle of this.particles) {
        particle.life -= delta;
        particle.x += particle.vx * delta;
        particle.y += particle.vy * delta;
        particle.vy += (particle.gravity || 0) * delta;
        particle.vx *= Math.pow(particle.drag || 0.2, delta);
      }
      this.particles = this.particles.filter(particle => particle.life > 0);
      if (this.particles.length > 160) {
        this.particles = this.particles.slice(-160);
      }
    }

    updateDamageTexts(delta) {
      for (const text of this.damageTexts) {
        text.life -= delta;
        text.y -= 48 * delta;
      }
      this.damageTexts = this.damageTexts.filter(text => text.life > 0);
    }

    addDamageText(x, y, damage, critical = false, color = "#fff", overrideText = null) {
      this.damageTexts.push({
        x,
        y,
        text: overrideText || `${critical ? "✦ " : ""}${Math.max(0, Math.round(damage))}`,
        critical,
        color,
        life: critical ? 0.95 : 0.72,
        maxLife: critical ? 0.95 : 0.72
      });
      if (this.damageTexts.length > 48) {
        this.damageTexts = this.damageTexts.slice(-48);
      }
    }

    spawnBurst(x, y, color, count = 8) {
      const optimizedCount = Math.max(2, Math.ceil(count * 0.34));
      const availableSlots = Math.max(0, 160 - this.particles.length);
      const particleCount = Math.min(optimizedCount, availableSlots);
      for (let index = 0; index < particleCount; index += 1) {
        const angle = Math.random() * TAU;
        const speed = 60 + Math.random() * 220;
        this.particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: 2 + Math.random() * 4,
          color,
          life: 0.35 + Math.random() * 0.45,
          maxLife: 0.8,
          gravity: 180,
          drag: 0.1
        });
      }
    }

    spawnDust(x, y, color, count = 6) {
      const optimizedCount = Math.max(1, Math.ceil(count * 0.4));
      const availableSlots = Math.max(0, 160 - this.particles.length);
      const particleCount = Math.min(optimizedCount, availableSlots);
      for (let index = 0; index < particleCount; index += 1) {
        this.particles.push({
          x: x + (Math.random() - 0.5) * 38,
          y,
          vx: (Math.random() - 0.5) * 90,
          vy: -20 - Math.random() * 70,
          radius: 4 + Math.random() * 7,
          color,
          life: 0.35 + Math.random() * 0.25,
          maxLife: 0.6,
          gravity: -25,
          drag: 0.05
        });
      }
    }

    spawnShockwave(x, y, radius, color) {
      this.particles.push({
        x,
        y,
        vx: 0,
        vy: 0,
        radius: 8,
        targetRadius: radius,
        color,
        life: 0.42,
        maxLife: 0.42,
        ring: true,
        gravity: 0,
        drag: 1
      });
    }

    createSlashEffect(x, y, angle, range, color) {
      this.particles.push({
        x,
        y,
        vx: 0,
        vy: 0,
        radius: range,
        color,
        angle,
        life: 0.18,
        maxLife: 0.18,
        slash: true,
        gravity: 0,
        drag: 1
      });
    }

    spawnDashTrail(startX, startY, endX, endY, color) {
      const count = 10;
      for (let index = 0; index < count; index += 1) {
        const amount = index / (count - 1);
        this.particles.push({
          x: lerp(startX, endX, amount),
          y: lerp(startY, endY, amount),
          vx: 0,
          vy: 0,
          radius: 9 + index * 1.2,
          color,
          life: 0.2 + amount * 0.15,
          maxLife: 0.35,
          gravity: 0,
          drag: 1
        });
      }
    }

    spawnStarfall(x, y) {
      for (let index = 0; index < 12; index += 1) {
        this.particles.push({
          x: x + (Math.random() - 0.5) * 55,
          y: y - 160 - Math.random() * 120,
          vx: (Math.random() - 0.5) * 30,
          vy: 380 + Math.random() * 180,
          radius: 3 + Math.random() * 5,
          color: index % 2 ? "#e8ffb8" : "#9ff2c2",
          life: 0.55,
          maxLife: 0.55,
          gravity: 0,
          drag: 1
        });
      }
      this.spawnShockwave(x, y, 80, "#dffcae");
    }


    showInventoryOverlay() {
      if (!this.run || !this.inventoryOverlay) return;
      this.renderInventoryOverlay();
      this.inventoryOverlay.classList.remove("is-hidden");
      this.inventoryOverlay.setAttribute("aria-hidden", "false");
    }

    hideInventoryOverlay() {
      this.inventoryOverlay?.classList.add("is-hidden");
      this.inventoryOverlay?.setAttribute("aria-hidden", "true");
    }

    renderInventoryOverlay() {
      if (!this.run || !this.inventoryItemGrid) return;
      const entries = Object.entries(this.run.items)
        .filter(([, count]) => Number(count) > 0)
        .sort((a, b) => Number(b[1]) - Number(a[1]));

      if (entries.length === 0) {
        this.inventoryItemGrid.innerHTML = `
          <div class="tyy-inventory-empty">
            <i class="fa fa-gift"></i>
            <strong>${this.settings.language === "en" ? "No items yet" : "目前尚未獲得道具"}</strong>
            <span>${this.settings.language === "en" ? "Level up, open chests or visit shops." : "升級、開啟寶箱或前往商店即可取得。"}</span>
          </div>
        `;
      } else {
        this.inventoryItemGrid.innerHTML = entries.map(([id, count]) => {
          const item = this.data.items[id];
          if (!item) return "";
          return `
            <article class="tyy-inventory-item" style="--item-color:${item.color}">
              <canvas width="88" height="88" data-item-icon="${id}"></canvas>
              <div>
                <strong>${this.localize(item.name)}</strong>
                <span>${this.localize(item.effectText(Number(count)))}</span>
              </div>
              <b>×${count}</b>
            </article>
          `;
        }).join("");
        this.renderChoiceIcons(this.inventoryItemGrid);
      }

      const stats = this.player?.stats;
      if (stats && this.inventoryStatSummary) {
        const criticalText = stats.critOverflow > 0
          ? `${Math.round(stats.critChance * 100)}%（溢出 +${Math.round(stats.critOverflow * 100)}% 爆傷）`
          : `${Math.round(stats.critChance * 100)}%`;
        this.inventoryStatSummary.innerHTML = `
          <span>${this.settings.language === "en" ? "HP" : "生命"}<b>${Math.round(this.player.hp)} / ${stats.maxHp}</b></span>
          <span>${this.settings.language === "en" ? "Attack" : "攻擊"}<b>${stats.damage}</b></span>
          <span>${this.settings.language === "en" ? "Move" : "移速"}<b>${Math.round(stats.moveSpeed)}${stats.rawMoveSpeed > stats.moveSpeed ? " MAX" : ""}</b></span>
          <span>${this.settings.language === "en" ? "Attack speed" : "攻速"}<b>${stats.attackRate.toFixed(2)}/s</b></span>
          <span>${this.settings.language === "en" ? "Critical" : "爆擊"}<b>${criticalText}</b></span>
          <span>${this.settings.language === "en" ? "Critical damage" : "爆擊傷害"}<b>${Math.round(stats.critDamage * 100)}%</b></span>
        `;
      }
    }

    renderChoiceIcons(container) {
      container?.querySelectorAll("canvas[data-item-icon]").forEach(canvas => {
        const context = canvas.getContext("2d");
        const itemId = canvas.dataset.itemIcon;
        context.clearRect(0, 0, canvas.width, canvas.height);
        this.drawItemIcon(context, itemId, canvas.width / 2, canvas.height / 2, Math.min(canvas.width, canvas.height) * 0.78);
      });
    }

    showItemAcquired(item, count, source) {
      if (!this.itemAcquiredBanner) return;
      const sourceLabels = {
        chest: this.settings.language === "en" ? "CHEST REWARD" : "寶箱獎勵",
        shop: this.settings.language === "en" ? "SHOP PURCHASE" : "商店購買",
        level: this.settings.language === "en" ? "LEVEL-UP ITEM" : "升級獲得"
      };
      this.root.querySelector("#itemAcquiredSource").textContent = sourceLabels[source] || "ITEM ACQUIRED";
      this.root.querySelector("#itemAcquiredName").textContent = this.localize(item.name);
      this.root.querySelector("#itemAcquiredEffect").textContent = this.localize(item.effectText(count));
      this.root.querySelector("#itemAcquiredCount").textContent = `×${count}`;
      const canvas = this.root.querySelector("#itemAcquiredCanvas");
      const context = canvas.getContext("2d");
      context.clearRect(0, 0, canvas.width, canvas.height);
      this.drawItemIcon(context, item.id, canvas.width / 2, canvas.height / 2, 82);
      this.itemAcquiredBanner.style.setProperty("--item-color", item.color);
      this.itemAcquiredBanner.classList.remove("is-hidden", "is-leaving");
      void this.itemAcquiredBanner.offsetWidth;
      this.itemAcquiredBanner.classList.add("is-visible");
      if (this.itemAcquiredTimer) window.clearTimeout(this.itemAcquiredTimer);
      this.itemAcquiredTimer = window.setTimeout(() => {
        this.itemAcquiredBanner.classList.add("is-leaving");
        this.itemAcquiredBanner.classList.remove("is-visible");
        window.setTimeout(() => this.itemAcquiredBanner?.classList.add("is-hidden"), 280);
      }, 2600);
    }

    drawItemIcon(context, itemId, x, y, size = 72) {
      const item = this.data.items[itemId];
      const scale = size / 72;
      context.save();
      context.translate(x, y);
      context.scale(scale, scale);
      const color = item?.color || "#9ce8e1";
      const bg = context.createRadialGradient(-12, -16, 3, 0, 0, 38);
      bg.addColorStop(0, "rgba(255,255,255,.24)");
      bg.addColorStop(0.5, `${color}3d`);
      bg.addColorStop(1, "rgba(3,12,24,.92)");
      context.fillStyle = bg;
      context.beginPath();
      context.arc(0, 0, 34, 0, TAU);
      context.fill();
      context.strokeStyle = `${color}cc`;
      context.lineWidth = 3;
      context.stroke();

      switch (itemId) {
        case "butterflyKnife":
          context.rotate(-0.55);
          context.fillStyle = "#f4fbff";
          context.beginPath();
          context.moveTo(-6, -25);
          context.lineTo(8, 13);
          context.lineTo(1, 25);
          context.lineTo(-13, -13);
          context.closePath();
          context.fill();
          context.fillStyle = "#b18cff";
          context.fillRect(-5, 13, 10, 17);
          context.fillStyle = "#ffd56b";
          context.beginPath();
          context.arc(0, 13, 5, 0, TAU);
          context.fill();
          break;
        case "miraclePill":
          context.rotate(-0.45);
          context.fillStyle = "#ff7b54";
          this.roundRectPath(context, -23, -10, 46, 20, 10);
          context.fill();
          context.fillStyle = "#ffe7b2";
          this.roundRectPath(context, -23, -10, 23, 20, 10);
          context.fill();
          context.strokeStyle = "rgba(255,255,255,.7)";
          context.lineWidth = 2;
          context.beginPath();
          context.moveTo(0, -9);
          context.lineTo(0, 9);
          context.stroke();
          break;
        case "nail":
          context.rotate(0.62);
          context.fillStyle = "#d8d5c9";
          context.fillRect(-4, -26, 8, 47);
          context.fillStyle = "#9e9380";
          context.fillRect(-14, -29, 28, 7);
          context.beginPath();
          context.moveTo(-4, 21);
          context.lineTo(4, 21);
          context.lineTo(0, 31);
          context.closePath();
          context.fill();
          break;
        case "bountyBelt":
          context.strokeStyle = "#8b552e";
          context.lineWidth = 12;
          context.beginPath();
          context.arc(0, 0, 23, 0, TAU);
          context.stroke();
          context.fillStyle = "#ffd55f";
          this.roundRectPath(context, -12, -10, 24, 20, 4);
          context.fill();
          context.fillStyle = "#7a4b23";
          context.font = "900 15px system-ui";
          context.textAlign = "center";
          context.textBaseline = "middle";
          context.fillText("$", 0, 1);
          break;
        case "sneakers":
          context.fillStyle = "#eaf9ff";
          context.beginPath();
          context.moveTo(-25, 5);
          context.lineTo(-8, -18);
          context.lineTo(3, 2);
          context.lineTo(26, 12);
          context.quadraticCurveTo(28, 24, 13, 25);
          context.lineTo(-23, 23);
          context.closePath();
          context.fill();
          context.strokeStyle = "#62c7ff";
          context.lineWidth = 5;
          context.beginPath();
          context.moveTo(-22, 19);
          context.lineTo(22, 19);
          context.stroke();
          context.strokeStyle = "#7b91a2";
          context.lineWidth = 2;
          [-7, 0, 7].forEach(offset => {
            context.beginPath();
            context.moveTo(-5 + offset, 1);
            context.lineTo(8 + offset, 8);
            context.stroke();
          });
          break;
        case "bloodBottle":
          context.fillStyle = "#e8f4f6";
          this.roundRectPath(context, -18, -19, 36, 45, 8);
          context.fill();
          context.fillStyle = "#cc4655";
          this.roundRectPath(context, -15, 0, 30, 23, 5);
          context.fill();
          context.fillStyle = "#a6b9bd";
          context.fillRect(-9, -28, 18, 11);
          context.fillStyle = "#fff";
          context.beginPath();
          context.moveTo(0, 4);
          context.lineTo(5, 11);
          context.lineTo(0, 18);
          context.lineTo(-5, 11);
          context.closePath();
          context.fill();
          break;
        case "redHeadband":
          context.fillStyle = "#e74756";
          context.beginPath();
          context.moveTo(-28, -9);
          context.quadraticCurveTo(0, -24, 28, -8);
          context.lineTo(24, 7);
          context.quadraticCurveTo(0, -5, -25, 9);
          context.closePath();
          context.fill();
          context.beginPath();
          context.moveTo(20, 2);
          context.lineTo(33, 24);
          context.lineTo(14, 13);
          context.closePath();
          context.fill();
          context.fillStyle = "#ffd467";
          context.beginPath();
          context.arc(0, -7, 5, 0, TAU);
          context.fill();
          break;
        case "heavyWatch":
          context.fillStyle = "#748192";
          context.beginPath();
          context.arc(0, 0, 23, 0, TAU);
          context.fill();
          context.fillStyle = "#d9edf0";
          context.beginPath();
          context.arc(0, 0, 17, 0, TAU);
          context.fill();
          context.strokeStyle = "#44515f";
          context.lineWidth = 4;
          context.beginPath();
          context.moveTo(0, 0);
          context.lineTo(-2, -11);
          context.moveTo(0, 0);
          context.lineTo(10, 5);
          context.stroke();
          context.fillStyle = "#5d6977";
          context.fillRect(-8, -34, 16, 12);
          context.fillRect(-8, 22, 16, 12);
          break;
        case "wisdomStaff":
          context.strokeStyle = "#765633";
          context.lineWidth = 7;
          context.lineCap = "round";
          context.beginPath();
          context.moveTo(-15, 28);
          context.lineTo(8, -20);
          context.stroke();
          context.translate(11, -23);
          context.fillStyle = "#a6ecff";
          context.rotate(Math.PI / 4);
          this.roundRectPath(context, -10, -10, 20, 20, 4);
          context.fill();
          context.strokeStyle = "#eaffff";
          context.lineWidth = 2;
          context.stroke();
          break;
        case "snowball":
          context.fillStyle = "#eaffff";
          context.beginPath();
          context.arc(0, 0, 24, 0, TAU);
          context.fill();
          context.fillStyle = "rgba(119,201,235,.38)";
          context.beginPath();
          context.arc(7, 6, 15, 0, TAU);
          context.fill();
          context.fillStyle = "rgba(255,255,255,.9)";
          context.beginPath();
          context.arc(-8, -9, 7, 0, TAU);
          context.fill();
          break;
        default:
          context.fillStyle = color;
          context.beginPath();
          context.arc(0, 0, 18, 0, TAU);
          context.fill();
      }
      context.restore();
    }

    toast(title, message, type = "info", duration = 2600) {
      const colors = {
        info: "#75b8ff",
        success: "#7edb8b",
        danger: "#ff6b6b",
        warning: "#ffb24f"
      };
      const toast = document.createElement("div");
      toast.className = "tyy-game-toast";
      toast.style.setProperty("--toast-color", colors[type] || colors.info);
      toast.innerHTML = `<strong>${title}</strong><span>${message}</span>`;
      this.toastStack.appendChild(toast);
      window.setTimeout(() => toast.remove(), duration);
    }

    formatTime(seconds) {
      const total = Math.max(0, Math.floor(seconds));
      const minutes = Math.floor(total / 60);
      const remain = total % 60;
      return `${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`;
    }

    buildAbilityBar() {
      const bar = this.root.querySelector("#abilityBar");
      if (!bar || !this.run) return;
      const character = this.data.characters[this.run.characterId];
      const slots = [
        { id: "attack", key: this.settings.language === "en" ? "LMB" : "左鍵", icon: "✦", name: this.localize(character.attack.name), color: character.accent, cooldown: 0 },
        ...Object.entries(character.skills).map(([id, skill]) => ({
          id,
          key: skill.key,
          icon: skill.icon,
          name: this.localize(skill.name),
          color: character.accent,
          cooldown: skill.cooldown
        }))
      ];
      bar.innerHTML = slots.map(slot => `
        <div class="tyy-ability-slot is-ready" data-ability-slot="${slot.id}" style="--slot-color:${slot.color}">
          <span class="tyy-ability-slot-icon">${slot.icon}</span>
          <span class="tyy-ability-slot-key">${slot.key}</span>
          <span class="tyy-ability-slot-name">${slot.name}</span>
          <span class="tyy-ability-cooldown-mask"></span>
          <b class="tyy-ability-cooldown-text"></b>
        </div>
      `).join("");
    }

    updateAbilityBar() {
      if (!this.player || !this.run) return;
      const now = performance.now() / 1000;
      const character = this.data.characters[this.run.characterId];
      this.root.querySelectorAll("[data-ability-slot]").forEach(element => {
        const slot = element.dataset.abilitySlot;
        let remain = 0;
        let total = 1;
        if (slot === "attack") {
          const interval = 1 / Math.max(0.1, this.player.stats.attackRate * this.getBuffValue("attackSpeedMultiplier", 1));
          remain = Math.max(0, interval - (now - this.player.lastAttackAt));
          total = interval;
        } else {
          const skill = character.skills[slot];
          total = skill?.cooldown || 1;
          remain = Math.max(0, Number(this.player.cooldowns[slot] || 0) - now);
        }
        const ratio = clamp(remain / Math.max(0.01, total), 0, 1);
        const mask = element.querySelector(".tyy-ability-cooldown-mask");
        const text = element.querySelector(".tyy-ability-cooldown-text");
        mask.style.transform = `scaleY(${ratio})`;
        text.textContent = remain > 0.05 ? remain.toFixed(remain < 1 ? 1 : 0) : "";
        element.classList.toggle("is-ready", remain <= 0.05);
      });
    }

    updateHud(force = false) {
      if (!this.run || !this.player) return;
      const character = this.data.characters[this.run.characterId];
      this.root.querySelector("#hudCharacterName").textContent = this.localize(character.name);
      this.root.querySelector("#hudLevel").textContent = this.run.level;
      const hpRatio = clamp(this.player.hp / this.player.maxHp, 0, 1);
      this.root.querySelector("#hudHpFill").style.width = `${hpRatio * 100}%`;
      this.root.querySelector("#hudHpText").textContent = `${Math.ceil(this.player.hp)} / ${this.player.maxHp}${this.player.shield > 0 ? ` +${Math.ceil(this.player.shield)}` : ""}`;
      const xpRatio = clamp(this.run.xp / this.run.xpToNext, 0, 1);
      this.root.querySelector("#hudXpFill").style.width = `${xpRatio * 100}%`;
      this.root.querySelector("#hudXpText").textContent = `${Math.floor(this.run.xp)} / ${this.run.xpToNext} XP`;
      this.root.querySelector("#hudGold").textContent = Math.floor(this.run.gold);

      if (this.mode === "village" || (!this.stage && this.world?.type === "village")) {
        this.root.querySelector("#hudStageName").textContent = this.tr("village");
        this.root.querySelector("#hudTimer").textContent = "--:--";
        this.root.querySelector("#hudKills").textContent = this.run.totalKills;
        this.root.querySelector("#hudObjective").textContent = this.settings.language === "en" ? "Test damage or enter the portal" : "測試傷害，或前往傳送門";
        this.root.querySelector("#hudModifiers").innerHTML = "";
      } else if (this.stage) {
        const stageText = this.stage.isBoss
          ? `${this.run.chapter}-BOSS・${this.stage.mapName}`
          : `${this.run.chapter}-${this.run.stageNumber}・${this.stage.mapName}`;
        this.root.querySelector("#hudStageName").textContent = stageText;
        this.root.querySelector("#hudTimer").textContent = this.formatTime(this.stage.elapsed);
        this.root.querySelector("#hudKills").textContent = this.stage.isBoss
          ? `${this.stage.bossDefeated ? 1 : 0}/1`
          : `${this.stage.kills}/${this.stage.targetKills}`;
        this.root.querySelector("#hudObjective").textContent = this.stage.portalUnlocked
          ? this.tr("portalUnlocked")
          : (this.stage.isBoss ? this.tr("bossObjective") : this.tr("killObjective"));
        this.root.querySelector("#hudModifiers").innerHTML = this.stage.node.modifiers.map(modifier => `
          <div class="tyy-hud-modifier"><i class="fa ${modifier.icon}"></i><span>${this.localize(modifier.description)}</span></div>
        `).join("");
      }
      this.updateAbilityBar();

      if (force) {
        const canvas = this.root.querySelector("#hudCharacterCanvas");
        const context = canvas.getContext("2d");
        context.clearRect(0, 0, canvas.width, canvas.height);
        this.drawCharacterArt(context, character.id, 36, 66, 0.48, 1, performance.now() / 1000, true, { moveAmount: 0.12, cycle: performance.now() / 180, attackProgress: 0, airborne: false });
      }
    }

    /* =========================================================
       Canvas 繪圖：所有角色、怪物、地形與特效皆為原創程式繪製
       ========================================================= */

    drawIdleCanvas() {
      const context = this.ctx;
      const width = this.canvas.width;
      const height = this.canvas.height;
      const gradient = context.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, "#173f63");
      gradient.addColorStop(0.58, "#366c79");
      gradient.addColorStop(1, "#173329");
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);

      context.save();
      context.globalAlpha = 0.42;
      this.drawCloud(context, 160, 120, 1.3, "#dff4ff");
      this.drawCloud(context, 870, 180, 0.95, "#dff4ff");
      this.drawCloud(context, 1100, 90, 0.7, "#ffffff");
      context.restore();

      context.fillStyle = "#315d4d";
      context.beginPath();
      context.moveTo(0, 450);
      for (let x = 0; x <= width; x += 50) {
        context.lineTo(x, 420 + Math.sin(x * 0.009) * 40 + Math.sin(x * 0.021) * 13);
      }
      context.lineTo(width, height);
      context.lineTo(0, height);
      context.closePath();
      context.fill();

      context.fillStyle = "#213c32";
      context.beginPath();
      context.moveTo(0, 540);
      for (let x = 0; x <= width; x += 40) {
        context.lineTo(x, 520 + Math.sin(x * 0.016 + 1.1) * 27);
      }
      context.lineTo(width, height);
      context.lineTo(0, height);
      context.closePath();
      context.fill();
    }

    draw(time) {
      if (!this.world || !this.player) {
        this.drawIdleCanvas();
        return;
      }

      const context = this.ctx;
      const width = this.canvas.width;
      const height = this.canvas.height;
      const shakeStrength = this.settings.screenShake ? this.camera.shake : 0;
      const shakeX = shakeStrength > 0 ? (Math.random() - 0.5) * shakeStrength : 0;
      const shakeY = shakeStrength > 0 ? (Math.random() - 0.5) * shakeStrength : 0;

      context.clearRect(0, 0, width, height);
      this.drawBackground(context, time);

      context.save();
      context.translate(-this.camera.x + shakeX, -this.camera.y + shakeY);

      this.drawDecorations(context, time, "back");
      this.drawTerrain(context, time);
      this.drawWaters(context, time);
      this.drawPlatforms(context, time);
      this.drawDecorations(context, time, "front");
      this.drawZones(context, time);
      this.drawWorldObjects(context, time);
      this.drawPickups(context, time);
      this.drawProjectiles(context, time);
      this.drawEnemies(context, time);
      this.drawCompanions(context, time);
      this.drawPlayer(context, time);
      this.drawParticles(context, time);
      this.drawDamageTexts(context);

      context.restore();

      this.drawBossBar(context);
      this.drawStageAtmosphere(context, time);
    }

    ensureSceneArt(sceneKey) {
      if (this.activeSceneKey !== sceneKey) {
        Object.values(this.sceneArt).forEach(image => {
          image.onload = null;
          image.src = "";
        });
        this.sceneArt = {};
        this.sceneArtReady = {};
        this.activeSceneKey = sceneKey;
      }
      if (this.sceneArt[sceneKey]) return this.sceneArt[sceneKey];
      const source = this.sceneSources[sceneKey];
      if (!source) return null;
      const image = new Image();
      this.sceneArtReady[sceneKey] = false;
      image.addEventListener("load", () => { this.sceneArtReady[sceneKey] = true; });
      image.src = source;
      this.sceneArt[sceneKey] = image;
      return image;
    }

    drawBackground(context, time) {
      const chapter = this.world.chapter || 1;
      const palette = this.data.chapters[chapter]?.palette || this.data.chapters[1].palette;
      const sceneKey = this.mode === "village"
        ? "village"
        : (this.stage?.isBoss
          ? (chapter === 2 ? "swampBoss" : "grasslandBoss")
          : (chapter === 2 ? "swamp" : "grassland"));
      const activeSceneArt = this.ensureSceneArt(sceneKey);

      if (this.sceneArtReady[sceneKey] && activeSceneArt) {
        const image = activeSceneArt;
        const canvasRatio = this.canvas.width / this.canvas.height;
        const imageRatio = image.naturalWidth / image.naturalHeight;
        let sourceWidth = image.naturalWidth;
        let sourceHeight = image.naturalHeight;
        let sourceX = 0;
        let sourceY = 0;
        if (imageRatio > canvasRatio) {
          sourceWidth = image.naturalHeight * canvasRatio;
          sourceX = (image.naturalWidth - sourceWidth) / 2;
        } else {
          sourceHeight = image.naturalWidth / canvasRatio;
          sourceY = (image.naturalHeight - sourceHeight) / 2;
        }
        const drift = Math.sin(time * 0.025) * Math.min(18, sourceWidth * 0.012);
        context.drawImage(
          image,
          clamp(sourceX + drift, 0, image.naturalWidth - sourceWidth), sourceY,
          sourceWidth, sourceHeight,
          0, 0, this.canvas.width, this.canvas.height
        );
        const glaze = context.createLinearGradient(0, 0, 0, this.canvas.height);
        const isBossScene = sceneKey.endsWith("Boss");
        glaze.addColorStop(0, sceneKey === "grassland" ? "rgba(68,111,140,.02)" : "rgba(12,26,55,.12)");
        glaze.addColorStop(0.62, isBossScene ? "rgba(12,13,38,.16)" : "rgba(15,24,52,.08)");
        glaze.addColorStop(1, isBossScene ? "rgba(3,5,18,.68)" : "rgba(5,10,24,.5)");
        context.fillStyle = glaze;
        context.fillRect(0, 0, this.canvas.width, this.canvas.height);

        context.save();
        context.globalCompositeOperation = "screen";
        context.globalAlpha = 0.24;
        for (let index = 0; index < 7; index += 1) {
          const x = (index * 173 - this.camera.x * 0.035 + time * (4 + index % 3)) % (this.canvas.width + 80) - 40;
          const y = 90 + (index * 67 % 410) + Math.sin(time * 0.8 + index) * 9;
          const radius = 1.2 + index % 3;
          context.fillStyle = index % 4 === 0 ? "#ffd5a8" : "#9edcff";
          context.beginPath();
          context.arc(x, y, radius, 0, TAU);
          context.fill();
        }
        context.restore();
        return;
      }

      const gradient = context.createLinearGradient(0, 0, 0, this.canvas.height);
      gradient.addColorStop(0, palette.skyTop);
      gradient.addColorStop(0.72, palette.skyBottom);
      gradient.addColorStop(1, chapter === 1 ? "#83a46b" : "#435b51");
      context.fillStyle = gradient;
      context.fillRect(0, 0, this.canvas.width, this.canvas.height);

      const parallaxX = this.camera.x;
      const dayPulse = 0.5 + Math.sin(time * 0.08) * 0.08;

      if (chapter === 1) {
        context.save();
        context.globalAlpha = 0.78;
        const sunGradient = context.createRadialGradient(1050, 100, 10, 1050, 100, 100);
        sunGradient.addColorStop(0, "rgba(255,245,182,.92)");
        sunGradient.addColorStop(0.35, "rgba(255,232,141,.42)");
        sunGradient.addColorStop(1, "rgba(255,232,141,0)");
        context.fillStyle = sunGradient;
        context.beginPath();
        context.arc(1050, 100, 100, 0, TAU);
        context.fill();
        context.restore();

        context.save();
        context.globalAlpha = 0.42;
        this.drawCloud(context, 170 - (parallaxX * 0.08 % 1500), 120, 1.05, "#f5fbff");
        this.drawCloud(context, 760 - (parallaxX * 0.06 % 1500), 172, 0.76, "#f5fbff");
        this.drawCloud(context, 1260 - (parallaxX * 0.1 % 1600), 80, 0.9, "#ffffff");
        context.restore();
      } else {
        context.save();
        context.globalAlpha = 0.24;
        for (let index = 0; index < 7; index += 1) {
          const x = ((index * 245 - parallaxX * (0.04 + index * 0.004)) % 1700) - 180;
          const y = 90 + index * 58 + Math.sin(time * 0.17 + index) * 12;
          const mist = context.createRadialGradient(x, y, 10, x, y, 150);
          mist.addColorStop(0, "rgba(208,240,221,.48)");
          mist.addColorStop(1, "rgba(208,240,221,0)");
          context.fillStyle = mist;
          context.beginPath();
          context.ellipse(x, y, 180, 45, 0, 0, TAU);
          context.fill();
        }
        context.restore();
      }

      this.drawParallaxHills(context, parallaxX, palette, chapter, time, dayPulse);
    }

    drawParallaxHills(context, parallaxX, palette, chapter, time, pulse) {
      const width = this.canvas.width;
      const height = this.canvas.height;
      const layers = [
        { base: 360, amplitude: 85, frequency: 0.0042, speed: 0.12, color: palette.far, alpha: chapter === 1 ? 0.62 : 0.68 },
        { base: 445, amplitude: 55, frequency: 0.0072, speed: 0.22, color: palette.mid, alpha: 0.78 }
      ];

      layers.forEach((layer, layerIndex) => {
        context.save();
        context.globalAlpha = layer.alpha;
        context.fillStyle = layer.color;
        context.beginPath();
        context.moveTo(0, height);
        for (let screenX = -60; screenX <= width + 60; screenX += 30) {
          const worldX = screenX + parallaxX * layer.speed;
          const y = layer.base
            + Math.sin(worldX * layer.frequency + layerIndex * 0.9) * layer.amplitude
            + Math.sin(worldX * layer.frequency * 2.45 + 1.8) * layer.amplitude * 0.24;
          context.lineTo(screenX, y);
        }
        context.lineTo(width, height);
        context.closePath();
        context.fill();

        if (chapter === 2 && layerIndex === 1) {
          context.globalAlpha = 0.16 + pulse * 0.06;
          context.fillStyle = "#b6f3bf";
          for (let index = 0; index < 18; index += 1) {
            const x = ((index * 89 - parallaxX * 0.18) % (width + 120)) - 40;
            const y = 340 + (index * 47 % 170) + Math.sin(time * 1.1 + index) * 8;
            context.beginPath();
            context.arc(x, y, 2 + index % 3, 0, TAU);
            context.fill();
          }
        }
        context.restore();
      });
    }

    drawCloud(context, x, y, scale = 1, color = "#fff") {
      context.save();
      context.translate(x, y);
      context.scale(scale, scale);
      context.fillStyle = color;
      context.beginPath();
      context.arc(-42, 7, 25, 0, TAU);
      context.arc(-12, -7, 36, 0, TAU);
      context.arc(25, 0, 30, 0, TAU);
      context.arc(49, 12, 20, 0, TAU);
      context.rect(-55, 5, 110, 29);
      context.fill();
      context.restore();
    }

    drawTerrain(context, time) {
      const palette = this.data.chapters[this.world.chapter || 1]?.palette || this.data.chapters[1].palette;
      const terrain = this.world.terrain;
      if (!terrain?.length) return;

      context.save();
      context.fillStyle = palette.ground;
      context.beginPath();
      context.moveTo(terrain[0].x, this.canvas.height + 350);
      terrain.forEach(point => context.lineTo(point.x, point.y));
      context.lineTo(terrain[terrain.length - 1].x, this.canvas.height + 350);
      context.closePath();
      context.fill();

      const soilGradient = context.createLinearGradient(0, 500, 0, 850);
      soilGradient.addColorStop(0, "rgba(255,255,255,.05)");
      soilGradient.addColorStop(1, "rgba(0,0,0,.34)");
      context.fillStyle = soilGradient;
      context.fill();

      context.strokeStyle = palette.grass;
      context.lineWidth = 12;
      context.lineJoin = "round";
      context.beginPath();
      terrain.forEach((point, index) => {
        if (index === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      });
      context.stroke();

      context.strokeStyle = "rgba(240,255,190,.22)";
      context.lineWidth = 2;
      context.stroke();

      for (const pit of this.world.pits || []) {
        const leftY = this.interpolateTerrain(terrain, pit.start);
        const rightY = this.interpolateTerrain(terrain, pit.end);
        const pitGradient = context.createLinearGradient(0, Math.min(leftY, rightY), 0, this.canvas.height + 280);
        pitGradient.addColorStop(0, "rgba(17,20,25,.92)");
        pitGradient.addColorStop(1, "#06070b");
        context.fillStyle = pitGradient;
        context.beginPath();
        context.moveTo(pit.start, leftY - 4);
        context.lineTo(pit.end, rightY - 4);
        context.lineTo(pit.end, this.canvas.height + 350);
        context.lineTo(pit.start, this.canvas.height + 350);
        context.closePath();
        context.fill();

        context.strokeStyle = "rgba(0,0,0,.66)";
        context.lineWidth = 6;
        context.beginPath();
        context.moveTo(pit.start, leftY);
        context.lineTo(pit.start + 20, leftY + 60);
        context.moveTo(pit.end, rightY);
        context.lineTo(pit.end - 20, rightY + 60);
        context.stroke();
      }

      context.globalAlpha = 0.18;
      context.fillStyle = "#fff4c0";
      for (let x = Math.floor(this.camera.x / 80) * 80 - 80; x < this.camera.x + this.canvas.width + 120; x += 80) {
        const y = this.getGroundY(x);
        if (y === null) continue;
        context.beginPath();
        context.ellipse(x + Math.sin(x * 0.09) * 12, y + 30 + (x % 4) * 7, 12, 5, -0.25, 0, TAU);
        context.fill();
      }
      context.restore();
    }

    drawWaters(context, time) {
      for (const water of this.world.waters || []) {
        const startY = Math.min(
          this.interpolateTerrain(this.world.terrain, water.start),
          this.interpolateTerrain(this.world.terrain, water.end)
        ) + 5;
        const waterGradient = context.createLinearGradient(0, startY, 0, startY + 85);
        waterGradient.addColorStop(0, "rgba(82,174,183,.78)");
        waterGradient.addColorStop(1, "rgba(25,80,91,.9)");
        context.fillStyle = waterGradient;
        context.beginPath();
        context.rect(water.start, startY, water.end - water.start, 88);
        context.fill();

        context.strokeStyle = "rgba(180,244,235,.65)";
        context.lineWidth = 3;
        context.beginPath();
        for (let x = water.start; x <= water.end; x += 14) {
          const y = startY + Math.sin(time * 2.5 + x * 0.035) * 3;
          if (x === water.start) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.stroke();
      }
    }

    drawPlatforms(context, time = 0) {
      for (const platform of this.world.platforms || []) {
        context.save();
        if (platform.secret && !platform.revealed) {
          const distanceToPlayer = Math.abs(this.player.x - (platform.x + platform.width * 0.5));
          context.globalAlpha = distanceToPlayer < 320
            ? clamp(1 - distanceToPlayer / 420, 0.18, 0.72)
            : 0.08;
        }
        if (platform.type === "wood") {
          context.fillStyle = "#6e4a2c";
          this.roundRectPath(context, platform.x, platform.y, platform.width, platform.height, 5);
          context.fill();
          context.strokeStyle = "#b47b42";
          context.lineWidth = 3;
          context.stroke();
          context.strokeStyle = "rgba(35,20,10,.45)";
          context.lineWidth = 2;
          for (let x = platform.x + 24; x < platform.x + platform.width; x += 38) {
            context.beginPath();
            context.moveTo(x, platform.y + 2);
            context.lineTo(x, platform.y + platform.height - 2);
            context.stroke();
          }
        } else if (platform.type === "root") {
          context.strokeStyle = "#765039";
          context.lineWidth = platform.height;
          context.lineCap = "round";
          context.beginPath();
          context.moveTo(platform.x + 4, platform.y + 4);
          context.bezierCurveTo(
            platform.x + platform.width * 0.28,
            platform.y - 10,
            platform.x + platform.width * 0.65,
            platform.y + 10,
            platform.x + platform.width - 4,
            platform.y + 3
          );
          context.stroke();
          context.strokeStyle = "#a67a52";
          context.lineWidth = 3;
          context.stroke();
        } else {
          const gradient = context.createLinearGradient(0, platform.y, 0, platform.y + platform.height);
          gradient.addColorStop(0, "#90979b");
          gradient.addColorStop(1, "#515d62");
          context.fillStyle = gradient;
          this.roundRectPath(context, platform.x, platform.y, platform.width, platform.height, 5);
          context.fill();
          context.strokeStyle = "rgba(220,235,230,.48)";
          context.lineWidth = 2;
          context.stroke();
        }
        if (platform.secret) {
          context.strokeStyle = platform.revealed
            ? (this.world.chapter === 1 ? "rgba(255,225,132,.72)" : "rgba(124,235,202,.72)")
            : "rgba(220,245,238,.16)";
          context.lineWidth = 2;
          context.setLineDash([5, 7]);
          context.lineDashOffset = -time * 18;
          this.roundRectPath(context, platform.x - 3, platform.y - 3, platform.width + 6, platform.height + 6, 7);
          context.stroke();
          context.setLineDash([]);
        }
        context.restore();
      }
    }

    drawDecorations(context, time, layer) {
      for (const decoration of this.world.decorations || []) {
        if (decoration.layer !== layer) continue;
        if (decoration.x < this.camera.x - 180 || decoration.x > this.camera.x + this.canvas.width + 180) continue;
        const groundY = this.interpolateTerrain(this.world.terrain, decoration.x);
        this.drawDecoration(context, decoration, groundY, time, layer);
      }
    }

    drawDecoration(context, decoration, groundY, time, layer) {
      const scale = decoration.scale * (layer === "back" ? 0.88 : 1);
      const alpha = layer === "back" ? 0.62 : 1;
      context.save();
      context.globalAlpha = alpha;
      context.translate(decoration.x, groundY + 4);
      context.scale(scale, scale);
      const sway = Math.sin(time * 1.2 + decoration.x * 0.02) * 0.035;
      context.rotate(sway);

      switch (decoration.type) {
        case "tree":
          context.fillStyle = "#5e4028";
          context.fillRect(-9, -105, 18, 108);
          context.fillStyle = decoration.variant % 2 ? "#3f7b48" : "#4e8e4c";
          [-35, 0, 34].forEach((x, index) => {
            context.beginPath();
            context.arc(x, -105 + index % 2 * 8, 38 - index * 2, 0, TAU);
            context.fill();
          });
          break;
        case "deadTree":
          context.strokeStyle = "#514238";
          context.lineWidth = 13;
          context.lineCap = "round";
          context.beginPath();
          context.moveTo(0, 2);
          context.lineTo(-2, -100);
          context.moveTo(-2, -68);
          context.lineTo(-35, -93);
          context.moveTo(-1, -52);
          context.lineTo(35, -78);
          context.stroke();
          break;
        case "bush":
          context.fillStyle = "#3f7c42";
          [-22, 0, 22].forEach((x, index) => {
            context.beginPath();
            context.arc(x, -14 - (index % 2) * 9, 24, 0, TAU);
            context.fill();
          });
          break;
        case "flowers":
          for (let index = 0; index < 6; index += 1) {
            const x = -28 + index * 11;
            const y = -10 - (index % 3) * 7;
            context.strokeStyle = "#47753c";
            context.lineWidth = 2;
            context.beginPath();
            context.moveTo(x, 0);
            context.lineTo(x, y);
            context.stroke();
            context.fillStyle = ["#ffd45b", "#f7a9cb", "#e9f7ff"][index % 3];
            context.beginPath();
            context.arc(x, y, 4, 0, TAU);
            context.fill();
          }
          break;
        case "reeds":
          for (let index = 0; index < 7; index += 1) {
            const x = -25 + index * 8;
            const height = 34 + (index % 3) * 13;
            context.strokeStyle = "#6a8652";
            context.lineWidth = 3;
            context.beginPath();
            context.moveTo(x, 0);
            context.lineTo(x + Math.sin(time + index) * 3, -height);
            context.stroke();
            context.fillStyle = "#5b4431";
            context.beginPath();
            context.ellipse(x, -height - 5, 4, 10, 0, 0, TAU);
            context.fill();
          }
          break;
        case "mushroom":
          for (let index = 0; index < 3; index += 1) {
            const x = (index - 1) * 18;
            const height = 19 + index * 4;
            context.fillStyle = "#e0ddd0";
            context.fillRect(x - 3, -height, 6, height);
            context.fillStyle = decoration.variant % 2 ? "#8b72b7" : "#65a9a0";
            context.beginPath();
            context.arc(x, -height, 10 + index, Math.PI, TAU);
            context.fill();
          }
          break;
        case "sign":
          context.fillStyle = "#6c4a30";
          context.fillRect(-4, -56, 8, 58);
          context.fillStyle = "#a77742";
          this.roundRectPath(context, -32, -63, 64, 28, 4);
          context.fill();
          context.strokeStyle = "#d3a968";
          context.lineWidth = 2;
          context.stroke();
          break;
        case "stump":
          context.fillStyle = "#5d4436";
          context.fillRect(-17, -28, 34, 30);
          context.fillStyle = "#977157";
          context.beginPath();
          context.ellipse(0, -28, 18, 6, 0, 0, TAU);
          context.fill();
          break;
        case "rock":
          context.fillStyle = this.world.chapter === 2 ? "#55645b" : "#747a72";
          context.beginPath();
          context.moveTo(-28, 0);
          context.lineTo(-22, -24);
          context.lineTo(-3, -39);
          context.lineTo(25, -27);
          context.lineTo(32, 0);
          context.closePath();
          context.fill();
          context.strokeStyle = "rgba(220,235,225,.24)";
          context.lineWidth = 3;
          context.stroke();
          break;
        case "grass":
        default:
          context.strokeStyle = this.world.chapter === 2 ? "#627b4e" : "#66a149";
          context.lineWidth = 3;
          for (let index = -3; index <= 3; index += 1) {
            context.beginPath();
            context.moveTo(index * 5, 0);
            context.quadraticCurveTo(index * 6, -22, index * 10 + Math.sin(time + index) * 5, -36 - Math.abs(index) * 2);
            context.stroke();
          }
          break;
      }
      context.restore();
    }

    drawWorldObjects(context, time) {
      if (this.world.dummy) this.drawTrainingDummy(context, this.world.dummy, time);
      for (const chest of this.world.chests || []) this.drawChest(context, chest, time);
      if (this.world.portal) this.drawPortal(context, this.world.portal, time);
    }

    drawTrainingDummy(context, dummy, time) {
      context.save();
      context.translate(dummy.x, dummy.y);
      const wobble = this.dummyLastHit > 0 ? Math.sin(time * 34) * 0.06 : 0;
      context.rotate(wobble);
      context.fillStyle = "rgba(0,0,0,.25)";
      context.beginPath();
      context.ellipse(0, 33, 39, 12, 0, 0, TAU);
      context.fill();
      context.fillStyle = "#624329";
      context.fillRect(-7, -12, 14, 60);
      context.fillStyle = "#b58a54";
      this.roundRectPath(context, -26, -54, 52, 50, 8);
      context.fill();
      context.strokeStyle = "#67462c";
      context.lineWidth = 4;
      context.stroke();
      context.strokeStyle = "#d9c18f";
      context.lineWidth = 3;
      context.beginPath();
      context.arc(0, -29, 14, 0, TAU);
      context.moveTo(-10, -39);
      context.lineTo(10, -19);
      context.moveTo(10, -39);
      context.lineTo(-10, -19);
      context.stroke();
      context.restore();

      context.save();
      context.font = "700 14px system-ui, sans-serif";
      context.textAlign = "center";
      context.fillStyle = "rgba(8,20,26,.72)";
      this.roundRectPath(context, dummy.x - 74, dummy.y - 95, 148, 28, 9);
      context.fill();
      context.fillStyle = "#f4f8ed";
      context.fillText(`${this.tr("dummy")}${this.dummyDamage > 0 ? `・${Math.round(this.dummyDamage)}` : ""}`, dummy.x, dummy.y - 76);
      context.restore();
    }

    drawChest(context, chest, time) {
      if (chest.secret && !chest.revealed) {
        const near = Math.hypot(this.player.x - chest.x, this.player.y - chest.y) < 360;
        context.save();
        context.globalAlpha = near ? 0.34 : 0.08;
        context.fillStyle = chest.rarity === "elite" ? "#d8a4ff" : "#ffe083";
        context.beginPath();
        context.arc(chest.x, chest.y - 8 + Math.sin(time * 3) * 5, 4, 0, TAU);
        context.fill();
        context.restore();
        return;
      }
      context.save();
      context.translate(chest.x, chest.y);
      const bob = chest.opened ? 0 : Math.sin(time * 2.4 + chest.x * 0.01) * 2;
      context.translate(0, bob);
      context.globalAlpha = chest.opened ? 0.4 : 1;
      context.fillStyle = "rgba(0,0,0,.25)";
      context.beginPath();
      context.ellipse(0, 25, 34, 9, 0, 0, TAU);
      context.fill();
      const glow = context.createRadialGradient(0, -5, 2, 0, -5, 55);
      glow.addColorStop(0, chest.rarity === "elite" ? "rgba(210,139,255,.42)" : "rgba(255,213,101,.3)");
      glow.addColorStop(1, "rgba(255,255,255,0)");
      context.fillStyle = glow;
      context.beginPath();
      context.arc(0, -5, 55, 0, TAU);
      context.fill();
      context.fillStyle = chest.rarity === "elite" ? "#75508c" : "#8a5a2d";
      this.roundRectPath(context, -30, -5, 60, 32, 6);
      context.fill();
      context.fillStyle = chest.rarity === "elite" ? "#a777cf" : "#b77734";
      context.beginPath();
      context.moveTo(-30, -4);
      context.quadraticCurveTo(0, -35, 30, -4);
      context.lineTo(30, 5);
      context.lineTo(-30, 5);
      context.closePath();
      context.fill();
      context.strokeStyle = chest.rarity === "elite" ? "#ead3ff" : "#ffd271";
      context.lineWidth = 3;
      context.stroke();
      context.fillStyle = "#ffe19a";
      context.fillRect(-5, 0, 10, 18);
      context.restore();
    }

    drawPortal(context, portal, time) {
      context.save();
      context.translate(portal.x, portal.y);
      const active = Boolean(portal.unlocked);
      const pulse = 1 + Math.sin(time * 3.4) * 0.05;
      context.scale(pulse, pulse);
      context.globalAlpha = active ? 1 : 0.4;
      context.strokeStyle = active ? "#8ef5ff" : "#78858a";
      context.lineWidth = 9;
      context.beginPath();
      context.ellipse(0, 0, 38, 58, 0, 0, TAU);
      context.stroke();
      const inner = context.createRadialGradient(0, 0, 2, 0, 0, 45);
      inner.addColorStop(0, active ? "rgba(225,255,255,.9)" : "rgba(80,90,95,.3)");
      inner.addColorStop(0.35, active ? "rgba(81,219,235,.55)" : "rgba(80,90,95,.2)");
      inner.addColorStop(1, "rgba(20,45,70,0)");
      context.fillStyle = inner;
      context.beginPath();
      context.ellipse(0, 0, 34, 53, 0, 0, TAU);
      context.fill();
      context.rotate(time * (active ? 0.7 : 0.15));
      context.strokeStyle = active ? "rgba(240,255,255,.72)" : "rgba(190,200,200,.25)";
      context.lineWidth = 2;
      context.beginPath();
      for (let index = 0; index < 8; index += 1) {
        const angle = index / 8 * TAU;
        context.moveTo(Math.cos(angle) * 26, Math.sin(angle) * 39);
        context.lineTo(Math.cos(angle + 0.35) * 34, Math.sin(angle + 0.35) * 49);
      }
      context.stroke();
      context.restore();
    }

    drawZones(context, time) {
      for (const zone of this.zones) {
        context.save();
        context.translate(zone.x, zone.y);
        const alpha = clamp(zone.duration / 0.6, 0, 1);
        context.globalAlpha = alpha;
        const pulse = 1 + Math.sin(time * 4 + zone.id) * 0.035;
        context.scale(pulse, pulse);
        context.fillStyle = zone.color || "rgba(100,190,220,.25)";
        context.beginPath();
        context.ellipse(0, 0, zone.radius, zone.radius * 0.36, 0, 0, TAU);
        context.fill();
        context.strokeStyle = zone.hostile ? "rgba(255,116,100,.72)" : "rgba(196,255,239,.58)";
        context.lineWidth = 3;
        context.setLineDash([9, 8]);
        context.lineDashOffset = -time * 35;
        context.stroke();
        context.setLineDash([]);

        if (zone.kind === "waterPillar") {
          const gradient = context.createLinearGradient(0, -250, 0, 0);
          gradient.addColorStop(0, "rgba(180,250,255,0)");
          gradient.addColorStop(0.25, "rgba(110,220,235,.42)");
          gradient.addColorStop(1, "rgba(55,151,176,.75)");
          context.fillStyle = gradient;
          context.beginPath();
          context.moveTo(-zone.radius * 0.45, 0);
          context.quadraticCurveTo(-zone.radius * 0.15, -190, 0, -250);
          context.quadraticCurveTo(zone.radius * 0.18, -160, zone.radius * 0.45, 0);
          context.closePath();
          context.fill();
        }
        context.restore();
      }
    }

    drawPickups(context, time) {
      for (const pickup of this.pickups) {
        const alpha = clamp(pickup.life / 0.25, 0, 1);
        context.save();
        context.globalAlpha = alpha;
        context.translate(pickup.x, pickup.y);
        context.rotate(time * 5 + pickup.id);
        context.fillStyle = "#8ee7ff";
        context.beginPath();
        context.moveTo(0, -8);
        context.lineTo(6, 0);
        context.lineTo(0, 8);
        context.lineTo(-6, 0);
        context.closePath();
        context.fill();
        context.strokeStyle = "rgba(255,255,255,.8)";
        context.lineWidth = 2;
        context.stroke();
        context.restore();
      }
    }

    drawProjectiles(context, time) {
      for (const projectile of this.projectiles) {
        this.drawProjectile(context, projectile, time, false);
      }
      for (const projectile of this.enemyProjectiles) {
        this.drawProjectile(context, projectile, time, true);
      }
    }

    drawProjectile(context, projectile, time, enemyProjectile) {
      context.save();
      context.translate(projectile.x, projectile.y);
      const angle = Math.atan2(projectile.vy || 0, projectile.vx || 1);
      context.rotate(angle);
      context.fillStyle = projectile.color || "#fff";
      context.strokeStyle = "rgba(255,255,255,.75)";
      context.lineWidth = 2;

      switch (projectile.kind) {
        case "carrot":
        case "moonCarrot":
          context.fillStyle = projectile.kind === "moonCarrot" ? "#fff0a5" : "#f3973e";
          this.roundRectPath(context, -14, -5, 24, 10, 5);
          context.fill();
          context.fillStyle = "#67a94c";
          context.beginPath();
          context.moveTo(-14, 0);
          context.lineTo(-24, -9);
          context.lineTo(-20, 0);
          context.lineTo(-24, 9);
          context.closePath();
          context.fill();
          break;
        case "bone":
          context.rotate(time * 7);
          context.fillStyle = "#f3e8c7";
          context.fillRect(-14, -4, 28, 8);
          [-14, 14].forEach(x => {
            context.beginPath();
            context.arc(x, -5, 6, 0, TAU);
            context.arc(x, 5, 6, 0, TAU);
            context.fill();
          });
          break;
        case "knife":
          context.fillStyle = "#eaf7ff";
          context.beginPath();
          context.moveTo(18, 0);
          context.lineTo(-8, -6);
          context.lineTo(-2, 0);
          context.lineTo(-8, 6);
          context.closePath();
          context.fill();
          context.fillStyle = "#ffd35f";
          context.fillRect(-14, -3, 8, 6);
          break;
        case "leaf":
          context.fillStyle = projectile.color || "#8edf8f";
          context.rotate(time * 7);
          context.beginPath();
          context.moveTo(18, 0);
          context.quadraticCurveTo(1, -13, -15, 0);
          context.quadraticCurveTo(1, 13, 18, 0);
          context.fill();
          context.strokeStyle = "rgba(234,255,214,.76)";
          context.lineWidth = 2;
          context.beginPath();
          context.moveTo(-12, 0);
          context.lineTo(15, 0);
          context.stroke();
          break;
        case "thornLance":
          context.strokeStyle = "#98e8a1";
          context.lineWidth = 7;
          context.beginPath();
          context.moveTo(-24, 0);
          context.lineTo(25, 0);
          context.stroke();
          context.fillStyle = "#dffcae";
          context.beginPath();
          context.moveTo(28, 0);
          context.lineTo(12, -9);
          context.lineTo(15, 0);
          context.lineTo(12, 9);
          context.closePath();
          context.fill();
          break;
        case "clawWave":
          context.strokeStyle = projectile.color || "#ffd06b";
          context.lineWidth = 5;
          context.beginPath();
          context.arc(0, 0, projectile.radius * 1.2, -0.8, 0.8);
          context.stroke();
          break;
        case "houndRush":
        case "houndFang":
        case "pupBark":
          context.fillStyle = projectile.color || "#ffe18a";
          context.beginPath();
          context.moveTo(16, 0);
          context.lineTo(-10, -9);
          context.lineTo(-4, 0);
          context.lineTo(-10, 9);
          context.closePath();
          context.fill();
          break;
        case "snowball":
        case "ice":
        case "foxIce":
          context.fillStyle = projectile.color || "#aeefff";
          context.beginPath();
          context.arc(0, 0, projectile.radius, 0, TAU);
          context.fill();
          context.fillStyle = "rgba(255,255,255,.68)";
          context.beginPath();
          context.arc(-projectile.radius * 0.28, -projectile.radius * 0.3, projectile.radius * 0.32, 0, TAU);
          context.fill();
          break;
        case "web": {
          const spin = time * 4 + projectile.id * 0.17;
          context.rotate(spin);
          context.strokeStyle = projectile.color || "#e5e8ed";
          context.lineWidth = 1.7;
          for (let index = 0; index < 4; index += 1) {
            const spoke = index / 4 * TAU;
            context.beginPath();
            context.moveTo(0, 0);
            context.lineTo(Math.cos(spoke) * projectile.radius * 1.25, Math.sin(spoke) * projectile.radius * 1.25);
            context.stroke();
          }
          [0.58, 1].forEach(ratio => {
            context.beginPath();
            context.arc(0, 0, projectile.radius * ratio, 0, TAU);
            context.stroke();
          });
          context.rotate(-spin);
          context.strokeStyle = "rgba(235,242,244,.48)";
          context.lineWidth = 2;
          context.beginPath();
          context.moveTo(-projectile.radius * 0.4, 0);
          context.quadraticCurveTo(-projectile.radius * 2.4, Math.sin(time * 9) * 5, -projectile.radius * 4.2, 0);
          context.stroke();
          break;
        }
        case "poisonOrb":
          context.fillStyle = "#98ca66";
          context.beginPath();
          context.arc(0, 0, projectile.radius, 0, TAU);
          context.fill();
          context.fillStyle = "rgba(223,255,153,.7)";
          context.beginPath();
          context.arc(-3, -3, projectile.radius * 0.35, 0, TAU);
          context.fill();
          break;
        case "bubble":
          context.fillStyle = "rgba(126,228,245,.22)";
          context.beginPath();
          context.arc(0, 0, projectile.radius, 0, TAU);
          context.fill();
          context.strokeStyle = "rgba(217,255,255,.85)";
          context.stroke();
          break;
        default:
          context.fillStyle = projectile.color || "#fff";
          context.beginPath();
          context.arc(0, 0, projectile.radius, 0, TAU);
          context.fill();
          break;
      }
      context.restore();
    }

    drawEnemies(context, time) {
      for (const enemy of this.enemies) {
        if (enemy.x < this.camera.x - 180 || enemy.x > this.camera.x + this.canvas.width + 180) continue;
        context.save();
        context.globalAlpha = enemy.dead ? clamp(enemy.deathTimer / 0.45, 0, 1) : 1;
        if (enemy.dead) {
          context.translate(0, (0.45 - enemy.deathTimer) * 25);
          context.scale(1 + (0.45 - enemy.deathTimer) * 0.35, 1 - (0.45 - enemy.deathTimer) * 0.45);
        }
        if (enemy.isBoss) this.drawBossArt(context, enemy, time);
        else this.drawEnemyArt(context, enemy, time);
        context.restore();
        if (!enemy.dead && (!enemy.isBoss || enemy.hitFlash > 0)) this.drawEnemyHealthBar(context, enemy);
      }
    }

    drawEnemyHealthBar(context, enemy) {
      const width = enemy.isBoss ? 130 : (enemy.elite ? 62 : 48);
      const height = enemy.isBoss ? 8 : 5;
      const y = enemy.y - enemy.radius - (enemy.isBoss ? 34 : 18);
      context.save();
      context.fillStyle = "rgba(10,18,24,.76)";
      this.roundRectPath(context, enemy.x - width / 2 - 2, y - 2, width + 4, height + 4, 5);
      context.fill();
      const ratio = clamp(enemy.hp / enemy.maxHp, 0, 1);
      context.fillStyle = enemy.isBoss ? "#f06b82" : (enemy.elite ? "#c18cff" : "#e66f62");
      this.roundRectPath(context, enemy.x - width / 2, y, width * ratio, height, 4);
      context.fill();
      context.restore();
    }

    drawEnemyArt(context, enemy, time) {
      const facing = Math.cos(enemy.facingAngle || 0) >= 0 ? 1 : -1;
      const bob = Math.sin(time * 5 + enemy.x * 0.02) * (enemy.ai === "flying" ? 8 : 2);
      const scale = enemy.elite ? 1.12 : 1;
      context.save();
      context.translate(enemy.x, enemy.y + bob);
      context.scale(facing * scale, scale);
      context.fillStyle = "rgba(0,0,0,.24)";
      context.beginPath();
      context.ellipse(0, enemy.radius * 0.75 - bob, enemy.radius * 0.9, enemy.radius * 0.26, 0, 0, TAU);
      context.fill();
      if (enemy.elite) {
        context.strokeStyle = "rgba(216,177,255,.75)";
        context.lineWidth = 2;
        context.beginPath();
        context.arc(0, 0, enemy.radius + 5, 0, TAU);
        context.stroke();
      }

      this.drawLiteEnemy(context, enemy, time);

      if (enemy.hitFlash > 0) {
        context.globalCompositeOperation = "source-atop";
        context.fillStyle = `rgba(255,255,255,${clamp(enemy.hitFlash * 6, 0, 0.8)})`;
        context.fillRect(-enemy.radius * 1.6, -enemy.radius * 1.6, enemy.radius * 3.2, enemy.radius * 3.2);
      }
      context.restore();
    }

    drawLiteEnemy(context, enemy, time) {
      const r = enemy.radius;
      const color = enemy.data.color || "#7f8c86";
      const accent = enemy.accent || "#d9e9df";
      context.lineCap = "round";

      if (enemy.dataId === "grassSpider") {
        context.strokeStyle = "#32313b";
        context.lineWidth = 4;
        [-1, 1].forEach(side => {
          [-12, -3, 6].forEach((y, index) => {
            context.beginPath();
            context.moveTo(side * 6, y);
            context.lineTo(side * (r + 12), y + (index - 1) * 8);
            context.stroke();
          });
        });
        context.fillStyle = color;
        context.beginPath();
        context.ellipse(0, 2, r * 0.72, r * 0.62, 0, 0, TAU);
        context.arc(0, -12, r * 0.42, 0, TAU);
        context.fill();
      } else if (["caterpillar", "poisonCaterpillar"].includes(enemy.dataId)) {
        for (let index = 0; index < 3; index += 1) {
          context.fillStyle = index === 2 ? accent : color;
          context.beginPath();
          context.arc(-r * 0.55 + index * r * 0.55, Math.sin(time * 5 + index) * 2, r * 0.43, 0, TAU);
          context.fill();
        }
      } else if (["skyMoth", "reedMosquito"].includes(enemy.dataId)) {
        context.fillStyle = "rgba(220,241,239,.62)";
        context.beginPath();
        context.ellipse(-r * 0.62, -5, r * 0.6, r * 0.28, -0.35, 0, TAU);
        context.ellipse(r * 0.62, -5, r * 0.6, r * 0.28, 0.35, 0, TAU);
        context.fill();
        context.fillStyle = color;
        context.beginPath();
        context.ellipse(0, 2, r * 0.3, r * 0.72, 0, 0, TAU);
        context.fill();
      } else if (enemy.dataId === "stoneMimic") {
        context.fillStyle = color;
        context.beginPath();
        context.moveTo(-r, r * 0.65);
        context.lineTo(-r * 0.7, -r * 0.65);
        context.lineTo(0, -r);
        context.lineTo(r * 0.8, -r * 0.45);
        context.lineTo(r, r * 0.65);
        context.closePath();
        context.fill();
      } else if (enemy.dataId === "hornBeetle") {
        context.fillStyle = color;
        context.beginPath();
        context.ellipse(0, 2, r * 0.72, r, 0, 0, TAU);
        context.fill();
        context.fillStyle = accent;
        context.beginPath();
        context.moveTo(r * 0.55, -r * 0.45);
        context.lineTo(r * 1.25, 0);
        context.lineTo(r * 0.55, r * 0.1);
        context.closePath();
        context.fill();
      } else if (enemy.dataId === "leechSwarm") {
        for (let index = 0; index < 3; index += 1) {
          context.fillStyle = index % 2 ? accent : color;
          context.beginPath();
          context.ellipse((index - 1) * r * 0.45, (index % 2) * 8, r * 0.45, r * 0.2, -0.25, 0, TAU);
          context.fill();
        }
      } else if (enemy.dataId === "mudCrab") {
        context.fillStyle = color;
        context.beginPath();
        context.ellipse(0, 5, r * 0.75, r * 0.5, 0, 0, TAU);
        context.fill();
        context.fillStyle = accent;
        context.beginPath();
        context.arc(-r * 0.85, -r * 0.25, r * 0.28, 0, TAU);
        context.arc(r * 0.85, -r * 0.25, r * 0.28, 0, TAU);
        context.fill();
      } else {
        context.fillStyle = color;
        context.beginPath();
        context.moveTo(-r, r * 0.6);
        context.quadraticCurveTo(-r * 0.8, -r, 0, -r);
        context.quadraticCurveTo(r * 0.8, -r, r, r * 0.6);
        context.quadraticCurveTo(0, r, -r, r * 0.6);
        context.fill();
      }

      context.fillStyle = accent;
      context.beginPath();
      context.arc(-r * 0.24, -r * 0.2, 2.6, 0, TAU);
      context.arc(r * 0.24, -r * 0.2, 2.6, 0, TAU);
      context.fill();
    }

    drawSpiderEnemy(context, enemy, time) {
      const radius = enemy.radius;
      const movement = clamp(Math.abs(enemy.vx) / Math.max(1, enemy.speed), 0, 1);
      const cycle = time * (7 + movement * 8) + Number(enemy.id.replace(/\D/g, "")) * 0.17;
      context.strokeStyle = "#302c31";
      context.lineWidth = 5;
      context.lineCap = "round";
      [-1, 1].forEach(side => {
        for (let index = 0; index < 4; index += 1) {
          const phase = cycle + index * 0.85 + (side < 0 ? Math.PI : 0);
          const y = -13 + index * 9;
          const stepX = Math.sin(phase) * 9 * movement;
          const stepY = Math.cos(phase) * 5 * movement;
          context.beginPath();
          context.moveTo(side * 8, y);
          context.lineTo(side * (radius + 7), y - 9 + index * 5 - stepY);
          context.lineTo(side * (radius + 18 + stepX), y + 4 + index * 4 + stepY);
          context.stroke();
        }
      });
      const bodyBob = Math.sin(cycle * 0.5) * movement * 2;
      context.translate(0, bodyBob);
      const bodyGradient = context.createLinearGradient(-radius, -radius, radius, radius);
      bodyGradient.addColorStop(0, enemy.accent);
      bodyGradient.addColorStop(0.35, enemy.data.color);
      bodyGradient.addColorStop(1, "#2a2427");
      context.fillStyle = bodyGradient;
      context.beginPath();
      context.ellipse(0, 4, radius * 0.72, radius * 0.58, 0, 0, TAU);
      context.fill();
      context.beginPath();
      context.arc(0, -11, radius * 0.46, 0, TAU);
      context.fill();
      context.fillStyle = enemy.accent;
      [-9, -3, 3, 9].forEach((x, index) => {
        context.beginPath();
        context.arc(x, -15 + (index % 2) * 5, 2.4, 0, TAU);
        context.fill();
      });
      if (enemy.attackTimer < 0.34) {
        context.strokeStyle = "rgba(239,244,245,.78)";
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(radius * 0.3, -7);
        context.quadraticCurveTo(radius * 0.9, -12, radius * 1.25, -4);
        context.stroke();
      }
    }

    drawCaterpillarEnemy(context, enemy, poisonous, time) {
      const radius = enemy.radius;
      const base = poisonous ? "#7455a1" : enemy.data.color;
      const movement = clamp(Math.abs(enemy.vx) / Math.max(1, enemy.speed), 0, 1);
      const cycle = time * (5 + movement * 5) + enemy.x * 0.01;
      for (let index = 3; index >= 0; index -= 1) {
        const wave = Math.sin(cycle - index * 0.75) * (2 + movement * 4);
        context.fillStyle = index % 2 ? enemy.accent : base;
        context.beginPath();
        context.arc(-radius * 0.62 + index * radius * 0.42, 2 + wave, radius * (0.38 + index * 0.02), 0, TAU);
        context.fill();
        context.fillStyle = "rgba(255,255,255,.12)";
        context.beginPath();
        context.arc(-radius * 0.68 + index * radius * 0.42, -4 + wave, radius * 0.12, 0, TAU);
        context.fill();
      }
      const headY = -4 + Math.sin(cycle + 0.5) * 2;
      context.fillStyle = base;
      context.beginPath();
      context.arc(radius * 0.66, headY, radius * 0.48, 0, TAU);
      context.fill();
      context.fillStyle = "#f2f7e9";
      context.beginPath();
      context.arc(radius * 0.77, headY - 6, 4, 0, TAU);
      context.fill();
      context.fillStyle = "#20252b";
      context.beginPath();
      context.arc(radius * 0.79, headY - 6, 2, 0, TAU);
      context.fill();
      context.strokeStyle = enemy.accent;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(radius * 0.72, headY - radius * 0.4);
      context.quadraticCurveTo(radius * 0.8, headY - radius * 0.8, radius * 1.03, headY - radius * 0.85 + Math.sin(cycle) * 3);
      context.stroke();
    }

    drawMothEnemy(context, enemy, time) {
      const radius = enemy.radius;
      const flap = 0.6 + Math.sin(time * 13 + enemy.id.length) * 0.28;
      context.fillStyle = "rgba(211,220,243,.72)";
      context.save();
      context.rotate(-flap * 0.35);
      context.beginPath();
      context.ellipse(-radius * 0.72, -3, radius * 0.75, radius * 0.42, -0.45, 0, TAU);
      context.fill();
      context.restore();
      context.save();
      context.rotate(flap * 0.35);
      context.beginPath();
      context.ellipse(radius * 0.72, -3, radius * 0.75, radius * 0.42, 0.45, 0, TAU);
      context.fill();
      context.restore();
      context.fillStyle = enemy.data.color;
      context.beginPath();
      context.ellipse(0, 3, radius * 0.32, radius * 0.78, 0, 0, TAU);
      context.fill();
      context.fillStyle = enemy.accent;
      context.beginPath();
      context.arc(0, -radius * 0.62, radius * 0.25, 0, TAU);
      context.fill();
    }

    drawStoneEnemy(context, enemy) {
      const radius = enemy.radius;
      context.fillStyle = enemy.data.color;
      context.beginPath();
      context.moveTo(-radius, radius * 0.65);
      context.lineTo(-radius * 0.82, -radius * 0.32);
      context.lineTo(-radius * 0.32, -radius * 0.92);
      context.lineTo(radius * 0.48, -radius * 0.78);
      context.lineTo(radius, -radius * 0.1);
      context.lineTo(radius * 0.84, radius * 0.68);
      context.closePath();
      context.fill();
      context.strokeStyle = enemy.accent;
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(-radius * 0.52, -radius * 0.18);
      context.lineTo(-radius * 0.16, -radius * 0.38);
      context.moveTo(radius * 0.12, -radius * 0.3);
      context.lineTo(radius * 0.5, -radius * 0.1);
      context.stroke();
      context.fillStyle = "#f7e16f";
      [-0.38, 0.35].forEach(amount => {
        context.beginPath();
        context.arc(radius * amount, -radius * 0.22, 4, 0, TAU);
        context.fill();
      });
    }

    drawBeetleEnemy(context, enemy, time) {
      const radius = enemy.radius;
      const movement = clamp(Math.abs(enemy.vx) / Math.max(1, enemy.speed), 0, 1);
      const cycle = time * (6 + movement * 7);
      context.strokeStyle = "#172b28";
      context.lineWidth = 4;
      [-1, 1].forEach(side => {
        [-0.45, 0, 0.45].forEach((amount, index) => {
          const step = Math.sin(cycle + index * 1.2 + (side < 0 ? Math.PI : 0)) * 8 * movement;
          context.beginPath();
          context.moveTo(side * radius * 0.55, amount * radius);
          context.lineTo(side * (radius * 1.2 + step), amount * radius + side * 4 + Math.abs(step) * 0.25);
          context.stroke();
        });
      });
      const shell = context.createLinearGradient(-radius, -radius, radius, radius);
      shell.addColorStop(0, enemy.accent);
      shell.addColorStop(0.28, enemy.data.color);
      shell.addColorStop(1, "#163c38");
      context.fillStyle = shell;
      context.beginPath();
      context.ellipse(0, 2, radius * 0.78, radius, 0, 0, TAU);
      context.fill();
      context.strokeStyle = enemy.accent;
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(0, -radius * 0.8);
      context.lineTo(0, radius * 0.82);
      context.stroke();
      context.fillStyle = enemy.accent;
      context.beginPath();
      context.moveTo(radius * 0.62, -radius * 0.52);
      context.lineTo(radius * 1.45, -radius * 0.08);
      context.lineTo(radius * 0.66, radius * 0.08);
      context.closePath();
      context.fill();
    }

    drawLeechEnemy(context, enemy, time) {
      const radius = enemy.radius;
      for (let index = 0; index < 4; index += 1) {
        const angle = time * 1.5 + index / 4 * TAU;
        const x = Math.cos(angle) * radius * 0.55;
        const y = Math.sin(angle * 1.4) * radius * 0.35;
        context.save();
        context.translate(x, y);
        context.rotate(angle * 0.35);
        context.fillStyle = index % 2 ? enemy.accent : enemy.data.color;
        context.beginPath();
        context.ellipse(0, 0, radius * 0.5, radius * 0.22, 0, 0, TAU);
        context.fill();
        context.restore();
      }
    }

    drawSlimeEnemy(context, enemy, time) {
      const radius = enemy.radius;
      const squash = 1 + Math.sin(time * 6 + enemy.x * 0.02) * 0.08;
      context.save();
      context.scale(1 / squash, squash);
      context.fillStyle = enemy.data.color;
      context.beginPath();
      context.moveTo(-radius, radius * 0.65);
      context.quadraticCurveTo(-radius * 0.9, -radius * 0.9, 0, -radius);
      context.quadraticCurveTo(radius * 0.9, -radius * 0.9, radius, radius * 0.65);
      context.quadraticCurveTo(0, radius * 1.05, -radius, radius * 0.65);
      context.fill();
      context.fillStyle = enemy.accent;
      [-0.35, 0.35].forEach(amount => {
        context.beginPath();
        context.arc(radius * amount, -radius * 0.2, 4, 0, TAU);
        context.fill();
      });
      context.restore();
    }

    drawMosquitoEnemy(context, enemy, time) {
      const radius = enemy.radius;
      const flap = Math.sin(time * 19) * 0.25;
      context.fillStyle = "rgba(220,245,238,.62)";
      context.save();
      context.rotate(flap);
      context.beginPath();
      context.ellipse(-radius * 0.45, -radius * 0.28, radius * 0.58, radius * 0.24, -0.5, 0, TAU);
      context.ellipse(radius * 0.45, -radius * 0.28, radius * 0.58, radius * 0.24, 0.5, 0, TAU);
      context.fill();
      context.restore();
      context.fillStyle = enemy.data.color;
      context.beginPath();
      context.ellipse(0, 0, radius * 0.3, radius * 0.75, 0, 0, TAU);
      context.fill();
      context.strokeStyle = enemy.accent;
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(0, radius * 0.1);
      context.lineTo(radius * 1.15, radius * 0.3);
      context.stroke();
    }

    drawCrabEnemy(context, enemy, time) {
      const radius = enemy.radius;
      const movement = clamp(Math.abs(enemy.vx) / Math.max(1, enemy.speed), 0, 1);
      const cycle = time * (5 + movement * 7);
      context.strokeStyle = enemy.data.color;
      context.lineWidth = 5;
      [-1, 1].forEach(side => {
        for (let index = 0; index < 3; index += 1) {
          const step = Math.sin(cycle + index * 1.1 + (side < 0 ? Math.PI : 0)) * 8 * movement;
          context.beginPath();
          context.moveTo(side * radius * 0.55, -5 + index * 10);
          context.lineTo(side * (radius * (0.95 + index * 0.1) + step), 12 + index * 7 + Math.abs(step) * 0.3);
          context.stroke();
        }
      });
      const shell = context.createLinearGradient(-radius, -radius, radius, radius);
      shell.addColorStop(0, enemy.accent);
      shell.addColorStop(0.28, enemy.data.color);
      shell.addColorStop(1, "#653729");
      context.fillStyle = shell;
      context.beginPath();
      context.ellipse(0, 4, radius * 0.78, radius * 0.55, 0, 0, TAU);
      context.fill();
      context.fillStyle = enemy.accent;
      [-1, 1].forEach(side => {
        const pinch = Math.sin(time * 4 + side) * 0.13;
        context.save();
        context.translate(side * radius * 0.9, -radius * 0.33);
        context.rotate(side * pinch);
        context.beginPath();
        context.arc(0, 0, radius * 0.32, 0, TAU);
        context.fill();
        context.restore();
      });
      context.fillStyle = "#fff2cd";
      [-0.3, 0.3].forEach(amount => {
        context.beginPath();
        context.arc(radius * amount, -radius * 0.32, 3.7, 0, TAU);
        context.fill();
      });
    }

    drawBossArt(context, enemy, time) {
      const facing = Math.cos(enemy.facingAngle || 0) >= 0 ? 1 : -1;
      context.save();
      context.translate(enemy.x, enemy.y + Math.sin(time * 2.5) * 2);
      context.scale(facing, 1);
      context.fillStyle = "rgba(0,0,0,.34)";
      context.beginPath();
      context.ellipse(0, enemy.radius * 0.86, enemy.radius * 1.15, enemy.radius * 0.3, 0, 0, TAU);
      context.fill();
      if (enemy.dataId === "whiteFox") this.drawWhiteFoxBoss(context, enemy, time);
      else this.drawOtterBoss(context, enemy, time);
      if (enemy.hitFlash > 0) {
        context.globalCompositeOperation = "source-atop";
        context.fillStyle = `rgba(255,255,255,${clamp(enemy.hitFlash * 5, 0, 0.72)})`;
        context.fillRect(-110, -120, 220, 230);
      }
      context.restore();
    }

    drawWhiteFoxBoss(context, enemy, time) {
      const r = enemy.radius;
      context.save();
      context.rotate(Math.sin(time * 2.2) * 0.025);
      context.fillStyle = "rgba(182,239,249,.65)";
      for (let index = 0; index < 3; index += 1) {
        context.save();
        context.rotate(-0.65 + index * 0.58 + Math.sin(time * 2 + index) * 0.08);
        context.beginPath();
        context.ellipse(-r * 0.25, r * 0.05, r * 0.42, r * 1.25, 0, 0, TAU);
        context.fill();
        context.restore();
      }
      context.fillStyle = enemy.data.color;
      context.beginPath();
      context.ellipse(0, 8, r * 0.72, r * 0.88, 0, 0, TAU);
      context.fill();
      context.beginPath();
      context.arc(0, -r * 0.6, r * 0.58, 0, TAU);
      context.fill();
      context.beginPath();
      context.moveTo(-r * 0.46, -r * 0.88);
      context.lineTo(-r * 0.28, -r * 1.45);
      context.lineTo(-r * 0.02, -r * 0.95);
      context.closePath();
      context.moveTo(r * 0.46, -r * 0.88);
      context.lineTo(r * 0.28, -r * 1.45);
      context.lineTo(r * 0.02, -r * 0.95);
      context.closePath();
      context.fill();
      context.fillStyle = "#9be8f3";
      [-0.25, 0.25].forEach(amount => {
        context.beginPath();
        context.ellipse(r * amount, -r * 0.66, 6, 9, 0, 0, TAU);
        context.fill();
      });
      context.fillStyle = "#283f4c";
      context.beginPath();
      context.arc(r * 0.52, -r * 0.4, 7, 0, TAU);
      context.fill();
      context.restore();
    }

    drawOtterBoss(context, enemy, time) {
      const r = enemy.radius;
      context.fillStyle = "rgba(75,181,199,.4)";
      context.beginPath();
      context.ellipse(-r * 0.55, r * 0.35, r * 0.38, r * 1.08, -0.55 + Math.sin(time * 2) * 0.08, 0, TAU);
      context.fill();
      context.fillStyle = enemy.data.color;
      context.beginPath();
      context.ellipse(0, r * 0.08, r * 0.72, r, 0, 0, TAU);
      context.fill();
      context.beginPath();
      context.arc(0, -r * 0.62, r * 0.58, 0, TAU);
      context.fill();
      context.fillStyle = "#d6b999";
      context.beginPath();
      context.ellipse(r * 0.14, -r * 0.48, r * 0.42, r * 0.3, 0, 0, TAU);
      context.fill();
      context.fillStyle = "#1e2d31";
      context.beginPath();
      context.arc(r * 0.36, -r * 0.52, 6, 0, TAU);
      context.fill();
      context.strokeStyle = "#ecdfc9";
      context.lineWidth = 2;
      [-12, 0, 12].forEach(offset => {
        context.beginPath();
        context.moveTo(r * 0.35, -r * 0.35 + offset * 0.25);
        context.lineTo(r * 0.88, -r * 0.45 + offset * 0.42);
        context.stroke();
      });
      context.strokeStyle = enemy.accent;
      context.lineWidth = 5;
      context.beginPath();
      context.arc(0, 0, r * 1.1, time, time + Math.PI * 1.15);
      context.stroke();
    }

    drawCompanions(context, time) {
      for (const companion of this.companions) {
        context.save();
        context.translate(companion.x, companion.y + Math.sin(time * 5 + companion.slot) * 3);
        context.fillStyle = "rgba(0,0,0,.2)";
        context.beginPath();
        context.ellipse(0, companion.radius * 0.9, companion.radius * 0.85, companion.radius * 0.25, 0, 0, TAU);
        context.fill();
        const scale = companion.type === "hound" ? 0.62 : 0.48;
        this.drawCharacterArt(context, "dog", 0, companion.radius, scale, Math.cos(companion.angle) >= 0 ? 1 : -1, time + companion.slot, true);
        context.restore();
      }
    }

    drawPlayer(context, time) {
      const character = this.data.characters[this.run.characterId];
      const now = performance.now() / 1000;
      context.save();
      if (this.player.invulnerableUntil > now && Math.floor(now * 18) % 2 === 0) context.globalAlpha = 0.42;
      const runAmount = clamp(Math.abs(this.player.vx) / Math.max(1, this.player.stats.moveSpeed), 0, 1);
      const attackRemaining = Math.max(0, this.player.attackAnimUntil - now);
      const attackProgress = this.player.attackAnimUntil > this.player.lastAttackAt
        ? clamp(1 - attackRemaining / Math.max(0.08, this.player.attackAnimUntil - this.player.lastAttackAt), 0, 1)
        : 0;
      const bob = this.player.onGround ? Math.sin(time * 12) * runAmount * 3 : 0;
      this.drawCharacterArt(
        context,
        character.id,
        this.player.x,
        this.player.y + this.player.height / 2 + bob,
        character.id === "hippo" ? 0.82 : 0.76,
        this.player.facing,
        time,
        false,
        {
          moveAmount: runAmount,
          cycle: time * (8 + runAmount * 8),
          attackProgress,
          airborne: !this.player.onGround,
          verticalVelocity: this.player.vy,
          aimAngle: this.player.aimAngle
        }
      );

      if (this.player.shield > 0) {
        context.strokeStyle = "rgba(116,231,241,.76)";
        context.lineWidth = 4;
        context.beginPath();
        context.ellipse(this.player.x, this.player.y, this.player.width * 0.78, this.player.height * 0.72, 0, 0, TAU);
        context.stroke();
      }

      if (this.player.attackAnimUntil > now && character.attack.type === "melee") {
        context.strokeStyle = character.accent;
        context.lineWidth = 7;
        context.lineCap = "round";
        context.globalAlpha = clamp((this.player.attackAnimUntil - now) * 8, 0, 1);
        context.beginPath();
        context.arc(
          this.player.x,
          this.player.y,
          character.attack.range * 0.72,
          this.player.aimAngle - character.attack.arc * 0.55,
          this.player.aimAngle + character.attack.arc * 0.55
        );
        context.stroke();
      }
      context.restore();
    }

    drawCharacterArt(context, characterId, x, y, scale = 1, facing = 1, time = 0, preview = false, animation = null) {
      const character = this.data.characters[characterId];
      if (!character) return;
      const motion = animation || {
        moveAmount: preview ? 0.12 : 0,
        cycle: time * 4,
        attackProgress: 0,
        airborne: false,
        verticalVelocity: 0,
        aimAngle: 0
      };
      const bob = preview
        ? Math.sin(time * 2.2) * 1.5
        : Math.sin(motion.cycle) * motion.moveAmount * 1.8;
      const lean = motion.airborne
        ? clamp((motion.verticalVelocity || 0) / 1500, -0.08, 0.1)
        : Math.sin(motion.cycle) * motion.moveAmount * 0.025;
      this.characterMotion = motion;

      context.save();
      context.translate(x, y + bob);
      context.scale(scale * facing, scale);
      context.rotate(lean);

      context.fillStyle = "rgba(0,0,0,.24)";
      context.beginPath();
      context.ellipse(0, 2, 34 - motion.moveAmount * 3, 10 + motion.moveAmount * 2, 0, 0, TAU);
      context.fill();

      switch (characterId) {
        case "cat":
          this.drawLiteCat(context, character, time);
          break;
        case "rabbit":
          this.drawLiteRabbit(context, character, time);
          break;
        case "hippo":
          this.drawLiteHippo(context, character, time);
          break;
        case "deer":
          this.drawLiteDeer(context, character, time);
          break;
        case "dog":
          this.drawLiteDog(context, character, time);
          break;
        default:
          break;
      }
      this.drawLiteCharacterWeapon(context, characterId, character, motion, time);
      context.restore();
      this.characterMotion = null;
    }

    drawAnimatedCharacterWeapon(context, characterId, character, motion, time) {
      const attack = clamp(motion.attackProgress || 0, 0, 1);
      const swing = attack > 0
        ? Math.sin(attack * Math.PI) * 1.05 - attack * 0.5
        : Math.sin(time * 2.3) * 0.035;
      const recoil = attack > 0 ? Math.sin(attack * Math.PI) * 8 : 0;
      context.save();
      context.translate(19 - recoil * 0.15, -31);
      context.rotate(-0.38 + swing);
      context.lineCap = "round";

      if (characterId === "cat") {
        context.strokeStyle = "#5b3a28";
        context.lineWidth = 7;
        context.beginPath();
        context.moveTo(0, 0);
        context.lineTo(32, -2);
        context.stroke();
        const blade = context.createLinearGradient(28, 0, 57, 0);
        blade.addColorStop(0, "#fff9d6");
        blade.addColorStop(1, character.accent);
        context.fillStyle = blade;
        context.shadowColor = character.accent;
        context.shadowBlur = attack > 0 ? 14 : 5;
        context.beginPath();
        context.moveTo(29, -8);
        context.quadraticCurveTo(51, -16, 62, -4);
        context.quadraticCurveTo(49, 5, 29, 5);
        context.closePath();
        context.fill();
      } else if (characterId === "rabbit") {
        context.strokeStyle = "#74472d";
        context.lineWidth = 6;
        context.beginPath();
        context.moveTo(-3, 0);
        context.lineTo(38, 0);
        context.stroke();
        context.strokeStyle = "#e4c58b";
        context.lineWidth = 3;
        context.beginPath();
        context.arc(29, 0, 18, -1.1, 1.1);
        context.stroke();
        context.fillStyle = "#f49a3d";
        context.beginPath();
        context.moveTo(38, -6);
        context.lineTo(58, 0);
        context.lineTo(38, 6);
        context.closePath();
        context.fill();
        context.fillStyle = "#71b14e";
        context.beginPath();
        context.moveTo(55, 0);
        context.lineTo(67, -10);
        context.lineTo(63, 0);
        context.lineTo(67, 10);
        context.closePath();
        context.fill();
      } else if (characterId === "hippo") {
        context.strokeStyle = "#68452d";
        context.lineWidth = 9;
        context.beginPath();
        context.moveTo(-2, 4);
        context.lineTo(38, -2);
        context.stroke();
        const head = context.createLinearGradient(33, -20, 62, 18);
        head.addColorStop(0, "#b9c5c8");
        head.addColorStop(1, "#64787e");
        context.fillStyle = head;
        this.roundRectPath(context, 34, -20, 31, 39, 7);
        context.fill();
        context.strokeStyle = "rgba(235,255,255,.6)";
        context.lineWidth = 2;
        context.stroke();
      } else if (characterId === "deer") {
        context.strokeStyle = "#6a4d2e";
        context.lineWidth = 6;
        context.beginPath();
        context.moveTo(-2, 5);
        context.lineTo(48, -4);
        context.stroke();
        context.translate(51, -5);
        context.rotate(time * 0.5);
        context.fillStyle = character.accent;
        context.shadowColor = character.accent;
        context.shadowBlur = 10;
        for (let index = 0; index < 5; index += 1) {
          context.rotate(TAU / 5);
          context.beginPath();
          context.ellipse(9, 0, 12, 5, 0, 0, TAU);
          context.fill();
        }
        context.fillStyle = "#e9ffd1";
        context.beginPath();
        context.arc(0, 0, 6, 0, TAU);
        context.fill();
      } else if (characterId === "dog") {
        context.strokeStyle = "#f5ead0";
        context.lineWidth = 8;
        context.beginPath();
        context.moveTo(-1, 1);
        context.lineTo(40, -1);
        context.stroke();
        context.fillStyle = "#f5ead0";
        [37, 45].forEach(offset => {
          context.beginPath();
          context.arc(offset, -6, 6, 0, TAU);
          context.arc(offset, 5, 6, 0, TAU);
          context.fill();
        });
      }
      context.restore();
    }

    drawCharacterFace(context, eyeColor = "#263039", pupilOffset = 1) {
      context.fillStyle = "#fffaf0";
      [-11, 11].forEach(x => {
        context.beginPath();
        context.ellipse(x, -61, 7, 9, 0, 0, TAU);
        context.fill();
      });
      context.fillStyle = eyeColor;
      [-11, 11].forEach(x => {
        context.beginPath();
        context.arc(x + pupilOffset, -60, 3.5, 0, TAU);
        context.fill();
      });
    }

    drawCatCharacter(context, character, time) {
      context.strokeStyle = "#b86831";
      context.lineWidth = 9;
      context.lineCap = "round";
      context.beginPath();
      context.moveTo(-20, -26);
      context.quadraticCurveTo(-50, -34, -45 + Math.sin(time * 3) * 5, -63);
      context.stroke();
      context.fillStyle = character.color;
      context.beginPath();
      context.ellipse(0, -27, 25, 31, 0, 0, TAU);
      context.fill();
      context.fillStyle = "#32425a";
      context.beginPath();
      context.moveTo(-23, -35);
      context.lineTo(23, -35);
      context.lineTo(18, -7);
      context.lineTo(-18, -7);
      context.closePath();
      context.fill();
      context.fillStyle = character.color;
      context.beginPath();
      context.arc(0, -64, 28, 0, TAU);
      context.fill();
      context.beginPath();
      context.moveTo(-22, -80);
      context.lineTo(-17, -106);
      context.lineTo(-4, -84);
      context.closePath();
      context.moveTo(22, -80);
      context.lineTo(17, -106);
      context.lineTo(4, -84);
      context.closePath();
      context.fill();
      this.drawCharacterFace(context, "#33414b", 1);
      context.fillStyle = "#5f382c";
      context.beginPath();
      context.moveTo(0, -53);
      context.lineTo(5, -48);
      context.lineTo(-5, -48);
      context.closePath();
      context.fill();
      context.strokeStyle = character.accent;
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(22, -28);
      context.lineTo(48, -47);
      context.stroke();
      context.fillStyle = "#eef8ff";
      context.beginPath();
      context.moveTo(54, -51);
      context.lineTo(36, -48);
      context.lineTo(48, -35);
      context.closePath();
      context.fill();
      this.drawCharacterLegs(context, "#272e3b");
    }

    drawRabbitCharacter(context, character, time) {
      context.fillStyle = character.color;
      context.beginPath();
      context.ellipse(0, -30, 24, 32, 0, 0, TAU);
      context.fill();
      context.fillStyle = "#6c8fa4";
      context.beginPath();
      context.moveTo(-23, -38);
      context.lineTo(23, -38);
      context.lineTo(18, -7);
      context.lineTo(-18, -7);
      context.closePath();
      context.fill();
      context.fillStyle = character.color;
      context.beginPath();
      context.arc(0, -64, 27, 0, TAU);
      context.fill();
      [-12, 12].forEach((x, index) => {
        context.save();
        context.translate(x, -86);
        context.rotate((index ? 0.08 : -0.08) + Math.sin(time * 2 + index) * 0.025);
        context.fillStyle = character.color;
        context.beginPath();
        context.ellipse(0, -21, 9, 31, 0, 0, TAU);
        context.fill();
        context.fillStyle = "#efb9bd";
        context.beginPath();
        context.ellipse(0, -22, 3.6, 22, 0, 0, TAU);
        context.fill();
        context.restore();
      });
      this.drawCharacterFace(context, "#32404a", 1);
      context.fillStyle = "#ef9e9e";
      context.beginPath();
      context.arc(0, -51, 3.8, 0, TAU);
      context.fill();
      context.strokeStyle = "#7b542f";
      context.lineWidth = 5;
      context.beginPath();
      context.moveTo(21, -28);
      context.lineTo(43, -48);
      context.stroke();
      context.fillStyle = "#f29a3f";
      context.beginPath();
      context.moveTo(48, -54);
      context.lineTo(68, -46);
      context.lineTo(48, -39);
      context.closePath();
      context.fill();
      context.fillStyle = "#64a54e";
      context.beginPath();
      context.moveTo(68, -46);
      context.lineTo(78, -55);
      context.lineTo(75, -45);
      context.lineTo(79, -35);
      context.closePath();
      context.fill();
      this.drawCharacterLegs(context, "#7c8c9a");
    }

    drawHippoCharacter(context, character, time) {
      context.fillStyle = character.color;
      context.beginPath();
      context.ellipse(0, -33, 34, 38, 0, 0, TAU);
      context.fill();
      context.fillStyle = "#385f70";
      context.beginPath();
      context.moveTo(-32, -44);
      context.lineTo(32, -44);
      context.lineTo(29, -5);
      context.lineTo(-29, -5);
      context.closePath();
      context.fill();
      context.fillStyle = character.color;
      context.beginPath();
      context.ellipse(0, -70, 35, 29, 0, 0, TAU);
      context.fill();
      context.beginPath();
      context.arc(-26, -87, 10, 0, TAU);
      context.arc(26, -87, 10, 0, TAU);
      context.fill();
      context.fillStyle = "#b9d8df";
      context.beginPath();
      context.ellipse(9, -62, 25, 15, 0, 0, TAU);
      context.fill();
      this.drawCharacterFace(context, "#293941", 1);
      context.strokeStyle = "#6d4a2e";
      context.lineWidth = 8;
      context.beginPath();
      context.moveTo(28, -27);
      context.lineTo(55, -57);
      context.stroke();
      context.fillStyle = "#809398";
      this.roundRectPath(context, 45, -77, 31, 36, 7);
      context.fill();
      context.fillStyle = "rgba(111,222,231,.45)";
      context.beginPath();
      context.ellipse(-34, -29, 18, 34, 0, 0, TAU);
      context.fill();
      context.strokeStyle = "#b5f2f2";
      context.lineWidth = 3;
      context.stroke();
      this.drawCharacterLegs(context, "#335766", 1.18);
    }

    drawDeerCharacter(context, character, time) {
      context.fillStyle = character.color;
      context.beginPath();
      context.ellipse(0, -29, 24, 31, 0, 0, TAU);
      context.fill();
      context.fillStyle = "#42694b";
      context.beginPath();
      context.moveTo(-23, -39);
      context.lineTo(23, -39);
      context.lineTo(17, -7);
      context.lineTo(-17, -7);
      context.closePath();
      context.fill();
      context.fillStyle = character.color;
      context.beginPath();
      context.arc(0, -65, 27, 0, TAU);
      context.fill();
      context.fillStyle = "#6d4731";
      context.strokeStyle = "#6d4731";
      context.lineWidth = 5;
      context.lineCap = "round";
      [-1, 1].forEach(side => {
        context.beginPath();
        context.moveTo(side * 11, -85);
        context.lineTo(side * 17, -112);
        context.moveTo(side * 16, -101);
        context.lineTo(side * 29, -113);
        context.moveTo(side * 17, -94);
        context.lineTo(side * 31, -99);
        context.stroke();
      });
      context.fillStyle = "#f2d4ab";
      context.beginPath();
      context.ellipse(8, -58, 17, 12, 0, 0, TAU);
      context.fill();
      this.drawCharacterFace(context, "#26372f", 1);
      context.fillStyle = character.accent;
      context.beginPath();
      context.moveTo(25, -34);
      context.lineTo(53, -50);
      context.lineTo(45, -35);
      context.lineTo(62, -26);
      context.lineTo(38, -23);
      context.closePath();
      context.fill();
      this.drawCharacterLegs(context, "#3d5c43");
    }

    drawDogCharacter(context, character, time) {
      context.fillStyle = character.color;
      context.beginPath();
      context.ellipse(0, -29, 25, 32, 0, 0, TAU);
      context.fill();
      context.fillStyle = "#5b6b80";
      context.beginPath();
      context.moveTo(-24, -39);
      context.lineTo(24, -39);
      context.lineTo(19, -7);
      context.lineTo(-19, -7);
      context.closePath();
      context.fill();
      context.fillStyle = character.color;
      context.beginPath();
      context.arc(0, -65, 28, 0, TAU);
      context.fill();
      context.save();
      context.rotate(-0.25 + Math.sin(time * 3) * 0.03);
      context.beginPath();
      context.ellipse(-28, -69, 13, 26, -0.35, 0, TAU);
      context.fill();
      context.restore();
      context.save();
      context.rotate(0.25 - Math.sin(time * 3) * 0.03);
      context.beginPath();
      context.ellipse(28, -69, 13, 26, 0.35, 0, TAU);
      context.fill();
      context.restore();
      context.fillStyle = "#f0d2a2";
      context.beginPath();
      context.ellipse(9, -57, 19, 13, 0, 0, TAU);
      context.fill();
      this.drawCharacterFace(context, "#29313a", 1);
      context.fillStyle = "#3e3027";
      context.beginPath();
      context.arc(16, -60, 4.5, 0, TAU);
      context.fill();
      context.strokeStyle = "#f2e5c8";
      context.lineWidth = 7;
      context.lineCap = "round";
      context.beginPath();
      context.moveTo(22, -27);
      context.lineTo(51, -44);
      context.stroke();
      context.fillStyle = "#f2e5c8";
      [45, 55].forEach(x => {
        context.beginPath();
        context.arc(x, -49, 6, 0, TAU);
        context.arc(x, -39, 6, 0, TAU);
        context.fill();
      });
      this.drawCharacterLegs(context, "#59687c");
    }

    drawLiteFace(context, eyeColor, muzzleColor, noseColor = "#3b3030") {
      context.fillStyle = muzzleColor;
      context.beginPath();
      context.ellipse(7, -56, 16, 11, 0, 0, TAU);
      context.fill();
      context.fillStyle = eyeColor;
      context.beginPath();
      context.arc(-9, -66, 3.5, 0, TAU);
      context.arc(10, -66, 3.5, 0, TAU);
      context.fill();
      context.fillStyle = noseColor;
      context.beginPath();
      context.arc(14, -57, 3.5, 0, TAU);
      context.fill();
    }

    drawLiteCat(context, character, time) {
      // 午夜游俠：斗篷與不對稱面罩，強調高速刺客剪影。
      context.fillStyle = "#222a49";
      context.beginPath();
      context.moveTo(-27, -47);
      context.quadraticCurveTo(-35, -12, -22, 2);
      context.lineTo(27, 2);
      context.quadraticCurveTo(34, -20, 22, -47);
      context.closePath();
      context.fill();
      context.fillStyle = character.color;
      context.beginPath();
      context.arc(0, -65, 27, 0, TAU);
      context.moveTo(-22, -82);
      context.lineTo(-15, -103);
      context.lineTo(-4, -85);
      context.moveTo(22, -82);
      context.lineTo(15, -103);
      context.lineTo(4, -85);
      context.fill();
      context.fillStyle = "#343d68";
      context.beginPath();
      context.arc(0, -71, 25, Math.PI, TAU);
      context.lineTo(23, -60);
      context.lineTo(-23, -60);
      context.closePath();
      context.fill();
      this.drawLiteFace(context, "#fff1a8", "#f7bd78");
      context.strokeStyle = "#1f2946";
      context.lineWidth = 7;
      context.lineCap = "round";
      context.beginPath();
      context.moveTo(-21, -24);
      context.quadraticCurveTo(-48, -22, -43 + Math.sin(time * 3) * 3, -48);
      context.stroke();
      this.drawCharacterLegs(context, "#202742");
    }

    drawLiteRabbit(context, character, time) {
      // 原野斥候：短斗篷、護目鏡與高耳朵，對應遠程連射。
      context.fillStyle = "#557765";
      context.beginPath();
      context.moveTo(-25, -45);
      context.lineTo(25, -45);
      context.lineTo(20, 1);
      context.lineTo(-20, 1);
      context.closePath();
      context.fill();
      context.fillStyle = character.color;
      [-12, 12].forEach((x, index) => {
        context.beginPath();
        context.ellipse(x, -105 + Math.sin(time * 2 + index) * 2, 8, 29, index ? 0.08 : -0.08, 0, TAU);
        context.fill();
      });
      context.beginPath();
      context.arc(0, -65, 27, 0, TAU);
      context.fill();
      context.strokeStyle = "#3e5961";
      context.lineWidth = 5;
      context.beginPath();
      context.moveTo(-22, -72);
      context.lineTo(22, -72);
      context.stroke();
      context.fillStyle = "#9cd7df";
      context.beginPath();
      context.ellipse(-9, -72, 7, 5, 0, 0, TAU);
      context.ellipse(9, -72, 7, 5, 0, 0, TAU);
      context.fill();
      this.drawLiteFace(context, "#33424b", "#fff8e9", "#ec8e8e");
      this.drawCharacterLegs(context, "#486557");
    }

    drawLiteHippo(context, character) {
      // 河川守衛：寬重水甲與圓盾，剪影明顯且只用純色塊。
      context.fillStyle = "#315a6b";
      context.beginPath();
      context.ellipse(0, -28, 35, 35, 0, 0, TAU);
      context.fill();
      context.fillStyle = character.color;
      context.beginPath();
      context.ellipse(0, -70, 35, 28, 0, 0, TAU);
      context.arc(-26, -88, 9, 0, TAU);
      context.arc(26, -88, 9, 0, TAU);
      context.fill();
      context.fillStyle = "#9fd0d9";
      context.beginPath();
      context.ellipse(10, -60, 25, 13, 0, 0, TAU);
      context.fill();
      this.drawLiteFace(context, "#203944", "#9fd0d9", "#416776");
      context.fillStyle = "#244b5c";
      context.beginPath();
      context.arc(-31, -29, 23, 0, TAU);
      context.fill();
      context.strokeStyle = character.accent;
      context.lineWidth = 4;
      context.beginPath();
      context.arc(-31, -29, 16, 0, TAU);
      context.stroke();
      this.drawCharacterLegs(context, "#294d5b", 1.2);
    }

    drawLiteDeer(context, character) {
      // 星森術士：葉片披肩與簡化枝角，呈現法師而非舊式武者。
      context.fillStyle = "#365c49";
      context.beginPath();
      context.moveTo(0, -49);
      context.lineTo(29, -32);
      context.lineTo(18, 2);
      context.lineTo(-20, 2);
      context.lineTo(-29, -32);
      context.closePath();
      context.fill();
      context.fillStyle = character.color;
      context.beginPath();
      context.arc(0, -65, 26, 0, TAU);
      context.fill();
      context.strokeStyle = "#6c4c36";
      context.lineWidth = 5;
      context.lineCap = "round";
      [-1, 1].forEach(side => {
        context.beginPath();
        context.moveTo(side * 10, -84);
        context.lineTo(side * 18, -108);
        context.lineTo(side * 29, -115);
        context.moveTo(side * 17, -101);
        context.lineTo(side * 30, -98);
        context.stroke();
      });
      this.drawLiteFace(context, "#24392d", "#efd1a9", "#4f382d");
      context.fillStyle = character.accent;
      context.beginPath();
      context.moveTo(-28, -42);
      context.lineTo(-10, -48);
      context.lineTo(-17, -32);
      context.moveTo(28, -42);
      context.lineTo(10, -48);
      context.lineTo(17, -32);
      context.fill();
      this.drawCharacterLegs(context, "#304f40");
    }

    drawLiteDog(context, character, time) {
      // 旅團馴獸師：亮色領巾、側背包與垂耳，強調親和支援定位。
      context.fillStyle = "#466683";
      context.beginPath();
      context.ellipse(0, -28, 26, 31, 0, 0, TAU);
      context.fill();
      context.fillStyle = character.color;
      context.beginPath();
      context.arc(0, -65, 27, 0, TAU);
      context.ellipse(-28, -66, 11, 24, -0.3 + Math.sin(time * 2) * 0.02, 0, TAU);
      context.ellipse(28, -66, 11, 24, 0.3 - Math.sin(time * 2) * 0.02, 0, TAU);
      context.fill();
      this.drawLiteFace(context, "#29333c", "#f2d39d", "#49372c");
      context.fillStyle = "#efc34f";
      context.beginPath();
      context.moveTo(-24, -47);
      context.lineTo(25, -47);
      context.lineTo(15, -36);
      context.lineTo(-16, -36);
      context.closePath();
      context.fill();
      context.fillStyle = "#8a593b";
      this.roundRectPath(context, -32, -22, 17, 22, 5);
      context.fill();
      this.drawCharacterLegs(context, "#3e5d78");
    }

    drawLiteCharacterWeapon(context, characterId, character, motion, time) {
      const attack = clamp(motion.attackProgress || 0, 0, 1);
      const swing = attack > 0 ? Math.sin(attack * Math.PI) * 0.9 : 0;
      context.save();
      context.translate(20, -31);
      context.rotate(-0.35 + swing);
      context.lineCap = "round";
      if (characterId === "cat") {
        context.strokeStyle = "#f8d36f";
        context.lineWidth = 7;
        context.beginPath();
        context.moveTo(0, 0);
        context.quadraticCurveTo(34, -13, 53, -3);
        context.stroke();
      } else if (characterId === "rabbit") {
        context.strokeStyle = "#745039";
        context.lineWidth = 6;
        context.beginPath();
        context.moveTo(0, 0);
        context.lineTo(43, 0);
        context.moveTo(32, -13);
        context.lineTo(32, 13);
        context.stroke();
      } else if (characterId === "hippo") {
        context.strokeStyle = "#654731";
        context.lineWidth = 9;
        context.beginPath();
        context.moveTo(0, 0);
        context.lineTo(39, 0);
        context.stroke();
        context.fillStyle = "#6f8992";
        this.roundRectPath(context, 34, -16, 25, 32, 6);
        context.fill();
      } else if (characterId === "deer") {
        context.strokeStyle = "#6b4d31";
        context.lineWidth = 6;
        context.beginPath();
        context.moveTo(0, 7);
        context.lineTo(48, -5);
        context.stroke();
        context.fillStyle = character.accent;
        context.beginPath();
        context.arc(52, -7, 7, 0, TAU);
        context.fill();
      } else {
        context.strokeStyle = "#f4e4bd";
        context.lineWidth = 7;
        context.beginPath();
        context.moveTo(0, 0);
        context.lineTo(43, 0);
        context.stroke();
        context.beginPath();
        context.arc(43, -5, 5, 0, TAU);
        context.arc(43, 5, 5, 0, TAU);
        context.fillStyle = "#f4e4bd";
        context.fill();
      }
      context.restore();
    }

    drawCharacterLegs(context, color, widthScale = 1) {
      const motion = this.characterMotion || { moveAmount: 0, cycle: 0, airborne: false };
      const stride = Math.sin(motion.cycle || 0) * 0.42 * (motion.moveAmount || 0);
      const lift = Math.abs(Math.cos(motion.cycle || 0)) * 4 * (motion.moveAmount || 0);
      const airborneLift = motion.airborne ? 5 : 0;
      context.fillStyle = color;
      [-1, 1].forEach((side, index) => {
        context.save();
        context.translate(side * 12 * widthScale, -10 - airborneLift - (index === 0 ? lift : 4 - lift));
        context.rotate(side * stride);
        this.roundRectPath(context, -7.5 * widthScale, -3, 15 * widthScale, 20, 5);
        context.fill();
        context.fillStyle = "rgba(255,255,255,.11)";
        this.roundRectPath(context, -5.5 * widthScale, -1, 4 * widthScale, 12, 3);
        context.fill();
        context.restore();
        context.fillStyle = color;
      });
    }

    drawParticles(context) {
      for (const particle of this.particles) {
        const ratio = clamp(particle.life / Math.max(0.001, particle.maxLife || particle.life), 0, 1);
        context.save();
        context.globalAlpha = ratio;
        context.translate(particle.x, particle.y);
        if (particle.ring) {
          const amount = 1 - ratio;
          const radius = lerp(particle.radius, particle.targetRadius, amount);
          context.strokeStyle = particle.color;
          context.lineWidth = 4 * ratio + 1;
          context.beginPath();
          context.ellipse(0, 0, radius, radius * 0.34, 0, 0, TAU);
          context.stroke();
        } else if (particle.slash) {
          context.strokeStyle = particle.color;
          context.lineWidth = 8 * ratio;
          context.lineCap = "round";
          context.beginPath();
          context.arc(0, 0, particle.radius, particle.angle - 0.65, particle.angle + 0.65);
          context.stroke();
        } else {
          context.fillStyle = particle.color;
          context.beginPath();
          context.arc(0, 0, Math.max(0.5, particle.radius * ratio), 0, TAU);
          context.fill();
        }
        context.restore();
      }
    }

    drawDamageTexts(context) {
      for (const text of this.damageTexts) {
        const ratio = clamp(text.life / text.maxLife, 0, 1);
        context.save();
        context.globalAlpha = ratio;
        context.font = `${text.critical ? 800 : 700} ${text.critical ? 24 : 17}px system-ui, sans-serif`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.lineWidth = 4;
        context.strokeStyle = "rgba(13,20,27,.78)";
        context.strokeText(text.text, text.x, text.y);
        context.fillStyle = text.color;
        context.fillText(text.text, text.x, text.y);
        context.restore();
      }
    }

    drawBossBar(context) {
      const boss = this.enemies.find(enemy => enemy.isBoss && !enemy.dead);
      if (!boss || this.mode !== "stage") return;
      const width = 560;
      const x = (this.canvas.width - width) / 2;
      const y = 88;
      context.save();
      context.fillStyle = "rgba(7,15,24,.82)";
      this.roundRectPath(context, x - 14, y - 31, width + 28, 58, 13);
      context.fill();
      context.strokeStyle = "rgba(226,245,255,.22)";
      context.lineWidth = 2;
      context.stroke();
      context.fillStyle = "#f5f2e7";
      context.font = "800 18px system-ui, sans-serif";
      context.textAlign = "center";
      context.fillText(boss.name, this.canvas.width / 2, y - 8);
      context.fillStyle = "rgba(255,255,255,.12)";
      this.roundRectPath(context, x, y + 3, width, 13, 7);
      context.fill();
      const ratio = clamp(boss.hp / boss.maxHp, 0, 1);
      const gradient = context.createLinearGradient(x, 0, x + width, 0);
      gradient.addColorStop(0, boss.dataId === "whiteFox" ? "#6fd2df" : "#4abecb");
      gradient.addColorStop(1, "#ed6784");
      context.fillStyle = gradient;
      this.roundRectPath(context, x, y + 3, width * ratio, 13, 7);
      context.fill();
      context.restore();
    }

    drawStageAtmosphere(context, time) {
      if (this.world.chapter !== 2) return;
      context.save();
      context.globalAlpha = 0.1;
      context.fillStyle = "#d5ffe0";
      for (let index = 0; index < 6; index += 1) {
        const x = (index * 97 + time * (8 + index % 5)) % (this.canvas.width + 40) - 20;
        const y = 120 + (index * 61 % 500) + Math.sin(time * 0.8 + index) * 18;
        context.beginPath();
        context.arc(x, y, 1.5 + index % 3, 0, TAU);
        context.fill();
      }
      context.restore();
    }

    roundRectPath(context, x, y, width, height, radius = 8) {
      const safeRadius = Math.min(Math.max(0, radius), Math.abs(width) / 2, Math.abs(height) / 2);
      context.beginPath();
      context.moveTo(x + safeRadius, y);
      context.lineTo(x + width - safeRadius, y);
      context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
      context.lineTo(x + width, y + height - safeRadius);
      context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
      context.lineTo(x + safeRadius, y + height);
      context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
      context.lineTo(x, y + safeRadius);
      context.quadraticCurveTo(x, y, x + safeRadius, y);
      context.closePath();
    }
  }

  window.initPlatformGame = function initPlatformGame() {
    window.cleanupPlatformGame?.();
    const root = document.getElementById("platformGameRoot");
    if (!root) return;
    activePlatformGame = new TYYRogueGame(root);
    window.__tyyPlatformGame = activePlatformGame;
    activePlatformGame.init();
  };

  window.cleanupPlatformGame = function cleanupPlatformGame() {
    if (activePlatformGame) {
      activePlatformGame.destroy();
      activePlatformGame = null;
      window.__tyyPlatformGame = null;
    }
  };
})();
