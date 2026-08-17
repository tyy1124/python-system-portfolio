/* =========================================================
   TYY 小站：醫療資料互動分析（Chart.js）
   ========================================================= */

let medicalAnalysisState = null;
let medicalAnalysisThemeListenerAdded = false;

function cleanupMedicalAnalysis() {
  if (!medicalAnalysisState) {
    return;
  }

  Object.values(medicalAnalysisState.charts || {}).forEach(function (chart) {
    if (chart && typeof chart.destroy === "function") {
      chart.destroy();
    }
  });

  medicalAnalysisState = null;
}

function medicalFormatNumber(value, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "—";
  }

  return Number(value).toLocaleString("zh-TW", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function medicalFormatSigned(value, suffix = "", digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "—";
  }

  const numericValue = Number(value);
  const sign = numericValue > 0 ? "+" : "";
  return sign + medicalFormatNumber(numericValue, digits) + suffix;
}

function medicalToFiniteNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function medicalGetChartValue(context, horizontal = false) {
  const rawValue = context ? context.raw : null;

  if (typeof rawValue === "number") {
    return Number.isFinite(rawValue) ? rawValue : null;
  }

  if (rawValue && typeof rawValue === "object") {
    const rawAxisValue = horizontal ? rawValue.x : rawValue.y;
    const numericRawValue = medicalToFiniteNumber(rawAxisValue);

    if (numericRawValue !== null) {
      return numericRawValue;
    }
  }

  const parsedValue = context ? context.parsed : null;

  if (typeof parsedValue === "number") {
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  if (parsedValue && typeof parsedValue === "object") {
    const parsedAxisValue = horizontal ? parsedValue.x : parsedValue.y;
    return medicalToFiniteNumber(parsedAxisValue);
  }

  return null;
}

function medicalChangeClass(value) {
  const numericValue = medicalToFiniteNumber(value);

  if (numericValue === null || numericValue === 0) {
    return "medical-change-neutral";
  }

  return numericValue > 0
    ? "medical-change-positive"
    : "medical-change-negative";
}

function medicalChangeBadge(value, suffix = "", digits = 2) {
  return `<span class="medical-change-badge ${medicalChangeClass(value)}">${medicalFormatSigned(value, suffix, digits)}</span>`;
}

function medicalHexToRgba(hex, alpha) {
  const normalized = hex.replace("#", "");
  const value = normalized.length === 3
    ? normalized.split("").map(character => character + character).join("")
    : normalized;

  const integer = parseInt(value, 16);
  const red = (integer >> 16) & 255;
  const green = (integer >> 8) & 255;
  const blue = integer & 255;

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function medicalGetTheme() {
  const isDark = document.body.dataset.theme === "dark";

  return {
    isDark: isDark,
    text: isDark ? "#e7f3f2" : "#31444b",
    muted: isDark ? "#a6bcbc" : "#6e7f85",
    grid: isDark ? "rgba(197, 226, 224, 0.13)" : "rgba(53, 88, 94, 0.12)",
    tooltipBackground: isDark ? "#24373c" : "#ffffff",
    tooltipText: isDark ? "#f4fbfa" : "#1e3036",
    tooltipBorder: isDark ? "#3f5a60" : "#d9e7e9",
    chartBackground: isDark ? "#1d3035" : "#f7fbfb",
    tiffany: isDark ? "#36d6ca" : "#0abab5",
    orange: isDark ? "#ffa364" : "#ff8a3d",
    danger: isDark ? "#ff8b9b" : "#b92d45",
    success: isDark ? "#79e4bd" : "#13795b",
    palette: isDark
      ? ["#36d6ca", "#ffa364", "#8ca8ff", "#e88be7", "#6cd49f", "#ffd166", "#ff7a7a", "#8fd3ff"]
      : ["#0abab5", "#ff8a3d", "#547bd8", "#b65fba", "#37a276", "#d9a718", "#e45757", "#3c9fc8"]
  };
}

function medicalChartBaseOptions(options = {}) {
  const theme = medicalGetTheme();
  const percent = options.percent === true;
  const horizontal = options.horizontal === true;
  const stacked = options.stacked === true;
  const showLegend = options.showLegend !== false;
  const hideScales = options.hideScales === true;
  const interactionMode = options.interactionMode || "index";

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    resizeDelay: 120,
    normalized: true,
    indexAxis: horizontal ? "y" : "x",
    animation: {
      duration: 350
    },
    hover: {
      mode: interactionMode,
      intersect: false,
      animationDuration: 0
    },
    interaction: {
      mode: interactionMode,
      intersect: false
    },
    plugins: {
      legend: {
        display: showLegend,
        position: options.legendPosition || "top",
        labels: {
          color: theme.text,
          usePointStyle: true,
          boxWidth: 10,
          padding: 16,
          font: {
            size: 11
          }
        }
      },
      tooltip: {
        enabled: true,
        backgroundColor: theme.tooltipBackground,
        titleColor: theme.tooltipText,
        bodyColor: theme.tooltipText,
        borderColor: theme.tooltipBorder,
        borderWidth: 1,
        padding: 11,
        displayColors: true,
        callbacks: {
          title: function (contexts) {
            if (!contexts || !contexts.length) {
              return "";
            }

            return contexts[0].label || "";
          },
          label: function (context) {
            const numericValue = medicalGetChartValue(context, horizontal);

            if (numericValue === null) {
              return `${context.dataset.label || context.label || "數值"}：—`;
            }

            const suffix = percent ? "%" : " 人";
            const digits = percent ? 2 : 0;

            return `${context.dataset.label || context.label || "數值"}：${medicalFormatNumber(numericValue, digits)}${suffix}`;
          }
        }
      }
    }
  };

  if (hideScales) {
    return chartOptions;
  }

  if (horizontal) {
    chartOptions.scales = {
      x: {
        type: "linear",
        stacked: stacked,
        beginAtZero: true,
        max: percent && options.percentMax ? options.percentMax : undefined,
        grid: {
          color: theme.grid
        },
        ticks: {
          color: theme.muted,
          callback: function (value) {
            const numericValue = medicalToFiniteNumber(value);

            if (numericValue === null) {
              return "";
            }

            return percent
              ? `${medicalFormatNumber(numericValue, 0)}%`
              : medicalFormatNumber(numericValue, 0);
          }
        },
        border: {
          color: theme.grid
        }
      },
      y: {
        type: "category",
        stacked: stacked,
        grid: {
          display: false
        },
        ticks: {
          color: theme.muted,
          autoSkip: false,
          callback: function (value) {
            const label = this.getLabelForValue(value);
            return label === undefined || label === null ? "" : String(label);
          }
        },
        border: {
          color: theme.grid
        }
      }
    };
  } else {
    chartOptions.scales = {
      x: {
        type: "category",
        stacked: stacked,
        offset: options.offset === true,
        grid: {
          color: "transparent"
        },
        ticks: {
          color: theme.muted,
          maxRotation: 45,
          minRotation: 0,
          autoSkip: true,
          maxTicksLimit: 12,
          callback: function (value) {
            const label = this.getLabelForValue(value);
            return label === undefined || label === null ? "" : String(label);
          }
        },
        border: {
          color: theme.grid
        }
      },
      y: {
        type: "linear",
        stacked: stacked,
        beginAtZero: true,
        max: percent && options.percentMax ? options.percentMax : undefined,
        grid: {
          color: theme.grid
        },
        ticks: {
          color: theme.muted,
          callback: function (value) {
            const numericValue = medicalToFiniteNumber(value);

            if (numericValue === null) {
              return "";
            }

            return percent
              ? `${medicalFormatNumber(numericValue, 0)}%`
              : medicalFormatNumber(numericValue, 0);
          }
        },
        border: {
          color: theme.grid
        }
      }
    };
  }

  return chartOptions;
}

const medicalCanvasBackgroundPlugin = {
  id: "medicalCanvasBackground",
  beforeDraw: function (chart) {
    const context = chart.ctx;
    const theme = medicalGetTheme();

    context.save();
    context.globalCompositeOperation = "destination-over";
    context.fillStyle = theme.chartBackground;
    context.fillRect(0, 0, chart.width, chart.height);
    context.restore();
  }
};

function medicalDestroyChart(chartKey) {
  if (!medicalAnalysisState || !medicalAnalysisState.charts[chartKey]) {
    return;
  }

  medicalAnalysisState.charts[chartKey].destroy();
  delete medicalAnalysisState.charts[chartKey];
}

function medicalPreparePureBarChart(configuration) {
  const datasets = Array.isArray(configuration?.data?.datasets)
    ? configuration.data.datasets
    : [];

  const hasNonBarDataset = datasets.some(dataset => (
    dataset.type && dataset.type !== "bar"
  ));

  const isPureBar = configuration?.type === "bar" && !hasNonBarDataset;

  if (!isPureBar) {
    return configuration;
  }

  configuration.options = configuration.options || {};

  const horizontal = configuration.options.indexAxis === "y";
  const exactInteraction = {
    mode: "nearest",
    intersect: true,
    axis: horizontal ? "y" : "x"
  };

  // === 長條圖只有真正碰到該長條時才顯示，避免判讀到鄰近資料 ===
  configuration.options.interaction = exactInteraction;
  configuration.options.hover = {
    ...exactInteraction,
    animationDuration: 0
  };

  configuration.options.plugins = configuration.options.plugins || {};
  configuration.options.plugins.tooltip = configuration.options.plugins.tooltip || {};
  configuration.options.plugins.tooltip.position = "nearest";

  const originalFilter = configuration.options.plugins.tooltip.filter;
  const callbacks = configuration.options.plugins.tooltip.callbacks || {};
  const originalTitle = callbacks.title;

  configuration.options.plugins.tooltip.filter = function (context) {
    const labels = configuration?.data?.labels || [];
    const validIndex = Number.isInteger(context?.dataIndex)
      && context.dataIndex >= 0
      && context.dataIndex < labels.length;

    if (!validIndex) {
      return false;
    }

    return typeof originalFilter === "function"
      ? originalFilter(context)
      : true;
  };

  configuration.options.plugins.tooltip.callbacks = {
    ...callbacks,
    title(contexts) {
      const first = Array.isArray(contexts) ? contexts[0] : null;

      if (!first || !Number.isInteger(first.dataIndex)) {
        return "";
      }

      if (typeof originalTitle === "function") {
        const originalResult = originalTitle(contexts);

        if (originalResult !== undefined && originalResult !== null && originalResult !== "") {
          return originalResult;
        }
      }

      const label = configuration?.data?.labels?.[first.dataIndex];
      return label === undefined || label === null ? "" : String(label);
    }
  };

  return configuration;
}

function medicalCreateChart(chartKey, configuration) {
  const canvas = document.getElementById(chartKey);

  if (!canvas || typeof Chart === "undefined") {
    return null;
  }

  medicalDestroyChart(chartKey);

  const safeConfiguration = medicalPreparePureBarChart(configuration);
  const chartPlugins = Array.isArray(safeConfiguration.plugins)
    ? safeConfiguration.plugins.slice()
    : [];

  chartPlugins.push(medicalCanvasBackgroundPlugin);

  medicalAnalysisState.charts[chartKey] = new Chart(
    canvas.getContext("2d"),
    {
      ...safeConfiguration,
      plugins: chartPlugins
    }
  );

  return medicalAnalysisState.charts[chartKey];
}

function medicalGetSelectedRange() {
  const data = medicalAnalysisState.data;
  const startYear = Number(document.getElementById("medicalStartYear").value);
  const endYear = Number(document.getElementById("medicalEndYear").value);

  return data.national.filter(function (record) {
    return record.year >= startYear && record.year <= endYear;
  });
}

function medicalRecordsForRange(records) {
  const range = medicalGetSelectedRange();
  const years = new Set(range.map(record => record.year));
  return records.filter(record => years.has(record.year));
}

function medicalGetRecordByYear(records, year) {
  return records.find(record => Number(record.year) === Number(year));
}

function medicalCreateSelectOptions(selectElement, years, selectedValue) {
  selectElement.innerHTML = "";

  years.forEach(function (year) {
    const option = document.createElement("option");
    option.value = year.roc;
    option.textContent = `民國 ${year.roc} 年（${year.ce}）`;
    option.selected = Number(year.roc) === Number(selectedValue);
    selectElement.appendChild(option);
  });
}

function medicalInitializeControls() {
  const data = medicalAnalysisState.data;
  const firstYear = data.metadata.first_year;
  const latestYear = data.metadata.latest_year;

  medicalCreateSelectOptions(
    document.getElementById("medicalStartYear"),
    data.years,
    firstYear
  );

  medicalCreateSelectOptions(
    document.getElementById("medicalEndYear"),
    data.years,
    latestYear
  );

  const cityYears = data.years.filter(year =>
    data.city.available_years.includes(year.roc)
  );

  medicalCreateSelectOptions(
    document.getElementById("medicalCityYear"),
    cityYears,
    latestYear
  );

  document.getElementById("medicalTrendMode").value = "count";
  document.getElementById("medicalGenderMode").value = "count";
  document.getElementById("medicalAgeMode").value = "count";
  document.getElementById("medicalBranchMode").value = "count";
  document.getElementById("medicalChartHeight").value = "normal";

  medicalAnalysisState.root.dataset.chartHeight = "normal";
}

function medicalValidateYearRange(changedControl) {
  const startSelect = document.getElementById("medicalStartYear");
  const endSelect = document.getElementById("medicalEndYear");
  let startYear = Number(startSelect.value);
  let endYear = Number(endSelect.value);

  if (startYear <= endYear) {
    return;
  }

  if (changedControl === "start") {
    endSelect.value = String(startYear);
  } else {
    startSelect.value = String(endYear);
  }
}

function medicalUpdateInsights() {
  const records = medicalGetSelectedRange();
  const container = document.getElementById("medicalPeriodInsights");

  if (!records.length || !container) {
    return;
  }

  const first = records[0];
  const last = records[records.length - 1];
  const change = last.total - first.total;
  const rate = first.total ? (change / first.total) * 100 : 0;
  const periods = records.length - 1;
  const cagr = periods > 0 && first.total > 0
    ? (Math.pow(last.total / first.total, 1 / periods) - 1) * 100
    : 0;

  const growthRecords = records.filter(record => record.yoy !== null);
  const largest = growthRecords.length
    ? growthRecords.reduce((best, record) => record.yoy > best.yoy ? record : best)
    : null;

  container.innerHTML = `
    <article class="medical-insight-card">
      <span>期間人數變化</span>
      <strong>${medicalChangeBadge(change, " 人", 0)}</strong>
      <p>民國 ${first.year} 年至 ${last.year} 年</p>
    </article>
    <article class="medical-insight-card">
      <span>期間成長率</span>
      <strong>${medicalChangeBadge(rate, "%")}</strong>
      <p>以期間起點為基準</p>
    </article>
    <article class="medical-insight-card">
      <span>期間年複合成長率</span>
      <strong>${medicalChangeBadge(cagr, "%")}</strong>
      <p>${periods > 0 ? periods + " 個年度區間" : "單一年度"}</p>
    </article>
    <article class="medical-insight-card">
      <span>區間內最高年增率</span>
      <strong>${largest ? medicalChangeBadge(largest.yoy, "%") : "—"}</strong>
      <p>${largest ? "民國 " + largest.year + " 年" : "至少選擇兩個年度"}</p>
    </article>
  `;
}

function medicalRenderNationalCharts() {
  const theme = medicalGetTheme();
  const records = medicalGetSelectedRange();
  const mode = document.getElementById("medicalTrendMode").value;
  const labels = records.map(record => String(record.year));

  let values;
  let datasetLabel;

  if (mode === "index") {
    const base = records[0] ? records[0].total : 1;
    values = records.map(record => Number(((record.total / base) * 100).toFixed(2)));
    datasetLabel = `指數（民國 ${records[0].year} 年＝100）`;
  } else {
    values = records.map(record => record.total);
    datasetLabel = "使用人數";
  }

  const nationalOptions = medicalChartBaseOptions({
    percent: false,
    showLegend: true
  });

  nationalOptions.plugins.tooltip.callbacks.label = function (context) {
    const record = records[context.dataIndex];

    if (mode === "index") {
      return `${context.dataset.label}：${medicalFormatNumber(context.parsed.y, 2)}`;
    }

    return `使用人數：${medicalFormatNumber(record.total)} 人`;
  };

  nationalOptions.scales.y.ticks.callback = function (value) {
    return mode === "index"
      ? medicalFormatNumber(value, 0)
      : Number(value).toLocaleString("zh-TW");
  };

  medicalCreateChart("nationalTrendChart", {
    type: "line",
    data: {
      labels: labels,
      datasets: [{
        label: datasetLabel,
        data: values,
        borderColor: theme.tiffany,
        backgroundColor: medicalHexToRgba(theme.tiffany, 0.17),
        pointBackgroundColor: records.map(record => record.year === 102 ? theme.orange : theme.tiffany),
        pointBorderColor: records.map(record => record.year === 102 ? theme.orange : theme.tiffany),
        pointRadius: records.map(record => record.year === 102 ? 6 : 3),
        pointHoverRadius: 7,
        fill: true,
        tension: 0.28,
        borderWidth: 2.5
      }]
    },
    options: nationalOptions,
    plugins: [medicalDefinitionChangePlugin]
  });

  const growthRecords = records.filter(record => record.yoy !== null);
  const growthOptions = medicalChartBaseOptions({
    percent: true,
    showLegend: false,
    interactionMode: "nearest"
  });

  growthOptions.plugins.tooltip.callbacks.label = function (context) {
    const numericValue = medicalGetChartValue(context, false);
    return `年增率：${medicalFormatSigned(numericValue, "%")}`;
  };

  medicalCreateChart("nationalGrowthChart", {
    type: "bar",
    data: {
      labels: growthRecords.map(record => String(record.year)),
      datasets: [{
        label: "年增率",
        data: growthRecords.map(record => record.yoy),
        backgroundColor: growthRecords.map(record =>
          record.yoy > 0
            ? medicalHexToRgba(theme.success, 0.76)
            : record.yoy < 0
              ? medicalHexToRgba(theme.danger, 0.76)
              : medicalHexToRgba(theme.muted, 0.55)
        ),
        borderColor: growthRecords.map(record =>
          record.yoy > 0
            ? theme.success
            : record.yoy < 0
              ? theme.danger
              : theme.muted
        ),
        borderWidth: 1,
        borderRadius: 6
      }]
    },
    options: growthOptions,
    plugins: [medicalDefinitionChangePlugin]
  });

  const subtitle = document.getElementById("nationalTrendSubtitle");
  if (subtitle && records.length) {
    subtitle.textContent = `民國 ${records[0].year}～${records[records.length - 1].year} 年，共 ${records.length} 個年度`;
  }
}

function medicalRenderGenderCharts() {
  const theme = medicalGetTheme();
  const records = medicalRecordsForRange(medicalAnalysisState.data.gender.records);
  const mode = document.getElementById("medicalGenderMode").value;
  const labels = records.map(record => String(record.year));

  const datasets = medicalAnalysisState.data.gender.labels.map(function (label, index) {
    return {
      label: label,
      data: records.map(record => mode === "share" ? record.shares[label] : record.values[label]),
      borderColor: theme.palette[index],
      backgroundColor: medicalHexToRgba(theme.palette[index], 0.12),
      pointRadius: 3,
      pointHoverRadius: 6,
      tension: 0.25,
      borderWidth: 2.3,
      fill: false
    };
  });

  medicalCreateChart("genderTrendChart", {
    type: "line",
    data: {
      labels: labels,
      datasets: datasets
    },
    options: medicalChartBaseOptions({
      percent: mode === "share",
      percentMax: mode === "share" ? 100 : undefined
    })
  });

  const endingYear = Number(document.getElementById("medicalEndYear").value);
  const endingRecord = medicalGetRecordByYear(
    medicalAnalysisState.data.gender.records,
    endingYear
  );

  if (!endingRecord) {
    return;
  }

  medicalCreateChart("genderShareChart", {
    type: "doughnut",
    data: {
      labels: medicalAnalysisState.data.gender.labels,
      datasets: [{
        data: medicalAnalysisState.data.gender.labels.map(label => endingRecord.values[label]),
        backgroundColor: [theme.palette[0], theme.palette[1]],
        borderColor: medicalGetTheme().isDark ? "#18272b" : "#ffffff",
        borderWidth: 3,
        hoverOffset: 8
      }]
    },
    options: {
      ...medicalChartBaseOptions({
        hideScales: true,
        legendPosition: "bottom"
      }),
      cutout: "62%",
      plugins: {
        ...medicalChartBaseOptions({ hideScales: true }).plugins,
        legend: {
          position: "bottom",
          labels: {
            color: theme.text,
            usePointStyle: true,
            padding: 15
          }
        },
        tooltip: {
          backgroundColor: theme.tooltipBackground,
          titleColor: theme.tooltipText,
          bodyColor: theme.tooltipText,
          borderColor: theme.tooltipBorder,
          borderWidth: 1,
          callbacks: {
            label: function (context) {
              const label = context.label;
              return `${label}：${medicalFormatNumber(context.parsed)} 人（${medicalFormatNumber(endingRecord.shares[label], 2)}%）`;
            }
          }
        }
      }
    }
  });

  document.getElementById("genderShareYearLabel").textContent = `民國 ${endingYear} 年`;
}

function medicalRenderAgeCharts() {
  const theme = medicalGetTheme();
  const data = medicalAnalysisState.data;
  const records = medicalRecordsForRange(data.age.records);
  const mode = document.getElementById("medicalAgeMode").value;
  const labels = records.map(record => String(record.year));

  const datasets = data.age.labels.map(function (label, index) {
    return {
      label: label,
      data: records.map(record => mode === "share" ? record.shares[label] : record.values[label]),
      borderColor: theme.palette[index],
      backgroundColor: medicalHexToRgba(theme.palette[index], mode === "share" ? 0.58 : 0.38),
      fill: true,
      tension: 0.2,
      pointRadius: 1.8,
      pointHoverRadius: 5,
      borderWidth: 1.8
    };
  });

  medicalCreateChart("ageTrendChart", {
    type: "line",
    data: {
      labels: labels,
      datasets: datasets
    },
    options: medicalChartBaseOptions({
      percent: mode === "share",
      percentMax: mode === "share" ? 100 : undefined,
      stacked: true
    })
  });

  const endingYear = Number(document.getElementById("medicalEndYear").value);
  const endingRecord = medicalGetRecordByYear(data.age.records, endingYear);

  if (!endingRecord) {
    return;
  }

  const ranking = data.age.labels
    .map((label, index) => ({
      label: label,
      value: endingRecord.values[label],
      share: endingRecord.shares[label],
      color: theme.palette[index]
    }))
    .sort((a, b) => b.value - a.value);

  const rankingOptions = medicalChartBaseOptions({
    horizontal: true,
    showLegend: false,
    interactionMode: "nearest"
  });

  rankingOptions.plugins.tooltip.callbacks.label = function (context) {
    const item = ranking[context.dataIndex];
    return `${medicalFormatNumber(item.value)} 人（${medicalFormatNumber(item.share, 2)}%）`;
  };

  medicalCreateChart("ageRankingChart", {
    type: "bar",
    data: {
      labels: ranking.map(item => item.label),
      datasets: [{
        label: "使用人數",
        data: ranking.map(item => item.value),
        backgroundColor: ranking.map(item => medicalHexToRgba(item.color, 0.75)),
        borderColor: ranking.map(item => item.color),
        borderWidth: 1,
        borderRadius: 7
      }]
    },
    options: rankingOptions
  });

  document.getElementById("ageRankingYearLabel").textContent = `民國 ${endingYear} 年`;
}

function medicalRenderBranchCharts() {
  const theme = medicalGetTheme();
  const data = medicalAnalysisState.data;
  const records = medicalRecordsForRange(data.branch.records);
  const mode = document.getElementById("medicalBranchMode").value;
  const labels = records.map(record => String(record.year));

  const datasets = data.branch.labels.map(function (label, index) {
    const baseValue = records[0] && records[0].values[label]
      ? records[0].values[label]
      : 1;

    return {
      label: label,
      data: records.map(record => mode === "index"
        ? Number(((record.values[label] / baseValue) * 100).toFixed(2))
        : record.values[label]
      ),
      borderColor: theme.palette[index],
      backgroundColor: medicalHexToRgba(theme.palette[index], 0.1),
      pointRadius: 2,
      pointHoverRadius: 6,
      tension: 0.23,
      borderWidth: 2.1
    };
  });

  const branchOptions = medicalChartBaseOptions({ showLegend: true });

  if (mode === "index") {
    branchOptions.plugins.tooltip.callbacks.label = function (context) {
      return `${context.dataset.label}：${medicalFormatNumber(context.parsed.y, 2)}`;
    };
    branchOptions.scales.y.ticks.callback = value => medicalFormatNumber(value, 0);
  }

  medicalCreateChart("branchTrendChart", {
    type: "line",
    data: {
      labels: labels,
      datasets: datasets
    },
    options: branchOptions
  });

  const endingYear = Number(document.getElementById("medicalEndYear").value);
  const endingRecord = medicalGetRecordByYear(data.branch.records, endingYear);

  if (!endingRecord) {
    return;
  }

  const ranking = data.branch.labels
    .map((label, index) => ({
      label: label,
      value: endingRecord.values[label],
      color: theme.palette[index]
    }))
    .sort((a, b) => b.value - a.value);

  const rankingOptions = medicalChartBaseOptions({
    horizontal: true,
    showLegend: false,
    interactionMode: "nearest"
  });

  medicalCreateChart("branchRankingChart", {
    type: "bar",
    data: {
      labels: ranking.map(item => item.label),
      datasets: [{
        label: "使用人數",
        data: ranking.map(item => item.value),
        backgroundColor: ranking.map(item => medicalHexToRgba(item.color, 0.72)),
        borderColor: ranking.map(item => item.color),
        borderWidth: 1,
        borderRadius: 7
      }]
    },
    options: rankingOptions
  });

  document.getElementById("branchRankingYearLabel").textContent = `民國 ${endingYear} 年`;
}

function medicalInitializeCityPicker() {
  const data = medicalAnalysisState.data;
  const picker = document.getElementById("medicalCityPicker");
  const defaults = ["臺北市", "新北市", "臺中市", "高雄市"];

  picker.innerHTML = "";

  data.city.labels.forEach(function (cityName) {
    const label = document.createElement("label");
    label.className = "medical-city-choice";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = cityName;
    input.checked = defaults.includes(cityName);

    const text = document.createElement("span");
    text.textContent = cityName;

    label.appendChild(input);
    label.appendChild(text);
    picker.appendChild(label);
  });
}

function medicalGetSelectedCities() {
  return Array.from(
    document.querySelectorAll("#medicalCityPicker input:checked")
  ).map(input => input.value);
}

function medicalEnforceCityLimit(changedInput) {
  const selected = medicalGetSelectedCities();

  if (selected.length <= 6) {
    return true;
  }

  changedInput.checked = false;
  window.alert("縣市趨勢最多同時比較 6 個，請先取消其他縣市。");
  return false;
}

function medicalCityRankingForYear(year) {
  const values = medicalAnalysisState.data.city.records[String(year)] || {};

  return Object.entries(values)
    .map(([city, item]) => ({
      city: city,
      value: item.value,
      branch: item.branch
    }))
    .sort((a, b) => b.value - a.value);
}

function medicalRenderCityCharts() {
  const theme = medicalGetTheme();
  const data = medicalAnalysisState.data;
  const cityYear = Number(document.getElementById("medicalCityYear").value);
  const topNValue = document.getElementById("medicalCityTopN").value;
  const fullRanking = medicalCityRankingForYear(cityYear);
  const ranking = topNValue === "all"
    ? fullRanking
    : fullRanking.slice(0, Number(topNValue));

  const rankingOptions = medicalChartBaseOptions({
    horizontal: true,
    showLegend: false,
    interactionMode: "nearest"
  });
  rankingOptions.plugins.tooltip.callbacks.afterLabel = function (context) {
    return `健保業務組：${ranking[context.dataIndex].branch}`;
  };

  medicalCreateChart("cityRankingChart", {
    type: "bar",
    data: {
      labels: ranking.map(item => item.city),
      datasets: [{
        label: "使用人數",
        data: ranking.map(item => item.value),
        backgroundColor: ranking.map((item, index) =>
          medicalHexToRgba(theme.palette[index % theme.palette.length], 0.74)
        ),
        borderColor: ranking.map((item, index) =>
          theme.palette[index % theme.palette.length]
        ),
        borderWidth: 1,
        borderRadius: 6
      }]
    },
    options: rankingOptions
  });

  document.getElementById("cityRankingSubtitle").textContent =
    `民國 ${cityYear} 年，${topNValue === "all" ? "全部縣市" : "前 " + topNValue + " 名"}`;

  const selectedCities = medicalGetSelectedCities();
  const range = medicalGetSelectedRange();
  const cityRangeYears = range
    .map(record => record.year)
    .filter(year => data.city.available_years.includes(year));

  const cityTrendDatasets = selectedCities.map(function (cityName, index) {
    return {
      label: cityName,
      data: cityRangeYears.map(year => {
        const cityData = data.city.records[String(year)] || {};
        return cityData[cityName] ? cityData[cityName].value : null;
      }),
      borderColor: theme.palette[index % theme.palette.length],
      backgroundColor: medicalHexToRgba(theme.palette[index % theme.palette.length], 0.08),
      pointRadius: 2.5,
      pointHoverRadius: 6,
      tension: 0.22,
      borderWidth: 2.2,
      spanGaps: true
    };
  });

  medicalCreateChart("cityTrendChart", {
    type: "line",
    data: {
      labels: cityRangeYears.map(String),
      datasets: cityTrendDatasets
    },
    options: medicalChartBaseOptions({ showLegend: true })
  });

  medicalRenderCityGrowthChart();
}

function medicalRenderCityGrowthChart() {
  const theme = medicalGetTheme();
  const data = medicalAnalysisState.data;
  const range = medicalGetSelectedRange();
  const availableRange = range.filter(record => data.city.available_years.includes(record.year));

  if (!availableRange.length) {
    medicalCreateChart("cityGrowthChart", {
      type: "bar",
      data: { labels: [], datasets: [] },
      options: medicalChartBaseOptions({ showLegend: false })
    });
    document.getElementById("cityGrowthSubtitle").textContent = "選定區間沒有縣市資料";
    return;
  }

  const startYear = availableRange[0].year;
  const endYear = availableRange[availableRange.length - 1].year;
  const startValues = data.city.records[String(startYear)] || {};
  const endValues = data.city.records[String(endYear)] || {};

  const growthRows = data.city.labels
    .map(cityName => {
      const start = startValues[cityName] ? startValues[cityName].value : null;
      const end = endValues[cityName] ? endValues[cityName].value : null;

      if (start === null || end === null || start === 0) {
        return null;
      }

      return {
        city: cityName,
        start: start,
        end: end,
        change: end - start,
        rate: Number((((end - start) / start) * 100).toFixed(2))
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.rate - a.rate);

  const options = medicalChartBaseOptions({
    horizontal: true,
    percent: true,
    showLegend: false,
    interactionMode: "nearest"
  });
  options.plugins.tooltip.callbacks.label = function (context) {
    const row = growthRows[context.dataIndex];
    return `成長率：${medicalFormatSigned(row.rate, "%")}；增加 ${medicalFormatNumber(row.change)} 人`;
  };

  medicalCreateChart("cityGrowthChart", {
    type: "bar",
    data: {
      labels: growthRows.map(row => row.city),
      datasets: [{
        label: "期間成長率",
        data: growthRows.map(row => row.rate),
        backgroundColor: growthRows.map(row =>
          row.rate > 0
            ? medicalHexToRgba(theme.success, 0.76)
            : row.rate < 0
              ? medicalHexToRgba(theme.danger, 0.76)
              : medicalHexToRgba(theme.muted, 0.55)
        ),
        borderColor: growthRows.map(row =>
          row.rate > 0
            ? theme.success
            : row.rate < 0
              ? theme.danger
              : theme.muted
        ),
        borderWidth: 1,
        borderRadius: 6
      }]
    },
    options: options
  });

  document.getElementById("cityGrowthSubtitle").textContent =
    `民國 ${startYear}～${endYear} 年；依成長率由高到低排序`;
}

function medicalRenderTable() {
  const tbody = document.getElementById("medicalDataTableBody");
  const search = document.getElementById("medicalTableSearch").value.trim();
  const rangeYears = new Set(medicalGetSelectedRange().map(record => record.year));
  const data = medicalAnalysisState.data;

  const rows = data.raw_records.filter(row => {
    const inRange = rangeYears.has(row.year);
    const matchesSearch = !search
      || String(row.year).includes(search)
      || String(row.year_ce).includes(search);

    return inRange && matchesSearch;
  });

  tbody.innerHTML = rows.map(function (row) {
    const national = medicalGetRecordByYear(data.national, row.year);
    const yoyClass = national.yoy === null
      ? ""
      : national.yoy >= 0
        ? "medical-change-positive"
        : "medical-change-negative";

    return `
      <tr>
        <td>${row.year}</td>
        <td>${row.year_ce}</td>
        <td>${medicalFormatNumber(row.total)}</td>
        <td>${national.yoy === null ? "—" : `<span class="medical-change-badge ${yoyClass}">${medicalFormatSigned(national.yoy, "%")}</span>`}</td>
        <td>${medicalFormatNumber(row.male)}</td>
        <td>${medicalFormatNumber(row.female)}</td>
        <td>${medicalFormatNumber(row.under_30)}</td>
        <td>${medicalFormatNumber(row.age_31_40)}</td>
        <td>${medicalFormatNumber(row.age_41_50)}</td>
        <td>${medicalFormatNumber(row.age_51_65)}</td>
        <td>${medicalFormatNumber(row.over_65)}</td>
      </tr>
    `;
  }).join("");
}

function medicalExportCurrentCsv() {
  const data = medicalAnalysisState.data;
  const rangeYears = new Set(medicalGetSelectedRange().map(record => record.year));
  const rows = data.raw_records.filter(row => rangeYears.has(row.year));

  const headers = [
    "年別", "西元年", "抗憂鬱藥物使用人數", "年增率",
    "男性", "女性", "30歲以下", "31-40歲", "41-50歲", "51-65歲", "65歲以上"
  ];

  const csvRows = [headers];

  rows.forEach(function (row) {
    const national = medicalGetRecordByYear(data.national, row.year);
    csvRows.push([
      row.year,
      row.year_ce,
      row.total,
      national.yoy === null ? "" : national.yoy,
      row.male,
      row.female,
      row.under_30,
      row.age_31_40,
      row.age_41_50,
      row.age_51_65,
      row.over_65
    ]);
  });

  const csvText = "\ufeff" + csvRows
    .map(row => row.map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(","))
    .join("\r\n");

  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const range = medicalGetSelectedRange();

  anchor.href = url;
  anchor.download = `TYY_抗憂鬱藥物分析_${range[0].year}_${range[range.length - 1].year}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function medicalRenderAll() {
  if (!medicalAnalysisState) {
    return;
  }

  medicalUpdateInsights();
  medicalRenderNationalCharts();
  medicalRenderGenderCharts();
  medicalRenderAgeCharts();
  medicalRenderBranchCharts();
  medicalRenderCityCharts();
  medicalRenderTable();
}

function medicalHandleChartTool(button) {
  const card = button.closest("[data-chart-card]");

  if (!card) {
    return;
  }

  const chartId = card.dataset.chartCard;
  const action = button.dataset.chartAction;
  const chart = medicalAnalysisState.charts[chartId];

  if (action === "expand") {
    card.classList.toggle("is-expanded");
    button.innerHTML = card.classList.contains("is-expanded")
      ? '<i class="fa fa-compress"></i>'
      : '<i class="fa fa-expand"></i>';

    window.setTimeout(function () {
      if (chart) {
        chart.resize();
      }
    }, 220);

    if (card.classList.contains("is-expanded")) {
      card.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  if (action === "height") {
    if (card.classList.contains("is-height-tall")) {
      card.classList.remove("is-height-tall");
      card.classList.add("is-height-compact");
    } else if (card.classList.contains("is-height-compact")) {
      card.classList.remove("is-height-compact");
    } else {
      card.classList.add("is-height-tall");
    }

    window.setTimeout(function () {
      if (chart) {
        chart.resize();
      }
    }, 170);
  }

  if (action === "download" && chart) {
    const anchor = document.createElement("a");
    anchor.href = chart.toBase64Image("image/png", 1);
    anchor.download = `TYY_${chartId}.png`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }
}

function medicalBindFilterCollapse() {
  const root = medicalAnalysisState?.root;
  const card = root?.querySelector(".medical-control-card");
  const button = document.getElementById("medicalToggleFilters");

  if (!card || !button) {
    return;
  }

  const storageKey = "tyy_medical_filters_collapsed";

  function applyState(collapsed) {
    card.classList.toggle("is-filter-collapsed", collapsed);
    button.setAttribute("aria-expanded", String(!collapsed));
    button.innerHTML = collapsed
      ? '<i class="fa fa-expand"></i> 展開條件'
      : '<i class="fa fa-compress"></i> 收合條件';
  }

  applyState(sessionStorage.getItem(storageKey) === "true");

  button.addEventListener("click", function () {
    const collapsed = !card.classList.contains("is-filter-collapsed");
    applyState(collapsed);
    sessionStorage.setItem(storageKey, String(collapsed));
  });
}

function medicalBindEvents() {
  const root = medicalAnalysisState.root;

  document.getElementById("medicalStartYear").addEventListener("change", function () {
    medicalValidateYearRange("start");
    medicalRenderAll();
  });

  document.getElementById("medicalEndYear").addEventListener("change", function () {
    medicalValidateYearRange("end");
    medicalRenderAll();
  });

  [
    "medicalTrendMode",
    "medicalGenderMode",
    "medicalAgeMode",
    "medicalBranchMode",
    "medicalCityYear",
    "medicalCityTopN"
  ].forEach(function (id) {
    document.getElementById(id).addEventListener("change", medicalRenderAll);
  });

  document.getElementById("medicalChartHeight").addEventListener("change", function (event) {
    root.dataset.chartHeight = event.target.value;
    Object.values(medicalAnalysisState.charts).forEach(chart => chart.resize());
  });

  document.getElementById("medicalResetFilters").addEventListener("click", function () {
    medicalInitializeControls();

    document.querySelectorAll("#medicalCityPicker input").forEach(input => {
      input.checked = ["臺北市", "新北市", "臺中市", "高雄市"].includes(input.value);
    });

    document.getElementById("medicalTableSearch").value = "";
    medicalRenderAll();
  });

  document.getElementById("medicalCityPicker").addEventListener("change", function (event) {
    if (event.target.matches('input[type="checkbox"]')) {
      if (medicalEnforceCityLimit(event.target)) {
        medicalRenderCityCharts();
      }
    }
  });

  document.getElementById("medicalTableSearch").addEventListener("input", medicalRenderTable);
  document.getElementById("medicalExportCsv").addEventListener("click", medicalExportCurrentCsv);

  root.addEventListener("click", function (event) {
    const toolButton = event.target.closest("[data-chart-action]");

    if (toolButton) {
      medicalHandleChartTool(toolButton);
    }
  });
}

function medicalRefreshTheme() {
  if (!medicalAnalysisState) {
    return;
  }

  medicalRenderAll();
}

const medicalDefinitionChangePlugin = {
  id: "medicalDefinitionChange",
  afterDraw: function (chart) {
    const labels = chart.data.labels || [];
    const index = labels.findIndex(label => String(label) === "102");

    if (index < 0 || !chart.scales.x) {
      return;
    }

    const theme = medicalGetTheme();
    const x = chart.scales.x.getPixelForValue(index);
    const top = chart.chartArea.top;
    const bottom = chart.chartArea.bottom;
    const context = chart.ctx;

    context.save();
    context.beginPath();
    context.setLineDash([5, 5]);
    context.strokeStyle = theme.orange;
    context.lineWidth = 1.5;
    context.moveTo(x, top);
    context.lineTo(x, bottom);
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = theme.orange;
    context.font = "11px sans-serif";
    context.fillText("102 年定義調整", Math.min(x + 6, chart.chartArea.right - 86), top + 13);
    context.restore();
  }
};

function initMedicalAnalysis() {
  const root = document.getElementById("medicalAnalysisPage");
  const dataElement = document.getElementById("medicalAnalysisData");

  if (!root || !dataElement) {
    return;
  }

  cleanupMedicalAnalysis();

  if (typeof Chart === "undefined") {
    root.insertAdjacentHTML(
      "afterbegin",
      '<div class="alert alert-danger">Chart.js 尚未載入，請確認 home.html 已引入 chart.umd.js。</div>'
    );
    return;
  }

  let data;

  try {
    data = JSON.parse(dataElement.textContent);
  } catch (error) {
    console.error("醫療分析資料 JSON 解析失敗：", error);
    return;
  }

  medicalAnalysisState = {
    root: root,
    data: data,
    charts: {}
  };

  medicalInitializeControls();
  medicalInitializeCityPicker();
  medicalBindFilterCollapse();
  medicalBindEvents();
  medicalRenderAll();

  if (!medicalAnalysisThemeListenerAdded) {
    document.addEventListener("tyy-theme-changed", medicalRefreshTheme);
    medicalAnalysisThemeListenerAdded = true;
  }
}
