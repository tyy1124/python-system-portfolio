(function () {
  "use strict";

  const t = (zh, en) => ({ "zh-TW": zh, en });

  const characters = {
    cat: {
      id: "cat",
      order: 1,
      name: t("小貓", "Cat"),
      role: t("刺客／近戰爆發", "Assassin / Melee Burst"),
      tagline: t("高速、爆擊、短暫無敵", "Speed, critical hits, brief invulnerability"),
      description: t(
        "以爪刃快速貼近敵人，依靠爆擊與位移在怪群中穿梭。生命較低，但能用九命護身避開致命傷害。",
        "A fast claw-blade fighter who darts through enemies with critical hits and mobility. Low health, but Nine Lives can prevent fatal damage."
      ),
      color: "#f49b48",
      accent: "#ffd06b",
      stats: {
        maxHp: 92,
        damage: 16,
        moveSpeed: 300,
        attackRate: 2.35,
        critChance: 0.15,
        critDamage: 1.75,
        blockChance: 0,
        armor: 2,
        cooldownRate: 1.08,
        skillPower: 1.0
      },
      growth: {
        maxHp: 3,
        damage: 1.25,
        moveSpeed: 1.2,
        attackRate: 0.012,
        critChance: 0.0025
      },
      talent: {
        name: t("獵手直覺", "Hunter's Instinct"),
        description: t(
          "基礎爆擊率 +15%。爆擊擊倒敵人時，所有技能冷卻縮短 0.4 秒。",
          "+15% base critical chance. Critical kills reduce all skill cooldowns by 0.4 seconds."
        )
      },
      attack: {
        name: t("月牙爪刃", "Crescent Claw"),
        description: t("向準心方向揮出短距離弧形斬擊。", "Swing a short crescent slash toward the cursor."),
        type: "melee",
        range: 92,
        arc: 1.1,
        damageMultiplier: 1
      },
      skills: {
        secondary: {
          key: "RMB",
          icon: "➤",
          name: t("獵影突襲", "Shadow Pounce"),
          description: t("朝準心突進並斬擊路徑上的敵人。", "Dash toward the cursor and slash enemies in the path."),
          cooldown: 6.2
        },
        q: {
          key: "Q",
          icon: "✦",
          name: t("三連影爪", "Triple Shadow Claw"),
          description: t("連續揮出三道擴散爪波。", "Release three spreading claw waves."),
          cooldown: 15
        },
        e: {
          key: "E",
          icon: "⑨",
          name: t("九命護身", "Nine Lives"),
          description: t("獲得護盾與 1.2 秒無敵，期間移動速度提升。", "Gain a shield and 1.2 seconds of invulnerability with bonus speed."),
          cooldown: 21
        },
        r: {
          key: "R",
          icon: "☾",
          name: t("午夜狩獵", "Midnight Hunt"),
          description: t("8 秒內大幅提升攻速、爆擊率與移動速度。", "Greatly increase attack speed, critical chance and movement for 8 seconds."),
          cooldown: 32
        }
      }
    },

    rabbit: {
      id: "rabbit",
      order: 2,
      name: t("小兔", "Rabbit"),
      role: t("弓箭手／遠程連射", "Ranger / Rapid Fire"),
      tagline: t("遠距、攻速、範圍壓制", "Range, attack speed, area pressure"),
      description: t(
        "以胡蘿蔔弩進行遠距離攻擊，擅長快速射擊與大範圍彈幕。生命普通，保持距離時輸出非常穩定。",
        "Uses a carrot crossbow for ranged combat and wide projectile barrages. Average health, but highly reliable damage at range."
      ),
      color: "#f3eee1",
      accent: "#ff9f6e",
      stats: {
        maxHp: 104,
        damage: 13,
        moveSpeed: 278,
        attackRate: 1.95,
        critChance: 0.09,
        critDamage: 1.65,
        blockChance: 0.03,
        armor: 3,
        cooldownRate: 1.03,
        skillPower: 1.0
      },
      growth: {
        maxHp: 4,
        damage: 1.05,
        moveSpeed: 1.0,
        attackRate: 0.016,
        critChance: 0.0015
      },
      talent: {
        name: t("敏捷長耳", "Quick Ears"),
        description: t(
          "普通攻擊速度 +12%。連續命中同一目標時，第 5 發額外造成 70% 傷害。",
          "+12% basic attack speed. Every fifth consecutive hit on the same target deals 70% bonus damage."
        )
      },
      attack: {
        name: t("胡蘿蔔弩箭", "Carrot Bolt"),
        description: t("朝準心射出高速胡蘿蔔。", "Fire a fast carrot bolt toward the cursor."),
        type: "projectile",
        projectileSpeed: 760,
        damageMultiplier: 1
      },
      skills: {
        secondary: {
          key: "RMB",
          icon: "≋",
          name: t("三向胡蘿蔔", "Triple Carrot"),
          description: t("同時射出三發扇形胡蘿蔔。", "Fire three carrots in a fan."),
          cooldown: 7
        },
        q: {
          key: "Q",
          icon: "☄",
          name: t("胡蘿蔔雨", "Carrot Rain"),
          description: t("在準心區域降下密集胡蘿蔔。", "Rain carrots over the target area."),
          cooldown: 17
        },
        e: {
          key: "E",
          icon: "⇢",
          name: t("地洞躍進", "Burrow Leap"),
          description: t("鑽入地面快速位移，短暫不受傷害。", "Burrow forward quickly and become briefly invulnerable."),
          cooldown: 18
        },
        r: {
          key: "R",
          icon: "☽",
          name: t("月兔彈幕", "Moon Rabbit Barrage"),
          description: t("連續發射追蹤胡蘿蔔，優先鎖定附近敵人。", "Launch a sustained barrage of homing carrots."),
          cooldown: 34
        }
      }
    },

    hippo: {
      id: "hippo",
      order: 3,
      name: t("小河馬", "Hippo"),
      role: t("坦克／控制防護", "Tank / Control"),
      tagline: t("高血量、格擋、群體控制", "High health, blocking, crowd control"),
      description: t(
        "以沉重木槌與水盾正面迎戰。移動較慢，但生命、護盾與格擋能力最高，適合安全地吸收傷害。",
        "Fights head-on with a heavy mallet and water shield. Slow, but has the strongest health, shielding and blocking."
      ),
      color: "#7eb5c9",
      accent: "#88e0dc",
      stats: {
        maxHp: 176,
        damage: 12,
        moveSpeed: 212,
        attackRate: 1.38,
        critChance: 0.05,
        critDamage: 1.55,
        blockChance: 0.2,
        armor: 10,
        cooldownRate: 0.96,
        skillPower: 1.05
      },
      growth: {
        maxHp: 8,
        damage: 0.9,
        moveSpeed: 0.5,
        attackRate: 0.008,
        critChance: 0.0008
      },
      talent: {
        name: t("厚皮水盾", "Thick Water Hide"),
        description: t(
          "20% 機率格擋一次傷害，所有護盾效果 +50%。格擋後 2 秒內傷害 +12%。",
          "20% chance to block damage and +50% shield strength. Blocking grants +12% damage for 2 seconds."
        )
      },
      attack: {
        name: t("河岸重槌", "Riverbank Mallet"),
        description: t("向前揮擊木槌，擊退小型敵人。", "Swing a mallet forward and knock back small enemies."),
        type: "melee",
        range: 105,
        arc: 1.35,
        damageMultiplier: 1.08
      },
      skills: {
        secondary: {
          key: "RMB",
          icon: "▰",
          name: t("水盾衝撞", "Water Shield Charge"),
          description: t("舉盾向前衝撞並推開敵人。", "Charge forward behind a water shield and push enemies away."),
          cooldown: 8.5
        },
        q: {
          key: "Q",
          icon: "✹",
          name: t("震地波", "Ground Quake"),
          description: t("重擊地面，對周圍敵人造成傷害與暈眩。", "Slam the ground, damaging and stunning nearby enemies."),
          cooldown: 18
        },
        e: {
          key: "E",
          icon: "⬡",
          name: t("守護水域", "Guardian Pool"),
          description: t("取得大量護盾，並降低附近敵人的速度。", "Gain a large shield and slow nearby enemies."),
          cooldown: 23
        },
        r: {
          key: "R",
          icon: "♜",
          name: t("河川堡壘", "River Fortress"),
          description: t("10 秒內大幅減傷、持續震退敵人並回復生命。", "For 10 seconds, gain heavy damage reduction, pulse knockback and regeneration."),
          cooldown: 39
        }
      }
    },

    deer: {
      id: "deer",
      order: 4,
      name: t("小鹿", "Deer"),
      role: t("法師／範圍術法", "Mage / Area Magic"),
      tagline: t("技能傷害、穿透、區域控制", "Skill damage, piercing, zone control"),
      description: t(
        "操縱葉刃、荊棘與星光。普通攻擊節奏較慢，但技能傷害高，能在大範圍內快速清除怪群。",
        "Controls leaves, thorns and starlight. Slower basic attacks, but powerful spells can clear large groups."
      ),
      color: "#b88555",
      accent: "#8edf8f",
      stats: {
        maxHp: 98,
        damage: 18,
        moveSpeed: 248,
        attackRate: 1.5,
        critChance: 0.07,
        critDamage: 1.6,
        blockChance: 0,
        armor: 2,
        cooldownRate: 1.0,
        skillPower: 1.25
      },
      growth: {
        maxHp: 3.5,
        damage: 1.4,
        moveSpeed: 0.8,
        attackRate: 0.008,
        critChance: 0.0012
      },
      talent: {
        name: t("森林共鳴", "Forest Resonance"),
        description: t(
          "技能傷害 +25%。技能命中 4 名以上敵人時，回復 4% 最大生命。每次技能最多觸發一次。",
          "+25% skill damage. Hitting 4 or more enemies with a skill restores 4% max health, once per cast."
        )
      },
      attack: {
        name: t("穿葉靈彈", "Piercing Leaf"),
        description: t("射出可穿透一名敵人的葉刃。", "Fire a leaf blade that pierces one enemy."),
        type: "projectile",
        projectileSpeed: 650,
        damageMultiplier: 1.05,
        pierce: 1
      },
      skills: {
        secondary: {
          key: "RMB",
          icon: "│",
          name: t("荊棘長槍", "Thorn Lance"),
          description: t("沿直線刺出長距離荊棘。", "Launch a long line of piercing thorns."),
          cooldown: 6.8
        },
        q: {
          key: "Q",
          icon: "✿",
          name: t("森靈法陣", "Forest Circle"),
          description: t("在準心位置生成持續傷害與緩速區域。", "Create a damaging slowing field at the cursor."),
          cooldown: 17.5
        },
        e: {
          key: "E",
          icon: "♧",
          name: t("靈鹿踏風", "Spirit Step"),
          description: t("瞬移一段距離並留下爆裂葉片。", "Blink forward and leave exploding leaves behind."),
          cooldown: 20
        },
        r: {
          key: "R",
          icon: "✧",
          name: t("星森降臨", "Starwood Descent"),
          description: t("召喚多波星光隕落，轟擊大範圍敵人。", "Call down repeated waves of starlight over a wide area."),
          cooldown: 36
        }
      }
    },

    dog: {
      id: "dog",
      order: 5,
      name: t("小狗", "Dog"),
      role: t("召喚師／支援續戰", "Summoner / Sustain"),
      tagline: t("夥伴、自動攻擊、治療", "Companions, automatic attacks, healing"),
      description: t(
        "使用骨頭迴力鏢，並召喚小犬夥伴協同攻擊。傷害平穩、續戰能力優秀，適合第一次遊玩。",
        "Throws a bone boomerang and summons pups to fight. Reliable damage and strong sustain make this a beginner-friendly choice."
      ),
      color: "#d9a65f",
      accent: "#ffe18a",
      stats: {
        maxHp: 122,
        damage: 13,
        moveSpeed: 258,
        attackRate: 1.75,
        critChance: 0.08,
        critDamage: 1.6,
        blockChance: 0.05,
        armor: 5,
        cooldownRate: 1.0,
        skillPower: 1.05
      },
      growth: {
        maxHp: 5,
        damage: 1.0,
        moveSpeed: 0.8,
        attackRate: 0.011,
        critChance: 0.0015
      },
      talent: {
        name: t("忠誠夥伴", "Loyal Companion"),
        description: t(
          "初始擁有一隻自動攻擊的小犬。召喚物傷害 +25%，每 8 次召喚物命中回復 2% 最大生命。",
          "Start with an auto-attacking pup. Summons deal +25% damage, and every 8 summon hits restore 2% max health."
        )
      },
      attack: {
        name: t("骨頭迴力鏢", "Bone Boomerang"),
        description: t("丟出會返回身邊的骨頭，可命中去回兩次。", "Throw a bone that returns and can hit on both paths."),
        type: "boomerang",
        projectileSpeed: 560,
        damageMultiplier: 0.92
      },
      skills: {
        secondary: {
          key: "RMB",
          icon: "♫",
          name: t("夥伴口哨", "Pup Whistle"),
          description: t("暫時召喚一隻額外小犬協助戰鬥。", "Temporarily summon an additional pup."),
          cooldown: 8
        },
        q: {
          key: "Q",
          icon: "➠",
          name: t("犬群衝鋒", "Pack Charge"),
          description: t("召喚犬群沿直線奔馳並擊退敵人。", "Send a pack charging in a line and knock enemies back."),
          cooldown: 18
        },
        e: {
          key: "E",
          icon: "♥",
          name: t("救援本能", "Rescue Instinct"),
          description: t("立即治療並獲得短暫護盾。", "Heal immediately and gain a temporary shield."),
          cooldown: 24
        },
        r: {
          key: "R",
          icon: "♞",
          name: t("忠犬大集結", "Loyal Pack"),
          description: t("召喚三隻強化獵犬，持續追擊敵人。", "Summon three empowered hounds that relentlessly hunt enemies."),
          cooldown: 40
        }
      }
    }
  };

  const items = {
    butterflyKnife: {
      id: "butterflyKnife",
      icon: "🗡",
      iconId: "butterflyKnife",
      color: "#bc8cff",
      stackable: true,
      maxLevel: null,
      name: t("蝴蝶短刀", "Butterfly Knife"),
      description: t("普通攻擊時有機率額外射出短刀；堆疊後可同時射出更多把。", "Basic attacks may throw extra knives; high stacks can throw multiple knives."),
      effectText: count => {
        const chance = Math.min(80, 12 + (count - 1) * 3.5).toFixed(1).replace(".0", "");
        const damage = Math.round(55 + (count - 1) * 6);
        const knives = Math.min(4, 1 + Math.floor((count - 1) / 8));
        return t(`觸發率 ${chance}%，射出 ${knives} 把短刀，各造成 ${damage}% 普攻傷害。`, `${chance}% chance to throw ${knives} knife(s), each dealing ${damage}% basic attack damage.`);
      }
    },
    miraclePill: {
      id: "miraclePill",
      icon: "●",
      iconId: "miraclePill",
      color: "#ff8a57",
      stackable: true,
      maxLevel: null,
      name: t("神奇藥丸", "Miracle Pill"),
      description: t("提高普通攻擊速度，可無限堆疊。", "Increase basic attack speed and stack without an item-count cap."),
      effectText: count => t(`攻擊速度累計 +${count * 8}%。`, `Total attack speed +${count * 8}%.`)
    },
    nail: {
      id: "nail",
      icon: "⌁",
      iconId: "nail",
      color: "#d6c4a3",
      stackable: true,
      maxLevel: null,
      name: t("釘子", "Nail"),
      description: t("普通攻擊有機率使敵人流血。", "Basic attacks may inflict bleeding."),
      effectText: count => {
        const chance = Math.min(65, 10 + (count - 1) * 3);
        const damage = 70 + (count - 1) * 15;
        return t(`${chance}% 機率流血 3 秒，每秒造成 ${damage}% 普攻傷害。`, `${chance}% chance to bleed for 3 seconds, dealing ${damage}% basic attack damage per second.`);
      }
    },
    bountyBelt: {
      id: "bountyBelt",
      icon: "＄",
      iconId: "bountyBelt",
      color: "#f2c85f",
      stackable: true,
      maxLevel: null,
      name: t("賞金腰帶", "Bounty Belt"),
      description: t("增加擊倒敵人與關卡獲得的金幣。", "Increase gold gained from enemies and stages."),
      effectText: count => t(`金幣獲取累計 +${count * 4}%。`, `Total gold gain +${count * 4}%.`)
    },
    sneakers: {
      id: "sneakers",
      icon: "➟",
      iconId: "sneakers",
      color: "#67c9ff",
      stackable: true,
      maxLevel: null,
      name: t("球鞋", "Sneakers"),
      description: t("提高移動速度；道具可無限堆疊，但角色實際移動速度有上限。", "Increase movement speed. Stacks are unlimited, while effective character speed has a cap."),
      effectText: count => t(`移動速度累計 +${count * 6}%（實際上限 ${520}）。`, `Total movement speed +${count * 6}% (effective cap ${520}).`)
    },
    bloodBottle: {
      id: "bloodBottle",
      icon: "♥",
      iconId: "bloodBottle",
      color: "#ef6666",
      stackable: true,
      maxLevel: null,
      name: t("血瓶", "Blood Bottle"),
      description: t("提高最大生命並立即補充增加的生命。", "Increase max health and immediately fill the added health."),
      effectText: count => t(`最大生命累計 +${count * 16}。`, `Total max health +${count * 16}.`)
    },
    redHeadband: {
      id: "redHeadband",
      icon: "✹",
      iconId: "redHeadband",
      color: "#ff5d68",
      stackable: true,
      maxLevel: null,
      name: t("紅色戰鬥頭巾", "Red Battle Headband"),
      description: t("提高爆擊率；超過 100% 的爆擊率會轉化為額外爆擊傷害。", "Increase critical chance. Critical chance above 100% converts into bonus critical damage."),
      effectText: count => t(`爆擊率累計 +${count * 6}%；溢出部分 1:1 轉為爆擊傷害。`, `Total critical chance +${count * 6}%; overflow converts 1:1 into critical damage.`)
    },
    heavyWatch: {
      id: "heavyWatch",
      icon: "◷",
      iconId: "heavyWatch",
      color: "#8893a6",
      stackable: true,
      maxLevel: null,
      name: t("沉重手錶", "Heavy Watch"),
      description: t("提高技能傷害，但普通攻擊速度會受到最多 35% 的懲罰。", "Increase skill damage, with a basic attack speed penalty capped at 35%."),
      effectText: count => t(`技能傷害累計 +${count * 8}%，攻速懲罰 ${Math.min(35, count * 2)}%。`, `Total skill damage +${count * 8}%, attack-speed penalty ${Math.min(35, count * 2)}%.`)
    },
    wisdomStaff: {
      id: "wisdomStaff",
      icon: "❄",
      iconId: "wisdomStaff",
      color: "#8ad9ff",
      stackable: true,
      maxLevel: null,
      name: t("智慧之杖", "Wisdom Staff"),
      description: t("定時朝最近敵人射出冰塊。", "Periodically fire an ice shard at the nearest enemy."),
      effectText: count => {
        const interval = Math.max(0.45, 2 - (count - 1) * 0.09).toFixed(2).replace(/0$/, "");
        const damage = 45 + (count - 1) * 10;
        return t(`每 ${interval} 秒射出冰塊，造成 ${damage}% 普攻傷害。`, `Fire every ${interval}s for ${damage}% basic attack damage.`);
      }
    },
    snowball: {
      id: "snowball",
      icon: "●",
      iconId: "snowball",
      color: "#dff6ff",
      stackable: true,
      maxLevel: null,
      name: t("雪球", "Snowball"),
      description: t("普通攻擊有機率額外丟出雪球並緩速；高堆疊會增加雪球數量。", "Basic attacks may throw slowing snowballs; high stacks add projectiles."),
      effectText: count => {
        const chance = Math.min(75, 25 + (count - 1) * 2.5).toFixed(1).replace(".0", "");
        const damage = 40 + (count - 1) * 8;
        const balls = Math.min(3, 1 + Math.floor((count - 1) / 10));
        return t(`${chance}% 機率丟出 ${balls} 顆雪球，各造成 ${damage}% 普攻傷害並緩速。`, `${chance}% chance to throw ${balls} snowball(s), each dealing ${damage}% basic attack damage and slowing.`);
      }
    }
  };

  const enemies = {
    grassSpider: {
      id: "grassSpider",
      chapter: 1,
      name: t("草原蜘蛛", "Grass Spider"),
      description: t("沿地面快速靠近，以短距離噴射毒液。", "Scuttles along the ground and spits venom at short range."),
      ai: "spider",
      color: "#5b3d2d",
      accent: "#d5a34d",
      base: { hp: 5, attack: 2, speed: 145, xp: 4, gold: 2, radius: 22, cooldown: 1.2 }
    },
    caterpillar: {
      id: "caterpillar",
      chapter: 1,
      name: t("史萊姆毛蟲", "Moss Caterpillar"),
      description: t("動作緩慢但生命較高，接觸時造成傷害。", "Slow but sturdy, dealing contact damage."),
      ai: "crawler",
      color: "#81b94b",
      accent: "#d8ef6c",
      base: { hp: 9, attack: 3, speed: 75, xp: 5, gold: 2, radius: 25, cooldown: 1.3 }
    },
    poisonCaterpillar: {
      id: "poisonCaterpillar",
      chapter: 1,
      name: t("毒史萊姆毛蟲", "Toxic Caterpillar"),
      description: t("會定時吐出毒球，死亡時留下短暫毒霧。", "Spits poison globes and leaves a cloud on death."),
      ai: "ranged",
      color: "#9653a6",
      accent: "#75d067",
      base: { hp: 8, attack: 4, speed: 65, xp: 7, gold: 3, radius: 25, cooldown: 2.2 }
    },
    skyMoth: {
      id: "skyMoth",
      chapter: 1,
      name: t("飛天史萊姆毛蟲", "Sky Moth Larva"),
      description: t("在空中繞行並俯衝攻擊。", "Circles in the air and dives at the player."),
      ai: "flying",
      color: "#8a93a8",
      accent: "#d9d6ff",
      base: { hp: 7, attack: 4, speed: 125, xp: 6, gold: 3, radius: 23, cooldown: 1.8 }
    },
    stoneMimic: {
      id: "stoneMimic",
      chapter: 1,
      name: t("巨石怪", "Stone Mimic"),
      description: t("偽裝成石頭，靠近後跳起砸向玩家。", "Disguises as a rock and leaps to crush nearby players."),
      ai: "mimic",
      color: "#6c7480",
      accent: "#d7d9d8",
      base: { hp: 20, attack: 7, speed: 55, xp: 12, gold: 5, radius: 31, cooldown: 2.6 }
    },
    hornBeetle: {
      id: "hornBeetle",
      chapter: 1,
      name: t("衝角甲蟲", "Horn Beetle"),
      description: t("蓄力後沿直線高速衝刺。", "Charges in a straight line after a short windup."),
      ai: "charger",
      color: "#244f48",
      accent: "#84d45d",
      base: { hp: 13, attack: 6, speed: 100, xp: 9, gold: 4, radius: 27, cooldown: 2.4 }
    },
    leechSwarm: {
      id: "leechSwarm",
      chapter: 2,
      name: t("吸血蟲群", "Leech Swarm"),
      description: t("成群出現，黏住目標並吸取生命。", "Appears in swarms, clinging to drain health."),
      ai: "swarm",
      color: "#8e2e45",
      accent: "#f36d76",
      base: { hp: 5, attack: 4, speed: 155, xp: 5, gold: 2, radius: 17, cooldown: 0.9 }
    },
    marshSlime: {
      id: "marshSlime",
      chapter: 2,
      name: t("沼澤黏液", "Marsh Slime"),
      description: t("分裂跳躍，會在地面留下減速泥漿。", "Hops and leaves slowing mud behind."),
      ai: "hopper",
      color: "#547853",
      accent: "#a5d36b",
      base: { hp: 12, attack: 5, speed: 92, xp: 8, gold: 3, radius: 26, cooldown: 1.5 }
    },
    reedMosquito: {
      id: "reedMosquito",
      chapter: 2,
      name: t("蘆葦蚊", "Reed Mosquito"),
      description: t("從空中快速突刺，命中後短暫提高自身速度。", "Dives from the air and accelerates after landing a hit."),
      ai: "flying",
      color: "#556b75",
      accent: "#efc662",
      base: { hp: 9, attack: 6, speed: 165, xp: 8, gold: 4, radius: 21, cooldown: 1.5 }
    },
    mudCrab: {
      id: "mudCrab",
      chapter: 2,
      name: t("泥甲蟹", "Mud Crab"),
      description: t("正面護甲很高，會橫向夾擊玩家。", "Heavily armored from the front and attacks with side pincers."),
      ai: "armored",
      color: "#9b5b42",
      accent: "#e59a57",
      base: { hp: 25, attack: 8, speed: 70, xp: 14, gold: 6, radius: 31, cooldown: 1.8 }
    }
  };

  const bosses = {
    whiteFox: {
      id: "whiteFox",
      chapter: 1,
      name: t("月白狐王", "Moonwhite Fox"),
      description: t("草原深處的守護者，擅長高速突進、冰月彈與幻影召喚。", "Guardian of the deep grassland, using dashes, ice-moon bolts and illusions."),
      color: "#eef7f6",
      accent: "#80d8e8",
      base: { hp: 520, attack: 12, speed: 190, xp: 180, gold: 90, radius: 58 }
    },
    otterKing: {
      id: "otterKing",
      chapter: 2,
      name: t("深沼水獺王", "Deepmarsh Otter"),
      description: t("操縱浪潮與氣泡的沼澤領主，會高速滑行並召喚水柱。", "A swamp lord who commands waves, bubbles and rushing water pillars."),
      color: "#8a674d",
      accent: "#5ed2dc",
      base: { hp: 880, attack: 17, speed: 175, xp: 320, gold: 160, radius: 62 }
    }
  };

  const stageModifiers = [
    {
      id: "vulnerable",
      icon: "fa-heartbeat",
      name: t("脆弱之路", "Fragile Path"),
      description: t("玩家受到傷害 +5%", "Player damage taken +5%"),
      rewardBonus: 0.08
    },
    {
      id: "crowded",
      icon: "fa-users",
      name: t("蟲群滋生", "Swarming Grounds"),
      description: t("怪物數量 +10%", "Enemy count +10%"),
      rewardBonus: 0.08
    },
    {
      id: "slowCooldown",
      icon: "fa-clock-o",
      name: t("魔力遲滯", "Arcane Drag"),
      description: t("玩家技能冷卻 +10%", "Player skill cooldown +10%"),
      rewardBonus: 0.08
    }
  ];

  const grasslandNames = [
    "晨露丘陵", "蒲公英谷", "風車草坡", "兔尾草原", "日光牧徑",
    "銀鈴花地", "小溪斷岸", "野莓山徑", "翠風凹谷", "舊木橋原",
    "蜜蜂花園", "鹿角小徑", "長草迷途", "石環高地", "薄霧牧場",
    "夕照坡地", "風蝕溝渠", "白花平原", "青苔岩丘", "月影草海"
  ];

  const swampNames = [
    "霧蘆水道", "青泥淺灘", "沉木沼徑", "螢光濕地", "水草迷灣",
    "腐葉低谷", "雨蛙水窪", "黑泥斷橋", "蘆葦深塘", "潮濕石灘",
    "浮萍水路", "老樹根域", "藍菇沼澤", "霧氣泥灣", "水獺舊巢",
    "暗流濕原", "沉降淺湖", "毒花窪地", "雨幕沼道", "深沼之門"
  ];

  function buildMapTemplates(chapter, names, seedBase) {
    return names.map((name, index) => ({
      id: `${chapter === 1 ? "grass" : "swamp"}-${String(index + 1).padStart(2, "0")}`,
      chapter,
      name: t(name, `${chapter === 1 ? "Grassland" : "Swamp"} Route ${index + 1}`),
      seed: seedBase + index * 7919,
      length: 6700 + (index % 5) * 420 + Math.floor(index / 5) * 190,
      hillAmplitude: chapter === 1 ? 52 + (index % 4) * 11 : 36 + (index % 3) * 9,
      hillFrequency: 0.00135 + (index % 5) * 0.00011,
      pitCount: chapter === 1 ? 3 + (index % 3) : 2 + (index % 3),
      platformCount: 11 + (index % 5),
      secretRouteCount: 1 + (index % 2),
      waterCount: chapter === 2 ? 6 + (index % 5) : 0,
      landmarkDensity: 0.82 + (index % 4) * 0.11,
      chestBias: 0.9 + (index % 3) * 0.08
    }));
  }

  const chapters = {
    1: {
      id: 1,
      name: t("第一章・風語草原", "Chapter 1 · Whispering Grassland"),
      shortName: t("草原", "Grassland"),
      stageCount: 10,
      baseHpMultiplier: 1,
      hpStep: 0.1,
      baseAttackMultiplier: 1,
      attackStep: 0.01,
      baseSpeedMultiplier: 1,
      speedStep: 0.004,
      enemyPool: ["grassSpider", "caterpillar", "poisonCaterpillar", "skyMoth", "stoneMimic", "hornBeetle"],
      boss: "whiteFox",
      maps: buildMapTemplates(1, grasslandNames, 1729),
      bossMap: {
        id: "grass-boss",
        chapter: 1,
        name: t("月白狐王庭", "Moonwhite Fox Court"),
        seed: 91919,
        length: 4100,
        hillAmplitude: 26,
        hillFrequency: 0.0018,
        pitCount: 0,
        platformCount: 12,
        waterCount: 0,
        landmarkDensity: 1
      },
      palette: {
        skyTop: "#4e9acc",
        skyBottom: "#c9e7be",
        far: "#5e9e79",
        mid: "#376c58",
        ground: "#5b452d",
        grass: "#70b84f",
        accent: "#f6d56d"
      }
    },
    2: {
      id: 2,
      name: t("第二章・幽霧沼澤", "Chapter 2 · Mistbound Swamp"),
      shortName: t("沼澤", "Swamp"),
      stageCount: 10,
      baseHpMultiplier: 2,
      hpStep: 0.2,
      baseAttackMultiplier: 1.1,
      attackStep: 0.015,
      baseSpeedMultiplier: 1.05,
      speedStep: 0.005,
      enemyPool: ["leechSwarm", "marshSlime", "reedMosquito", "mudCrab", "poisonCaterpillar", "stoneMimic"],
      boss: "otterKing",
      maps: buildMapTemplates(2, swampNames, 81281),
      bossMap: {
        id: "swamp-boss",
        chapter: 2,
        name: t("深沼水獺王域", "Deepmarsh Otter Domain"),
        seed: 151151,
        length: 4300,
        hillAmplitude: 18,
        hillFrequency: 0.0016,
        pitCount: 0,
        platformCount: 11,
        waterCount: 5,
        landmarkDensity: 1
      },
      palette: {
        skyTop: "#284b58",
        skyBottom: "#789486",
        far: "#3e6358",
        mid: "#284a42",
        ground: "#493b31",
        grass: "#527a4d",
        accent: "#70d1b1",
        water: "#315e67"
      }
    }
  };

  const translations = {
    "zh-TW": {
      normal: "普通關卡",
      elite: "菁英關卡",
      shop: "商店關卡",
      boss: "BOSS 關卡",
      interact: "互動",
      openChest: "開啟寶箱",
      enterPortal: "進入傳送門",
      returnVillage: "返回村莊",
      stageClear: "關卡完成",
      portalUnlocked: "傳送門已開啟",
      rewardsReduced: "超過 5 分鐘：經驗與金幣收益降低 80%",
      frenzyStarted: "超過 8 分鐘：怪物開始不斷增強",
      insufficientGold: "金幣不足",
      itemMax: "已達最高等級",
      dummy: "訓練木樁",
      village: "風鈴村莊",
      killObjective: "擊倒敵人並前往傳送門",
      bossObjective: "擊敗章節 BOSS",
      chestReward: "寶箱獲得道具",
      levelUp: "角色升級",
      paused: "遊戲暫停",
      inventoryTitle: "目前道具",
      itemStack: "持有數量"
    },
    en: {
      normal: "Normal Stage",
      elite: "Elite Stage",
      shop: "Shop Stage",
      boss: "Boss Stage",
      interact: "Interact",
      openChest: "Open Chest",
      enterPortal: "Enter Portal",
      returnVillage: "Return to Village",
      stageClear: "Stage Clear",
      portalUnlocked: "Portal Unlocked",
      rewardsReduced: "After 5 minutes: XP and gold reduced by 80%",
      frenzyStarted: "After 8 minutes: enemies continuously grow stronger",
      insufficientGold: "Not enough gold",
      itemMax: "Maximum level",
      dummy: "Training Dummy",
      village: "Windbell Village",
      killObjective: "Defeat enemies and reach the portal",
      bossObjective: "Defeat the chapter boss",
      chestReward: "Chest item acquired",
      levelUp: "Level Up",
      paused: "Paused",
      inventoryTitle: "Current Items",
      itemStack: "Owned"
    }
  };

  window.platformGameData = {
    version: "2.1.0",
    title: t("2D小遊戲", "2D Mini Game"),
    characters,
    items,
    enemies,
    bosses,
    chapters,
    stageModifiers,
    translations,
    balance: {
      rewardPenaltyTime: 300,
      frenzyStartTime: 480,
      frenzyInterval: 15,
      rewardPenaltyMultiplier: 0.2,
      maxEnemies: 150,
      initialEnemyCountNormal: 3,
      initialEnemyCountElite: 5,
      spawnIntervalStart: 2.8,
      spawnIntervalFloor: 0.58,
      spawnRampTime: 240,
      activeEnemyCapStart: 16,
      moveSpeedCap: 520,
      chestBaseCost: 18,
      chestStageGrowth: 0.18,
      shopBaseCost: 34,
      shopStageGrowth: 0.2,
      eliteHpMultiplier: 1.45,
      eliteAttackMultiplier: 1.2,
      eliteRewardMultiplier: 1.65,
      normalRewardMultiplier: 1,
      bossRewardMultiplier: 2.4,
      playerInvulnerability: 0.72,
      portalMinTime: 32,
      killTargetBase: 26,
      killTargetPerStage: 4
    },
    defaultKeybinds: {
      moveLeft: "KeyA",
      moveRight: "KeyD",
      jump: "Space",
      moveUp: "KeyW",
      moveDown: "KeyS",
      skillQ: "KeyQ",
      skillE: "KeyE",
      ultimate: "KeyR",
      interact: "KeyF",
      pause: "Escape"
    }
  };
})();
