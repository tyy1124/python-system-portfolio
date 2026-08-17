(function () {
  "use strict";

  let kneeCharts = {};
  let kneePayload = null;
  let kneeFilteredRecords = [];
  let kneeTablePage = 1;
  const kneeTablePageSize = 25;
  let kneeThemeHandler = null;
  let selectedHospitalCodes = new Set();

  // === 三張散布圖各自保留目前的局部放大設定 ===
  let scatterZoomStates = createDefaultScatterZoomStates();

  const formatInteger = new Intl.NumberFormat("zh-TW", {
    maximumFractionDigits: 0
  });

  const formatDecimal = new Intl.NumberFormat("zh-TW", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  function getRoot() {
    return document.getElementById("kneeQualityAnalysisPage");
  }

  function readCssVariable(name, fallback) {
    const value = getComputedStyle(document.body)
      .getPropertyValue(name)
      .trim();

    return value || fallback;
  }

  function getPalette() {
    return {
      tiffany: readCssVariable("--tyy-tiffany", "#0abab5"),
      tiffanyStrong: readCssVariable("--tyy-tiffany-strong", "#078e89"),
      orange: readCssVariable("--tyy-orange", "#ff8a3d"),
      orangeStrong: readCssVariable("--tyy-orange-strong", "#e96f22"),
      heading: readCssVariable("--tyy-heading", "#24313b"),
      text: readCssVariable("--tyy-text", "#394751"),
      muted: readCssVariable("--tyy-text-muted", "#6f7d86"),
      border: readCssVariable("--tyy-border", "#dfe9eb"),
      surface: readCssVariable("--tyy-surface", "#ffffff"),
      success: readCssVariable("--tyy-success", "#23a566"),
      danger: readCssVariable("--tyy-danger", "#e85769"),
      warning: readCssVariable("--tyy-warning", "#e98b2a"),
      info: readCssVariable("--tyy-info", "#3c8fd9")
    };
  }

  function hexToRgba(color, alpha) {
    if (!color || !color.startsWith("#")) {
      return color;
    }

    let hex = color.substring(1);

    if (hex.length === 3) {
      hex = hex
        .split("")
        .map(character => character + character)
        .join("");
    }

    const number = parseInt(hex, 16);
    const red = (number >> 16) & 255;
    const green = (number >> 8) & 255;
    const blue = number & 255;

    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }

  function parsePayload() {
    const dataNode = document.getElementById("kneeQualityData");

    if (!dataNode) {
      return null;
    }

    try {
      return JSON.parse(dataNode.textContent);
    } catch (error) {
      console.error("人工膝關節分析資料解析失敗：", error);
      return null;
    }
  }

  function numberValue(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function finiteChartValue(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function chartContextValue(context, axis = "y") {
    if (!context) {
      return null;
    }

    if (typeof context.raw === "number") {
      return finiteChartValue(context.raw);
    }

    if (context.raw && typeof context.raw === "object") {
      const rawValue = finiteChartValue(context.raw[axis]);

      if (rawValue !== null) {
        return rawValue;
      }
    }

    if (typeof context.parsed === "number") {
      return finiteChartValue(context.parsed);
    }

    if (context.parsed && typeof context.parsed === "object") {
      return finiteChartValue(context.parsed[axis]);
    }

    return null;
  }

  function safeChartItem(items, context) {
    if (!Array.isArray(items) || !context) {
      return null;
    }

    return items[context.dataIndex] || null;
  }

  function weightedRate(records, numeratorKey, denominatorKey) {
    const numerator = records.reduce(
      (sum, record) => sum + numberValue(record[numeratorKey]),
      0
    );

    const denominator = records.reduce(
      (sum, record) => sum + numberValue(record[denominatorKey]),
      0
    );

    if (denominator <= 0) {
      return 0;
    }

    return numerator / denominator * 100;
  }

  function weightedAverage(records, valueKey, weightKey) {
    let weightedSum = 0;
    let totalWeight = 0;

    records.forEach(record => {
      const value = numberValue(record[valueKey]);
      const weight = numberValue(record[weightKey]);

      weightedSum += value * weight;
      totalWeight += weight;
    });

    return totalWeight > 0
      ? weightedSum / totalWeight
      : 0;
  }


  function createDefaultScatterZoomStates() {
    return {
      volume: {
        mode: "all",
        xMin: null,
        xMax: null,
        yMin: null,
        yMax: null
      },
      age: {
        mode: "all",
        xMin: null,
        xMax: null,
        yMin: null,
        yMax: null
      },
      catastrophic: {
        mode: "all",
        xMin: null,
        xMax: null,
        yMin: null,
        yMax: null
      }
    };
  }

  function percentile(values, percentileValue) {
    const validValues = values
      .map(value => Number(value))
      .filter(value => Number.isFinite(value))
      .sort((first, second) => first - second);

    if (validValues.length === 0) {
      return null;
    }

    if (validValues.length === 1) {
      return validValues[0];
    }

    const position = (validValues.length - 1) * percentileValue;
    const lowerIndex = Math.floor(position);
    const upperIndex = Math.ceil(position);
    const weight = position - lowerIndex;

    if (lowerIndex === upperIndex) {
      return validValues[lowerIndex];
    }

    return validValues[lowerIndex] * (1 - weight)
      + validValues[upperIndex] * weight;
  }

  function paddedRange(minValue, maxValue, paddingRatio = 0.06) {
    if (
      !Number.isFinite(minValue)
      || !Number.isFinite(maxValue)
    ) {
      return {
        min: null,
        max: null
      };
    }

    if (minValue === maxValue) {
      const fallbackPadding = Math.abs(minValue) > 0
        ? Math.abs(minValue) * 0.1
        : 1;

      return {
        min: minValue - fallbackPadding,
        max: maxValue + fallbackPadding
      };
    }

    const padding = (maxValue - minValue) * paddingRatio;

    return {
      min: minValue - padding,
      max: maxValue + padding
    };
  }

  function getScatterExtent(points) {
    const xValues = points
      .map(point => Number(point.x))
      .filter(value => Number.isFinite(value));
    const yValues = points
      .map(point => Number(point.y))
      .filter(value => Number.isFinite(value));

    return {
      xMin: xValues.length ? Math.min(...xValues) : null,
      xMax: xValues.length ? Math.max(...xValues) : null,
      yMin: yValues.length ? Math.min(...yValues) : null,
      yMax: yValues.length ? Math.max(...yValues) : null
    };
  }

  function getScatterZoomBounds(chartKey, points) {
    const state = scatterZoomStates[chartKey]
      || createDefaultScatterZoomStates()[chartKey];
    const extent = getScatterExtent(points);

    let bounds = {
      xMin: null,
      xMax: null,
      yMin: null,
      yMax: null
    };

    if (state.mode === "focus" && points.length > 0) {
      const xValues = points.map(point => point.x);
      const positiveYValues = points
        .map(point => Number(point.y))
        .filter(value => Number.isFinite(value) && value > 0);

      const xRange = paddedRange(
        percentile(xValues, 0.05),
        percentile(xValues, 0.95)
      );

      let focusedYMax = percentile(
        positiveYValues.length >= 5
          ? positiveYValues
          : points.map(point => point.y),
        0.95
      );

      if (!Number.isFinite(focusedYMax) || focusedYMax <= 0) {
        focusedYMax = extent.yMax;
      }

      if (!Number.isFinite(focusedYMax) || focusedYMax <= 0) {
        focusedYMax = 1;
      }

      bounds = {
        xMin: xRange.min,
        xMax: xRange.max,
        yMin: 0,
        yMax: focusedYMax * 1.08
      };
    } else if (state.mode === "low") {
      bounds = {
        xMin: null,
        xMax: null,
        yMin: 0,
        yMax: 1
      };
    } else if (state.mode === "custom") {
      bounds = {
        xMin: state.xMin,
        xMax: state.xMax,
        yMin: state.yMin,
        yMax: state.yMax
      };
    }

    const visibleCount = points.filter(point => {
      const xValue = Number(point.x);
      const yValue = Number(point.y);

      if (!Number.isFinite(xValue) || !Number.isFinite(yValue)) {
        return false;
      }

      if (bounds.xMin !== null && xValue < bounds.xMin) {
        return false;
      }

      if (bounds.xMax !== null && xValue > bounds.xMax) {
        return false;
      }

      if (bounds.yMin !== null && yValue < bounds.yMin) {
        return false;
      }

      if (bounds.yMax !== null && yValue > bounds.yMax) {
        return false;
      }

      return true;
    }).length;

    return {
      ...bounds,
      extent,
      mode: state.mode,
      visibleCount,
      totalCount: points.length
    };
  }

  function formatScatterAxisValue(value, suffix = "") {
    if (!Number.isFinite(value)) {
      return "自動";
    }

    return `${formatDecimal.format(value)}${suffix}`;
  }

  function updateScatterZoomControlState(
    chartKey,
    zoomBounds,
    xLabel
  ) {
    const toolbar = document.querySelector(
      `.knee-scatter-zoom-toolbar[data-scatter-chart="${chartKey}"]`
    );

    if (!toolbar) {
      return;
    }

    toolbar.querySelectorAll(".knee-scatter-zoom-mode")
      .forEach(button => {
        button.classList.toggle(
          "is-active",
          button.dataset.scatterMode === zoomBounds.mode
        );
      });

    const status = toolbar.querySelector(
      "[data-scatter-status]"
    );

    if (!status) {
      return;
    }

    const modeLabels = {
      all: "完整範圍",
      focus: "聚焦主要資料",
      low: "感染率 0～1%",
      custom: "自訂範圍"
    };

    const xRangeText = (
      zoomBounds.xMin === null
      && zoomBounds.xMax === null
    )
      ? `${xLabel}：完整`
      : `${xLabel}：${formatScatterAxisValue(
          zoomBounds.xMin
        )}～${formatScatterAxisValue(zoomBounds.xMax)}`;

    const yRangeText = (
      zoomBounds.yMin === null
      && zoomBounds.yMax === null
    )
      ? "感染率：完整"
      : `感染率：${formatScatterAxisValue(
          zoomBounds.yMin,
          "%"
        )}～${formatScatterAxisValue(
          zoomBounds.yMax,
          "%"
        )}`;

    status.textContent = (
      `目前：${modeLabels[zoomBounds.mode] || "完整範圍"}；`
      + `${xRangeText}；${yRangeText}；`
      + `畫面內 ${formatInteger.format(zoomBounds.visibleCount)}／`
      + `${formatInteger.format(zoomBounds.totalCount)} 家院所。`
    );
  }

  function getScatterScaleRange(value) {
    return Number.isFinite(value)
      ? value
      : undefined;
  }

  function renderScatterChartByKey(chartKey, records) {
    if (chartKey === "volume") {
      renderVolumeChart(records);
      return;
    }

    if (chartKey === "age") {
      renderAgeChart(records);
      return;
    }

    if (chartKey === "catastrophic") {
      renderCatastrophicChart(records);
    }
  }

  function readOptionalScatterNumber(input) {
    const text = input?.value.trim() || "";

    if (!text) {
      return null;
    }

    const value = Number(text);
    return Number.isFinite(value)
      ? value
      : NaN;
  }

  function readScatterCustomRange(chartKey) {
    const toolbar = document.querySelector(
      `.knee-scatter-zoom-toolbar[data-scatter-chart="${chartKey}"]`
    );

    if (!toolbar) {
      return null;
    }

    const xMin = readOptionalScatterNumber(
      toolbar.querySelector('[data-scatter-field="xMin"]')
    );
    const xMax = readOptionalScatterNumber(
      toolbar.querySelector('[data-scatter-field="xMax"]')
    );
    const yMin = readOptionalScatterNumber(
      toolbar.querySelector('[data-scatter-field="yMin"]')
    );
    const yMax = readOptionalScatterNumber(
      toolbar.querySelector('[data-scatter-field="yMax"]')
    );

    const values = [xMin, xMax, yMin, yMax];

    if (values.some(value => Number.isNaN(value))) {
      window.alert("自訂放大範圍只能輸入數字");
      return null;
    }

    const hasXMin = xMin !== null;
    const hasXMax = xMax !== null;
    const hasYMin = yMin !== null;
    const hasYMax = yMax !== null;

    if (hasXMin !== hasXMax) {
      window.alert("X 軸最小值與最大值必須一起填寫");
      return null;
    }

    if (hasYMin !== hasYMax) {
      window.alert("感染率最小值與最大值必須一起填寫");
      return null;
    }

    if (!hasXMin && !hasYMin) {
      window.alert("請至少設定一組 X 軸或感染率範圍");
      return null;
    }

    if (hasXMin && xMax <= xMin) {
      window.alert("X 軸最大值必須大於最小值");
      return null;
    }

    if (hasYMin && yMax <= yMin) {
      window.alert("感染率最大值必須大於最小值");
      return null;
    }

    return {
      mode: "custom",
      xMin,
      xMax,
      yMin,
      yMax
    };
  }

  function bindScatterZoomControls() {
    document.querySelectorAll(".knee-scatter-zoom-mode")
      .forEach(button => {
        button.addEventListener("click", function () {
          const chartKey = this.dataset.scatterChart;
          const mode = this.dataset.scatterMode || "all";

          if (!scatterZoomStates[chartKey]) {
            return;
          }

          scatterZoomStates[chartKey] = {
            mode,
            xMin: null,
            xMax: null,
            yMin: null,
            yMax: null
          };

          renderScatterChartByKey(
            chartKey,
            filterRecords()
          );
        });
      });

    document.querySelectorAll("[data-scatter-apply]")
      .forEach(button => {
        button.addEventListener("click", function () {
          const chartKey = this.dataset.scatterApply;
          const customRange = readScatterCustomRange(chartKey);

          if (!customRange) {
            return;
          }

          scatterZoomStates[chartKey] = customRange;

          renderScatterChartByKey(
            chartKey,
            filterRecords()
          );
        });
      });

    document.querySelectorAll(".knee-scatter-zoom-toolbar")
      .forEach(toolbar => {
        const chartKey = toolbar.dataset.scatterChart;
        const canvas = document.getElementById(
          chartKey === "volume"
            ? "kneeChartVolume"
            : chartKey === "age"
              ? "kneeChartAge"
              : "kneeChartCatastrophic"
        );

        canvas?.addEventListener("dblclick", function () {
          scatterZoomStates[chartKey] = {
            mode: "all",
            xMin: null,
            xMax: null,
            yMin: null,
            yMax: null
          };

          renderScatterChartByKey(
            chartKey,
            filterRecords()
          );
        });
      });
  }

  function periodSortKey(period) {
    const match = String(period).match(
      /^(\d{4})年(上半年度|全年度)$/
    );

    if (!match) {
      return 0;
    }

    return Number(match[1]) * 10
      + (match[2] === "上半年度" ? 1 : 2);
  }

  function hospitalMatchesSearch(item, query) {
    if (!query) {
      return true;
    }

    const searchableText = `${item.name} ${item.code}`
      .toLocaleLowerCase("zh-TW");

    return searchableText.includes(
      query.toLocaleLowerCase("zh-TW")
    );
  }

  function updateHospitalCompareStatus(visibleCount = null) {
    const status = document.getElementById("kneeHospitalCompareStatus");

    if (!status) {
      return;
    }

    const selectedCount = selectedHospitalCodes.size;
    const visibleText = visibleCount === null
      ? ""
      : `，目前顯示 ${formatInteger.format(visibleCount)} 家`;

    status.textContent = `已選 ${selectedCount}／6 家${visibleText}`;
  }

  function renderHospitalCompareOptions(query = "") {
    const container = document.getElementById("kneeHospitalCompare");

    if (!container || !kneePayload) {
      return;
    }

    const institutions = kneePayload.meta.institutions || [];
    const selectedItems = institutions.filter(item => (
      selectedHospitalCodes.has(item.code)
    ));
    const matchingItems = institutions.filter(item => (
      !selectedHospitalCodes.has(item.code)
      && hospitalMatchesSearch(item, query)
    ));
    const visibleItems = [...selectedItems, ...matchingItems];

    container.innerHTML = "";

    if (visibleItems.length === 0) {
      const empty = document.createElement("div");
      empty.className = "knee-hospital-choice-empty";
      empty.textContent = "找不到符合的院所";
      container.appendChild(empty);
    } else {
      visibleItems.forEach(item => {
        const label = document.createElement("label");
        label.className = "knee-hospital-choice";

        if (selectedHospitalCodes.has(item.code)) {
          label.classList.add("is-selected");
        }

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = item.code;
        checkbox.checked = selectedHospitalCodes.has(item.code);
        checkbox.setAttribute(
          "aria-label",
          `${item.name}（${item.code}）`
        );

        const text = document.createElement("span");
        text.className = "knee-hospital-choice-text";

        const name = document.createElement("strong");
        name.textContent = item.name;

        const code = document.createElement("small");
        code.textContent = item.code;

        text.appendChild(name);
        text.appendChild(code);
        label.appendChild(checkbox);
        label.appendChild(text);
        container.appendChild(label);
      });
    }

    updateHospitalCompareStatus(visibleItems.length);
  }

  function populateSelects() {
    const periodSelect = document.getElementById("kneePeriodFilter");
    const contractSelect = document.getElementById("kneeContractFilter");
    const countySelect = document.getElementById("kneeCountyFilter");
    const hospitalCompare = document.getElementById("kneeHospitalCompare");

    if (periodSelect) {
      kneePayload.meta.periods.forEach(period => {
        const option = new Option(period, period);
        periodSelect.appendChild(option);
      });

      if (kneePayload.meta.periods.length > 0) {
        periodSelect.value = kneePayload.meta.periods[
          kneePayload.meta.periods.length - 1
        ];
      }
    }

    if (contractSelect) {
      kneePayload.meta.contract_types.forEach(item => {
        contractSelect.appendChild(
          new Option(item.label, String(item.value))
        );
      });
    }

    if (countySelect) {
      kneePayload.meta.counties.forEach(item => {
        countySelect.appendChild(
          new Option(item.name, item.code)
        );
      });
    }

    if (hospitalCompare) {
      selectedHospitalCodes = new Set(
        kneePayload.meta.institutions
          .slice(0, 3)
          .map(item => item.code)
      );

      renderHospitalCompareOptions("");
    }
  }

  function currentFilters() {
    return {
      period: document.getElementById("kneePeriodFilter")?.value || "",
      contractType: document.getElementById("kneeContractFilter")?.value || "",
      countyCode: document.getElementById("kneeCountyFilter")?.value || "",
      keyword: (
        document.getElementById("kneeHospitalKeyword")?.value || ""
      ).trim().toLocaleLowerCase("zh-TW"),
      minCases: Number(
        document.getElementById("kneeMinCases")?.value || 0
      ),
      rankingDirection: (
        document.getElementById("kneeRankingDirection")?.value || "low"
      )
    };
  }

  function filterRecords(options = {}) {
    const filters = currentFilters();
    const ignorePeriod = options.ignorePeriod === true;

    return kneePayload.records.filter(record => {
      if (
        !ignorePeriod
        && filters.period
        && record.period !== filters.period
      ) {
        return false;
      }

      if (
        filters.contractType
        && String(record.contract_type) !== filters.contractType
      ) {
        return false;
      }

      if (
        filters.countyCode
        && record.county_code !== filters.countyCode
      ) {
        return false;
      }

      if (filters.keyword) {
        const searchableText = (
          record.institution_name
          + " "
          + record.institution_code
        ).toLocaleLowerCase("zh-TW");

        if (!searchableText.includes(filters.keyword)) {
          return false;
        }
      }

      return true;
    });
  }

  function groupRecords(records, keyGetter) {
    const groups = new Map();

    records.forEach(record => {
      const key = keyGetter(record);

      if (!groups.has(key)) {
        groups.set(key, []);
      }

      groups.get(key).push(record);
    });

    return groups;
  }

  function aggregateHospitalRecords(records) {
    const groups = groupRecords(
      records,
      record => record.institution_code
    );

    const aggregated = [];

    groups.forEach(group => {
      const first = group[0];
      const replacementCases = group.reduce(
        (sum, record) => sum + numberValue(record.replacement_cases),
        0
      );
      const infectionCases = group.reduce(
        (sum, record) => sum + numberValue(record.infection_cases),
        0
      );
      const patientCount = group.reduce(
        (sum, record) => sum + numberValue(record.patient_count),
        0
      );
      const catastrophicCount = group.reduce(
        (sum, record) => sum + numberValue(record.catastrophic_count),
        0
      );

      aggregated.push({
        institution_code: first.institution_code,
        institution_name: first.institution_name,
        county_code: first.county_code,
        county_name: first.county_name,
        contract_type: first.contract_type,
        contract_type_label: first.contract_type_label,
        replacement_cases: replacementCases,
        infection_cases: infectionCases,
        patient_count: patientCount,
        infection_rate: replacementCases > 0
          ? infectionCases / replacementCases * 100
          : 0,
        average_age: weightedAverage(
          group,
          "average_age",
          "patient_count"
        ),
        catastrophic_rate: patientCount > 0
          ? catastrophicCount / patientCount * 100
          : 0,
        surgeon_count: group.reduce(
          (sum, record) => sum + numberValue(record.surgeon_count),
          0
        )
      });
    });

    return aggregated;
  }

  function setText(id, value) {
    const element = document.getElementById(id);

    if (element) {
      element.textContent = value;
    }
  }

  function updateKpis(records) {
    const replacementCases = records.reduce(
      (sum, record) => sum + numberValue(record.replacement_cases),
      0
    );
    const infectionCases = records.reduce(
      (sum, record) => sum + numberValue(record.infection_cases),
      0
    );
    const patientCount = records.reduce(
      (sum, record) => sum + numberValue(record.patient_count),
      0
    );
    const catastrophicCount = records.reduce(
      (sum, record) => sum + numberValue(record.catastrophic_count),
      0
    );
    const surgeonCount = records.reduce(
      (sum, record) => sum + numberValue(record.surgeon_count),
      0
    );
    const institutions = new Set(
      records.map(record => record.institution_code)
    );

    const infectionRate = replacementCases > 0
      ? infectionCases / replacementCases * 100
      : 0;

    const catastrophicRate = patientCount > 0
      ? catastrophicCount / patientCount * 100
      : 0;

    const averageAge = weightedAverage(
      records,
      "average_age",
      "patient_count"
    );

    const casesPerSurgeon = surgeonCount > 0
      ? replacementCases / surgeonCount
      : 0;

    setText("kneeKpiCases", formatInteger.format(replacementCases));
    setText("kneeKpiInfectionRate", `${formatDecimal.format(infectionRate)}%`);
    setText("kneeKpiInstitutions", formatInteger.format(institutions.size));
    setText("kneeKpiAverageAge", `${formatDecimal.format(averageAge)} 歲`);
    setText("kneeKpiCatastrophicRate", `${formatDecimal.format(catastrophicRate)}%`);
    setText("kneeKpiCasesPerSurgeon", formatDecimal.format(casesPerSurgeon));
  }

  function updateFilterSummary(records) {
    const filters = currentFilters();
    const summary = document.getElementById("kneeFilterSummary");

    if (!summary) {
      return;
    }

    const tags = [
      filters.period || "全部期間",
      filters.contractType
        ? kneePayload.meta.contract_types.find(
            item => String(item.value) === filters.contractType
          )?.label || filters.contractType
        : "全部特約類別",
      filters.countyCode
        ? kneePayload.meta.counties.find(
            item => item.code === filters.countyCode
          )?.name || filters.countyCode
        : "全部縣市",
      `${formatInteger.format(records.length)} 列符合條件`
    ];

    if (filters.keyword) {
      tags.splice(3, 0, `搜尋：${filters.keyword}`);
    }

    summary.innerHTML = tags
      .map(tag => `<span>${escapeHtml(tag)}</span>`)
      .join("");
  }

  function destroyChart(key) {
    if (kneeCharts[key]) {
      kneeCharts[key].destroy();
      delete kneeCharts[key];
    }
  }

  function commonChartOptions(extra = {}) {
    const palette = getPalette();

    return {
      responsive: true,
      maintainAspectRatio: false,
      resizeDelay: 120,
      normalized: true,
      animation: {
        duration: 300
      },
      hover: {
        mode: "nearest",
        intersect: false,
        animationDuration: 0
      },
      interaction: {
        mode: "nearest",
        intersect: false
      },
      plugins: {
        legend: {
          labels: {
            color: palette.text,
            usePointStyle: true,
            boxWidth: 10
          }
        },
        tooltip: {
          enabled: true,
          backgroundColor: palette.surface,
          titleColor: palette.heading,
          bodyColor: palette.text,
          borderColor: palette.border,
          borderWidth: 1,
          padding: 11,
          displayColors: true,
          callbacks: {
            title(contexts) {
              if (!contexts || !contexts.length) {
                return "";
              }

              return contexts[0].label || contexts[0].dataset.label || "";
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: palette.muted
          },
          grid: {
            color: hexToRgba(palette.border, 0.55)
          },
          border: {
            color: palette.border
          }
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: palette.muted
          },
          grid: {
            color: hexToRgba(palette.border, 0.55)
          },
          border: {
            color: palette.border
          }
        }
      },
      ...extra
    };
  }

  const kneeCanvasBackgroundPlugin = {
    id: "kneeCanvasBackground",
    beforeDraw: function (chart) {
      const context = chart.ctx;
      const palette = getPalette();

      context.save();
      context.globalCompositeOperation = "destination-over";
      context.fillStyle = palette.surface;
      context.fillRect(0, 0, chart.width, chart.height);
      context.restore();
    }
  };

  function preparePureBarChart(config) {
    const datasets = Array.isArray(config?.data?.datasets)
      ? config.data.datasets
      : [];

    const hasNonBarDataset = datasets.some(dataset => (
      dataset.type && dataset.type !== "bar"
    ));

    const isPureBar = config?.type === "bar" && !hasNonBarDataset;

    if (!isPureBar) {
      return config;
    }

    config.options = config.options || {};

    const horizontal = config.options.indexAxis === "y";
    const exactInteraction = {
      mode: "nearest",
      intersect: true,
      axis: horizontal ? "y" : "x"
    };

    config.options.interaction = exactInteraction;
    config.options.hover = {
      ...exactInteraction,
      animationDuration: 0
    };

    config.options.plugins = config.options.plugins || {};
    config.options.plugins.tooltip = config.options.plugins.tooltip || {};
    config.options.plugins.tooltip.position = "nearest";

    const originalFilter = config.options.plugins.tooltip.filter;
    const originalCallbacks = config.options.plugins.tooltip.callbacks || {};
    const originalTitle = originalCallbacks.title;

    config.options.plugins.tooltip.filter = function (context) {
      const labels = config?.data?.labels || [];
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

    config.options.plugins.tooltip.callbacks = {
      ...originalCallbacks,
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

        const label = config?.data?.labels?.[first.dataIndex];
        return label === undefined || label === null ? "" : String(label);
      }
    };

    return config;
  }

  function makeChart(key, canvasId, config) {
    destroyChart(key);

    const canvas = document.getElementById(canvasId);

    if (!canvas || typeof Chart === "undefined") {
      return;
    }

    const safeConfig = preparePureBarChart(config);
    const chartPlugins = Array.isArray(safeConfig.plugins)
      ? safeConfig.plugins.slice()
      : [];

    chartPlugins.push(kneeCanvasBackgroundPlugin);

    kneeCharts[key] = new Chart(
      canvas.getContext("2d"),
      {
        ...safeConfig,
        plugins: chartPlugins
      }
    );
  }

  function renderTrendChart(records) {
    const palette = getPalette();
    const groups = groupRecords(
      records,
      record => record.period
    );

    const periods = Array.from(groups.keys()).sort(
      (a, b) => periodSortKey(a) - periodSortKey(b)
    );

    const infectionRates = periods.map(period => {
      const group = groups.get(period);
      return weightedRate(
        group,
        "infection_cases",
        "replacement_cases"
      );
    });

    const caseCounts = periods.map(period => {
      return groups.get(period).reduce(
        (sum, record) => sum + numberValue(record.replacement_cases),
        0
      );
    });

    makeChart("trend", "kneeChartTrend", {
      type: "bar",
      data: {
        labels: periods,
        datasets: [
          {
            type: "line",
            label: "加權傷口感染率",
            data: infectionRates,
            yAxisID: "yRate",
            borderColor: palette.orange,
            backgroundColor: hexToRgba(palette.orange, 0.18),
            pointBackgroundColor: palette.orange,
            pointRadius: 3,
            tension: 0.28,
            fill: false
          },
          {
            type: "bar",
            label: "置換案件數",
            data: caseCounts,
            yAxisID: "yCount",
            backgroundColor: hexToRgba(palette.tiffany, 0.62),
            borderColor: palette.tiffanyStrong,
            borderWidth: 1,
            borderRadius: 5
          }
        ]
      },
      options: commonChartOptions({
        interaction: {
          mode: "index",
          intersect: false
        },
        scales: {
          x: {
            type: "category",
            ticks: {
              color: palette.muted,
              maxRotation: 45,
              minRotation: 0
            },
            grid: {
              display: false
            }
          },
          yRate: {
            type: "linear",
            beginAtZero: true,
            position: "left",
            ticks: {
              color: palette.orange,
              callback: value => `${value}%`
            },
            grid: {
              color: hexToRgba(palette.border, 0.55)
            },
            title: {
              display: true,
              text: "感染率",
              color: palette.orange
            }
          },
          yCount: {
            type: "linear",
            beginAtZero: true,
            position: "right",
            ticks: {
              color: palette.tiffanyStrong,
              callback: value => formatInteger.format(value)
            },
            grid: {
              drawOnChartArea: false
            },
            title: {
              display: true,
              text: "案件數",
              color: palette.tiffanyStrong
            }
          }
        },
        plugins: {
          ...commonChartOptions().plugins,
          tooltip: {
            ...commonChartOptions().plugins.tooltip,
            callbacks: {
              label(context) {
                if (context.dataset.yAxisID === "yRate") {
                  return ` ${context.dataset.label}：${formatDecimal.format(context.raw)}%`;
                }

                return ` ${context.dataset.label}：${formatInteger.format(context.raw)}`;
              }
            }
          }
        }
      })
    });
  }

  function aggregateCategory(records, keyGetter, labelGetter) {
    const groups = groupRecords(records, keyGetter);

    return Array.from(groups.entries()).map(([key, group]) => ({
      key,
      label: labelGetter(group[0]),
      rate: weightedRate(group, "infection_cases", "replacement_cases"),
      cases: group.reduce(
        (sum, record) => sum + numberValue(record.replacement_cases),
        0
      ),
      infections: group.reduce(
        (sum, record) => sum + numberValue(record.infection_cases),
        0
      )
    }));
  }

  function renderContractChart(records) {
    const palette = getPalette();
    const items = aggregateCategory(
      records,
      record => String(record.contract_type),
      record => record.contract_type_label
    ).sort((a, b) => a.key.localeCompare(b.key));

    makeChart("contract", "kneeChartContract", {
      type: "bar",
      data: {
        labels: items.map(item => item.label),
        datasets: [{
          label: "加權傷口感染率",
          data: items.map(item => item.rate),
          backgroundColor: items.map((item, index) => (
            index % 2 === 0
              ? hexToRgba(palette.tiffany, 0.72)
              : hexToRgba(palette.orange, 0.72)
          )),
          borderColor: items.map((item, index) => (
            index % 2 === 0
              ? palette.tiffanyStrong
              : palette.orangeStrong
          )),
          borderWidth: 1,
          borderRadius: 7,
          customItems: items
        }]
      },
      options: commonChartOptions({
        plugins: {
          ...commonChartOptions().plugins,
          tooltip: {
            ...commonChartOptions().plugins.tooltip,
            callbacks: {
              label(context) {
                const item = items[context.dataIndex];
                return [
                  ` 感染率：${formatDecimal.format(item.rate)}%`,
                  ` 置換案件：${formatInteger.format(item.cases)}`,
                  ` 感染案件：${formatInteger.format(item.infections)}`
                ];
              }
            }
          }
        },
        scales: {
          x: {
            type: "category",
            ticks: { color: palette.muted },
            grid: { display: false }
          },
          y: {
            type: "linear",
            beginAtZero: true,
            ticks: {
              color: palette.muted,
              callback: value => `${value}%`
            },
            grid: {
              color: hexToRgba(palette.border, 0.55)
            }
          }
        }
      })
    });
  }

  function renderCountyChart(records) {
    const palette = getPalette();
    const items = aggregateCategory(
      records,
      record => record.county_code,
      record => record.county_name
    )
      .filter(item => item.cases > 0)
      .sort((a, b) => a.rate - b.rate);

    makeChart("county", "kneeChartCounty", {
      type: "bar",
      data: {
        labels: items.map(item => item.label),
        datasets: [{
          label: "加權傷口感染率",
          data: items.map(item => item.rate),
          backgroundColor: hexToRgba(palette.tiffany, 0.68),
          borderColor: palette.tiffanyStrong,
          borderWidth: 1,
          borderRadius: 5
        }]
      },
      options: commonChartOptions({
        indexAxis: "y",
        plugins: {
          ...commonChartOptions().plugins,
          legend: {
            display: false
          },
          tooltip: {
            ...commonChartOptions().plugins.tooltip,
            callbacks: {
              label(context) {
                const item = items[context.dataIndex];
                return [
                  ` 感染率：${formatDecimal.format(item.rate)}%`,
                  ` 置換案件：${formatInteger.format(item.cases)}`,
                  ` 感染案件：${formatInteger.format(item.infections)}`
                ];
              }
            }
          }
        },
        scales: {
          x: {
            type: "linear",
            beginAtZero: true,
            ticks: {
              color: palette.muted,
              callback: value => `${value}%`
            },
            grid: {
              color: hexToRgba(palette.border, 0.55)
            }
          },
          y: {
            type: "category",
            ticks: {
              color: palette.text,
              autoSkip: false
            },
            grid: {
              display: false
            }
          }
        }
      })
    });
  }

  function renderRankingChart(records) {
    const palette = getPalette();
    const filters = currentFilters();

    let items = aggregateHospitalRecords(records)
      .filter(item => item.replacement_cases >= filters.minCases);

    items.sort((a, b) => (
      filters.rankingDirection === "high"
        ? b.infection_rate - a.infection_rate
        : a.infection_rate - b.infection_rate
    ));

    items = items.slice(0, 15);

    makeChart("ranking", "kneeChartRanking", {
      type: "bar",
      data: {
        labels: items.map(item => item.institution_name),
        datasets: [{
          label: "加權傷口感染率",
          data: items.map(item => item.infection_rate),
          backgroundColor: items.map(item => (
            item.infection_rate <= 0.5
              ? hexToRgba(palette.success, 0.72)
              : item.infection_rate <= 2
                ? hexToRgba(palette.orange, 0.72)
                : hexToRgba(palette.danger, 0.72)
          )),
          borderWidth: 0,
          borderRadius: 5
        }]
      },
      options: commonChartOptions({
        indexAxis: "y",
        plugins: {
          ...commonChartOptions().plugins,
          legend: {
            display: false
          },
          tooltip: {
            ...commonChartOptions().plugins.tooltip,
            callbacks: {
              title(context) {
                const item = context && context.length
                  ? safeChartItem(items, context[0])
                  : null;
                return item ? item.institution_name : "";
              },
              label(context) {
                const item = safeChartItem(items, context);

                if (!item) {
                  return " 資料無法讀取";
                }

                return [
                  ` 感染率：${formatDecimal.format(item.infection_rate)}%`,
                  ` 置換案件：${formatInteger.format(item.replacement_cases)}`,
                  ` 醫事代碼：${item.institution_code}`
                ];
              }
            }
          }
        },
        scales: {
          x: {
            type: "linear",
            beginAtZero: true,
            ticks: {
              color: palette.muted,
              callback: value => `${value}%`
            },
            grid: {
              color: hexToRgba(palette.border, 0.55)
            }
          },
          y: {
            type: "category",
            ticks: {
              color: palette.text,
              autoSkip: false,
              callback(value) {
                const label = this.getLabelForValue(value);
                return label.length > 16
                  ? `${label.substring(0, 16)}…`
                  : label;
              }
            },
            grid: {
              display: false
            }
          }
        }
      })
    });
  }

  function scatterTooltip(items, xLabel, yLabel) {
    return {
      callbacks: {
        title(context) {
          const item = context && context.length
            ? safeChartItem(items, context[0])
            : null;

          return item ? item.institution_name : "";
        },
        label(context) {
          const item = safeChartItem(items, context);
          const xValue = chartContextValue(context, "x");
          const yValue = chartContextValue(context, "y");

          if (!item) {
            return " 資料無法讀取";
          }

          return [
            ` ${xLabel}：${xValue === null ? "—" : formatDecimal.format(xValue)}`,
            ` ${yLabel}：${yValue === null ? "—" : formatDecimal.format(yValue) + "%"}`,
            ` 置換案件：${formatInteger.format(item.replacement_cases)}`,
            ` 醫事代碼：${item.institution_code}`
          ];
        }
      }
    };
  }

  function renderVolumeChart(records) {
    const palette = getPalette();
    const items = aggregateHospitalRecords(records);
    const points = items.map(item => ({
      x: item.replacement_cases,
      y: item.infection_rate
    }));
    const zoomBounds = getScatterZoomBounds(
      "volume",
      points
    );

    makeChart("volume", "kneeChartVolume", {
      type: "scatter",
      data: {
        datasets: [{
          label: "院所",
          data: points,
          backgroundColor: hexToRgba(palette.tiffany, 0.68),
          borderColor: palette.tiffanyStrong,
          pointRadius: 4,
          pointHoverRadius: 7
        }]
      },
      options: commonChartOptions({
        plugins: {
          ...commonChartOptions().plugins,
          tooltip: {
            ...commonChartOptions().plugins.tooltip,
            ...scatterTooltip(items, "置換案件", "感染率")
          }
        },
        scales: {
          x: {
            type: "linear",
            beginAtZero: zoomBounds.xMin === null,
            min: getScatterScaleRange(zoomBounds.xMin),
            max: getScatterScaleRange(zoomBounds.xMax),
            title: {
              display: true,
              text: "置換案件數",
              color: palette.text
            },
            ticks: {
              color: palette.muted,
              callback: value => formatInteger.format(value)
            },
            grid: {
              color: hexToRgba(palette.border, 0.55)
            }
          },
          y: {
            type: "linear",
            beginAtZero: zoomBounds.yMin === null,
            min: getScatterScaleRange(zoomBounds.yMin),
            max: getScatterScaleRange(zoomBounds.yMax),
            title: {
              display: true,
              text: "感染率",
              color: palette.text
            },
            ticks: {
              color: palette.muted,
              callback: value => `${value}%`
            },
            grid: {
              color: hexToRgba(palette.border, 0.55)
            }
          }
        }
      })
    });

    updateScatterZoomControlState(
      "volume",
      zoomBounds,
      "置換案件數"
    );
  }

  function renderAgeChart(records) {
    const palette = getPalette();
    const items = aggregateHospitalRecords(records);
    const points = items.map(item => ({
      x: item.average_age,
      y: item.infection_rate
    }));
    const zoomBounds = getScatterZoomBounds(
      "age",
      points
    );

    makeChart("age", "kneeChartAge", {
      type: "scatter",
      data: {
        datasets: [{
          label: "院所",
          data: points,
          backgroundColor: hexToRgba(palette.orange, 0.68),
          borderColor: palette.orangeStrong,
          pointRadius: 4,
          pointHoverRadius: 7
        }]
      },
      options: commonChartOptions({
        plugins: {
          ...commonChartOptions().plugins,
          tooltip: {
            ...commonChartOptions().plugins.tooltip,
            ...scatterTooltip(items, "平均年齡", "感染率")
          }
        },
        scales: {
          x: {
            type: "linear",
            min: getScatterScaleRange(zoomBounds.xMin),
            max: getScatterScaleRange(zoomBounds.xMax),
            title: {
              display: true,
              text: "病患平均年齡",
              color: palette.text
            },
            ticks: {
              color: palette.muted
            },
            grid: {
              color: hexToRgba(palette.border, 0.55)
            }
          },
          y: {
            type: "linear",
            beginAtZero: zoomBounds.yMin === null,
            min: getScatterScaleRange(zoomBounds.yMin),
            max: getScatterScaleRange(zoomBounds.yMax),
            title: {
              display: true,
              text: "感染率",
              color: palette.text
            },
            ticks: {
              color: palette.muted,
              callback: value => `${value}%`
            },
            grid: {
              color: hexToRgba(palette.border, 0.55)
            }
          }
        }
      })
    });

    updateScatterZoomControlState(
      "age",
      zoomBounds,
      "平均年齡"
    );
  }

  function renderCatastrophicChart(records) {
    const palette = getPalette();
    const items = aggregateHospitalRecords(records);
    const points = items.map(item => ({
      x: item.catastrophic_rate,
      y: item.infection_rate
    }));
    const zoomBounds = getScatterZoomBounds(
      "catastrophic",
      points
    );

    makeChart("catastrophic", "kneeChartCatastrophic", {
      type: "scatter",
      data: {
        datasets: [{
          label: "院所",
          data: points,
          backgroundColor: hexToRgba(palette.info, 0.68),
          borderColor: palette.info,
          pointRadius: 4,
          pointHoverRadius: 7
        }]
      },
      options: commonChartOptions({
        plugins: {
          ...commonChartOptions().plugins,
          tooltip: {
            ...commonChartOptions().plugins.tooltip,
            ...scatterTooltip(items, "重大傷病比例", "感染率")
          }
        },
        scales: {
          x: {
            type: "linear",
            beginAtZero: zoomBounds.xMin === null,
            min: getScatterScaleRange(zoomBounds.xMin),
            max: getScatterScaleRange(zoomBounds.xMax),
            title: {
              display: true,
              text: "重大傷病比例",
              color: palette.text
            },
            ticks: {
              color: palette.muted,
              callback: value => `${value}%`
            },
            grid: {
              color: hexToRgba(palette.border, 0.55)
            }
          },
          y: {
            type: "linear",
            beginAtZero: zoomBounds.yMin === null,
            min: getScatterScaleRange(zoomBounds.yMin),
            max: getScatterScaleRange(zoomBounds.yMax),
            title: {
              display: true,
              text: "感染率",
              color: palette.text
            },
            ticks: {
              color: palette.muted,
              callback: value => `${value}%`
            },
            grid: {
              color: hexToRgba(palette.border, 0.55)
            }
          }
        }
      })
    });

    updateScatterZoomControlState(
      "catastrophic",
      zoomBounds,
      "重大傷病比例"
    );
  }

  function getDistributionCustomRange() {
    const minInput = document.getElementById("kneeDistributionMin");
    const maxInput = document.getElementById("kneeDistributionMax");

    const minValue = Number(minInput?.value ?? 0);
    const maxValue = Number(maxInput?.value ?? 1);

    if (
      !Number.isFinite(minValue)
      || !Number.isFinite(maxValue)
      || minValue < 0
      || maxValue <= minValue
    ) {
      return null;
    }

    return {
      min: minValue,
      max: maxValue
    };
  }

  function setDistributionControlState(mode, statusText = "") {
    document.querySelectorAll(".knee-distribution-mode")
      .forEach(button => {
        button.classList.toggle(
          "is-active",
          button.dataset.distributionMode === mode
        );
      });

    const status = document.getElementById("kneeDistributionStatus");

    if (status && statusText) {
      status.textContent = statusText;
    }
  }

  function createCustomDistributionBuckets(minValue, maxValue) {
    const bucketCount = 8;
    const step = (maxValue - minValue) / bucketCount;
    const buckets = [];

    for (let index = 0; index < bucketCount; index += 1) {
      const bucketMin = minValue + step * index;
      const bucketMax = index === bucketCount - 1
        ? maxValue + Number.EPSILON
        : minValue + step * (index + 1);

      buckets.push({
        label: `${formatDecimal.format(bucketMin)}～${formatDecimal.format(
          index === bucketCount - 1 ? maxValue : bucketMax
        )}%`,
        min: bucketMin,
        max: bucketMax,
        count: 0
      });
    }

    return buckets;
  }

  function renderDistributionChart(records) {
    const palette = getPalette();
    const hospitals = aggregateHospitalRecords(records);
    const modeSelect = document.getElementById("kneeDistributionMode");
    let mode = modeSelect?.value || "all";

    let buckets = [];
    let filteredHospitals = hospitals;
    let customRange = null;

    if (mode === "custom") {
      customRange = getDistributionCustomRange();

      if (!customRange) {
        mode = "all";

        if (modeSelect) {
          modeSelect.value = mode;
        }
      }
    }

    if (mode === "low") {
      filteredHospitals = hospitals.filter(hospital => (
        hospital.infection_rate > 0
        && hospital.infection_rate <= 1
      ));

      buckets = [
        { label: "0～0.1%", min: 0, max: 0.1, count: 0 },
        { label: "0.1～0.2%", min: 0.1, max: 0.2, count: 0 },
        { label: "0.2～0.3%", min: 0.2, max: 0.3, count: 0 },
        { label: "0.3～0.4%", min: 0.3, max: 0.4, count: 0 },
        { label: "0.4～0.5%", min: 0.4, max: 0.5, count: 0 },
        { label: "0.5～0.75%", min: 0.5, max: 0.75, count: 0 },
        { label: "0.75～1%", min: 0.75, max: 1.000001, count: 0 }
      ];
    } else if (mode === "nonzero") {
      filteredHospitals = hospitals.filter(hospital => (
        hospital.infection_rate > 0
      ));

      buckets = [
        { label: "0～0.25%", min: 0, max: 0.25, count: 0 },
        { label: "0.25～0.5%", min: 0.25, max: 0.5, count: 0 },
        { label: "0.5～1%", min: 0.5, max: 1, count: 0 },
        { label: "1～2%", min: 1, max: 2, count: 0 },
        { label: "2～3%", min: 2, max: 3, count: 0 },
        { label: "3～5%", min: 3, max: 5, count: 0 },
        { label: "5%以上", min: 5, max: Infinity, count: 0 }
      ];
    } else if (mode === "custom" && customRange) {
      filteredHospitals = hospitals.filter(hospital => (
        hospital.infection_rate >= customRange.min
        && hospital.infection_rate <= customRange.max
      ));

      buckets = createCustomDistributionBuckets(
        customRange.min,
        customRange.max
      );
    } else {
      buckets = [
        { label: "0%", min: 0, max: 0.000001, count: 0 },
        { label: "0～0.5%", min: 0.000001, max: 0.5, count: 0 },
        { label: "0.5～1%", min: 0.5, max: 1, count: 0 },
        { label: "1～2%", min: 1, max: 2, count: 0 },
        { label: "2～3%", min: 2, max: 3, count: 0 },
        { label: "3～5%", min: 3, max: 5, count: 0 },
        { label: "5%以上", min: 5, max: Infinity, count: 0 }
      ];
    }

    filteredHospitals.forEach(hospital => {
      const rate = hospital.infection_rate;

      if (mode === "all" && rate === 0) {
        buckets[0].count += 1;
        return;
      }

      const bucket = buckets.find(item => (
        rate >= item.min && rate < item.max
      ));

      if (bucket) {
        bucket.count += 1;
      }
    });

    const modeLabels = {
      all: "完整分布",
      nonzero: "排除 0% 後放大",
      low: "0～1% 低值細分",
      custom: customRange
        ? `${formatDecimal.format(customRange.min)}～${formatDecimal.format(customRange.max)}% 自訂範圍`
        : "自訂範圍"
    };

    setDistributionControlState(
      mode,
      `目前模式：${modeLabels[mode]}；範圍內共有 ${formatInteger.format(filteredHospitals.length)} 家院所。`
    );

    makeChart("distribution", "kneeChartDistribution", {
      type: "bar",
      data: {
        labels: buckets.map(bucket => bucket.label),
        datasets: [{
          label: `院所數（${modeLabels[mode]}）`,
          data: buckets.map(bucket => bucket.count),
          backgroundColor: buckets.map((bucket, index) => (
            index < 3
              ? hexToRgba(palette.success, 0.68)
              : index < 5
                ? hexToRgba(palette.orange, 0.68)
                : hexToRgba(palette.danger, 0.68)
          )),
          borderWidth: 0,
          borderRadius: 6
        }]
      },
      options: commonChartOptions({
        plugins: {
          ...commonChartOptions().plugins,
          legend: {
            display: false
          },
          tooltip: {
            ...commonChartOptions().plugins.tooltip,
            callbacks: {
              title(contexts) {
                return contexts?.[0]?.label || "";
              },
              label(context) {
                return ` 院所數：${formatInteger.format(context.raw)}`;
              },
              afterBody() {
                return `顯示模式：${modeLabels[mode]}`;
              }
            }
          }
        },
        scales: {
          x: {
            type: "category",
            ticks: {
              color: palette.text
            },
            grid: {
              display: false
            }
          },
          y: {
            type: "linear",
            beginAtZero: true,
            ticks: {
              color: palette.muted,
              precision: 0
            },
            grid: {
              color: hexToRgba(palette.border, 0.55)
            }
          }
        }
      })
    });
  }

  function renderHospitalTrendChart(records) {
    const palette = getPalette();
    const compareContainer = document.getElementById("kneeHospitalCompare");

    if (!compareContainer) {
      return;
    }

    const selectedCodes = Array.from(selectedHospitalCodes)
      .slice(0, 6);

    const periods = Array.from(
      new Set(records.map(record => record.period))
    ).sort((a, b) => periodSortKey(a) - periodSortKey(b));

    const colors = [
      palette.tiffany,
      palette.orange,
      palette.info,
      palette.success,
      palette.danger,
      palette.warning
    ];

    const datasets = selectedCodes.map((code, index) => {
      const institutionRecords = records.filter(
        record => record.institution_code === code
      );

      const institutionName = institutionRecords[0]?.institution_name || code;

      const rateByPeriod = new Map();

      institutionRecords.forEach(record => {
        rateByPeriod.set(
          record.period,
          numberValue(record.infection_rate)
        );
      });

      return {
        label: institutionName,
        data: periods.map(period => (
          rateByPeriod.has(period)
            ? rateByPeriod.get(period)
            : null
        )),
        borderColor: colors[index % colors.length],
        backgroundColor: hexToRgba(
          colors[index % colors.length],
          0.12
        ),
        pointRadius: 3,
        tension: 0.25,
        spanGaps: true
      };
    });

    makeChart("hospitalTrend", "kneeHospitalTrendChart", {
      type: "line",
      data: {
        labels: periods,
        datasets
      },
      options: commonChartOptions({
        interaction: {
          mode: "index",
          intersect: false
        },
        plugins: {
          ...commonChartOptions().plugins,
          tooltip: {
            ...commonChartOptions().plugins.tooltip,
            callbacks: {
              label(context) {
                const value = chartContextValue(context, "y");

                if (value === null) {
                  return ` ${context.dataset.label}：無資料`;
                }

                return ` ${context.dataset.label}：${formatDecimal.format(value)}%`;
              }
            }
          }
        },
        scales: {
          x: {
            type: "category",
            ticks: {
              color: palette.muted,
              maxRotation: 45
            },
            grid: {
              display: false
            }
          },
          y: {
            type: "linear",
            beginAtZero: true,
            ticks: {
              color: palette.muted,
              callback: value => `${value}%`
            },
            grid: {
              color: hexToRgba(palette.border, 0.55)
            }
          }
        }
      })
    });
  }

  function rateClass(rate) {
    if (rate <= 0.5) {
      return "knee-rate-good";
    }

    if (rate <= 2) {
      return "knee-rate-watch";
    }

    return "knee-rate-high";
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function renderTable(records) {
    const tableBody = document.getElementById("kneeTableBody");
    const tableCount = document.getElementById("kneeTableCount");
    const pageLabel = document.getElementById("kneeTablePage");
    const previousButton = document.getElementById("kneeTablePrev");
    const nextButton = document.getElementById("kneeTableNext");

    if (!tableBody) {
      return;
    }

    const sortedRecords = [...records].sort((a, b) => (
      periodSortKey(b.period) - periodSortKey(a.period)
      || a.institution_name.localeCompare(
        b.institution_name,
        "zh-TW"
      )
    ));

    const totalPages = Math.max(
      1,
      Math.ceil(sortedRecords.length / kneeTablePageSize)
    );

    if (kneeTablePage > totalPages) {
      kneeTablePage = totalPages;
    }

    const startIndex = (
      kneeTablePage - 1
    ) * kneeTablePageSize;

    const pageRecords = sortedRecords.slice(
      startIndex,
      startIndex + kneeTablePageSize
    );

    const isEditable = kneePayload.dataset.is_editable;

    tableBody.innerHTML = pageRecords.map(record => {
      const actionCell = isEditable
        ? `<td><button type="button" class="btn btn-sm btn-outline-danger knee-delete-record" data-record-id="${record.id}">刪除</button></td>`
        : "";

      return `
        <tr>
          <td>${escapeHtml(record.period)}</td>
          <td>
            <strong>${escapeHtml(record.institution_name)}</strong>
            <small class="d-block text-muted">${escapeHtml(record.institution_code)}</small>
          </td>
          <td>${escapeHtml(record.contract_type_label)}</td>
          <td>${escapeHtml(record.county_name)}</td>
          <td>${formatInteger.format(record.replacement_cases)}</td>
          <td>${formatInteger.format(record.infection_cases)}</td>
          <td class="${rateClass(record.infection_rate)}">${formatDecimal.format(record.infection_rate)}%</td>
          <td>${formatDecimal.format(record.average_age)}</td>
          <td>${formatDecimal.format(record.catastrophic_rate)}%</td>
          ${actionCell}
        </tr>
      `;
    }).join("");

    if (pageRecords.length === 0) {
      const columnCount = isEditable ? 10 : 9;

      tableBody.innerHTML = `
        <tr>
          <td colspan="${columnCount}" class="text-center text-muted py-4">
            沒有符合目前條件的資料
          </td>
        </tr>
      `;
    }

    if (tableCount) {
      tableCount.textContent = `共 ${formatInteger.format(sortedRecords.length)} 列`;
    }

    if (pageLabel) {
      pageLabel.textContent = `第 ${kneeTablePage}／${totalPages} 頁`;
    }

    if (previousButton) {
      previousButton.disabled = kneeTablePage <= 1;
    }

    if (nextButton) {
      nextButton.disabled = kneeTablePage >= totalPages;
    }

    tableBody.querySelectorAll(".knee-delete-record")
      .forEach(button => {
        button.addEventListener("click", function () {
          const recordId = this.dataset.recordId;

          if (!window.confirm("確定刪除這筆資料嗎？")) {
            return;
          }

          const hiddenInput = document.getElementById("kneeDeleteRecordId");
          const form = document.getElementById("kneeDeleteRecordForm");

          if (hiddenInput && form) {
            hiddenInput.value = recordId;
            submitPageForm(form);
          }
        });
      });
  }

  function renderAll() {
    const snapshotRecords = filterRecords();
    const trendRecords = filterRecords({
      ignorePeriod: true
    });

    kneeFilteredRecords = snapshotRecords;
    kneeTablePage = 1;

    updateKpis(snapshotRecords);
    updateFilterSummary(snapshotRecords);
    renderTrendChart(trendRecords);
    renderContractChart(snapshotRecords);
    renderCountyChart(snapshotRecords);
    renderRankingChart(snapshotRecords);
    renderVolumeChart(snapshotRecords);
    renderAgeChart(snapshotRecords);
    renderCatastrophicChart(snapshotRecords);
    renderDistributionChart(snapshotRecords);
    renderHospitalTrendChart(trendRecords);
    renderTable(snapshotRecords);
  }

  function rerenderChartsForTheme() {
    if (!getRoot() || !kneePayload) {
      return;
    }

    const currentPage = kneeTablePage;
    const snapshotRecords = filterRecords();
    const trendRecords = filterRecords({
      ignorePeriod: true
    });

    renderTrendChart(trendRecords);
    renderContractChart(snapshotRecords);
    renderCountyChart(snapshotRecords);
    renderRankingChart(snapshotRecords);
    renderVolumeChart(snapshotRecords);
    renderAgeChart(snapshotRecords);
    renderCatastrophicChart(snapshotRecords);
    renderDistributionChart(snapshotRecords);
    renderHospitalTrendChart(trendRecords);

    kneeTablePage = currentPage;
  }

  function sanitizeCsvCell(value) {
    const text = String(value ?? "");

    if (/^[=+\-@]/.test(text)) {
      return `'${text}`;
    }

    return text;
  }

  function downloadFilteredCsv() {
    if (!kneeFilteredRecords.length) {
      window.alert("目前沒有可匯出的篩選資料");
      return;
    }

    const headers = [
      "年度",
      "醫事機構代碼",
      "院所名稱",
      "特約類別",
      "人工膝關節置換後90天內發生手術傷口感染之案件數",
      "人工膝關節置換案件數",
      "人工膝關節置換病人數",
      "傷口感染率",
      "人工膝關節置換醫師數",
      "病患平均年齡",
      "病患重大傷病比率",
      "分母重大傷病人數",
      "縣市別",
      "鄉鎮別"
    ];

    const rows = kneeFilteredRecords.map(record => [
      record.period,
      record.institution_code,
      record.institution_name,
      record.contract_type,
      record.infection_cases,
      record.replacement_cases,
      record.patient_count,
      `${record.infection_rate.toFixed(2)}%`,
      record.surgeon_count,
      record.average_age.toFixed(4),
      `${record.catastrophic_rate.toFixed(2)}%`,
      record.catastrophic_count,
      record.county_code,
      record.township_code
    ]);

    const csvLines = [headers, ...rows].map(row => (
      row.map(value => {
        const text = sanitizeCsvCell(value).replaceAll('"', '""');
        return `"${text}"`;
      }).join(",")
    ));

    const blob = new Blob(
      ["\ufeff" + csvLines.join("\n")],
      { type: "text/csv;charset=utf-8" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `knee_quality_filtered_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function bindFilterCollapse() {
    const root = getRoot();
    const card = root?.querySelector(".knee-filter-card");
    const button = document.getElementById("kneeToggleFilters");

    if (!card || !button) {
      return;
    }

    const storageKey = "tyy_knee_filters_collapsed";

    function applyState(collapsed) {
      card.classList.toggle("knee-filter-collapsed", collapsed);
      button.setAttribute("aria-expanded", String(!collapsed));
      button.innerHTML = collapsed
        ? '<i class="fa fa-expand"></i> 展開條件'
        : '<i class="fa fa-compress"></i> 收合條件';
    }

    applyState(sessionStorage.getItem(storageKey) === "true");

    button.addEventListener("click", function () {
      const collapsed = !card.classList.contains("knee-filter-collapsed");
      applyState(collapsed);
      sessionStorage.setItem(storageKey, String(collapsed));
    });
  }

  function bindFilters() {
    [
      "kneePeriodFilter",
      "kneeContractFilter",
      "kneeCountyFilter",
      "kneeMinCases",
      "kneeRankingDirection"
    ].forEach(id => {
      document.getElementById(id)?.addEventListener(
        "change",
        renderAll
      );
    });

    let keywordTimer = null;

    document.getElementById("kneeHospitalKeyword")
      ?.addEventListener("input", function () {
        window.clearTimeout(keywordTimer);
        keywordTimer = window.setTimeout(renderAll, 180);
      });

    document.getElementById("kneeResetFilters")
      ?.addEventListener("click", function () {
        const periodSelect = document.getElementById("kneePeriodFilter");

        if (periodSelect && kneePayload.meta.periods.length > 0) {
          periodSelect.value = kneePayload.meta.periods[
            kneePayload.meta.periods.length - 1
          ];
        }

        document.getElementById("kneeContractFilter").value = "";
        document.getElementById("kneeCountyFilter").value = "";
        document.getElementById("kneeHospitalKeyword").value = "";
        document.getElementById("kneeMinCases").value = "20";
        document.getElementById("kneeRankingDirection").value = "low";

        renderAll();
      });

    document.getElementById("kneeChartDensity")
      ?.addEventListener("change", function () {
        const root = getRoot();

        if (!root) {
          return;
        }

        root.dataset.chartDensity = this.value;

        window.setTimeout(() => {
          Object.values(kneeCharts).forEach(chart => chart.resize());
        }, 220);
      });

    const compareSearch = document.getElementById("kneeHospitalCompareSearch");

    compareSearch?.addEventListener("input", function () {
      renderHospitalCompareOptions(this.value.trim());
    });

    document.getElementById("kneeHospitalCompareClear")
      ?.addEventListener("click", function () {
        if (compareSearch) {
          compareSearch.value = "";
        }

        renderHospitalCompareOptions("");
      });

    document.getElementById("kneeHospitalCompare")
      ?.addEventListener("change", function (event) {
        const checkbox = event.target.closest(
          'input[type="checkbox"]'
        );

        if (!checkbox) {
          return;
        }

        const code = checkbox.value;

        if (checkbox.checked) {
          if (selectedHospitalCodes.size >= 6) {
            checkbox.checked = false;
            window.alert("最多只能比較 6 家院所，請先取消一間再選擇。");
            return;
          }

          selectedHospitalCodes.add(code);
        } else {
          selectedHospitalCodes.delete(code);
        }

        renderHospitalCompareOptions(
          compareSearch?.value.trim() || ""
        );

        renderHospitalTrendChart(
          filterRecords({ ignorePeriod: true })
        );
      });

    const distributionMode = document.getElementById("kneeDistributionMode");

    document.querySelectorAll(".knee-distribution-mode")
      .forEach(button => {
        button.addEventListener("click", function () {
          const mode = this.dataset.distributionMode || "all";

          if (distributionMode) {
            distributionMode.value = mode;
          }

          renderDistributionChart(filterRecords());
        });
      });

    document.getElementById("kneeDistributionApply")
      ?.addEventListener("click", function () {
        const customRange = getDistributionCustomRange();

        if (!customRange) {
          window.alert("自訂範圍必須為 0 以上，而且最大值要大於最小值");
          return;
        }

        if (distributionMode) {
          distributionMode.value = "custom";
        }

        renderDistributionChart(filterRecords());
      });
  }

  function bindDatasetControls() {
    const root = getRoot();
    const pageUrl = root?.dataset.pageUrl;

    document.getElementById("kneeDatasetSelect")
      ?.addEventListener("change", function () {
        loadPage(
          `${pageUrl}?dataset=${encodeURIComponent(this.value)}`
        );
      });

    document.querySelectorAll(".knee-open-dataset")
      .forEach(button => {
        button.addEventListener("click", function () {
          loadPage(
            `${pageUrl}?dataset=${encodeURIComponent(this.dataset.datasetId)}`
          );
        });
      });

    document.getElementById("kneeExportFiltered")
      ?.addEventListener("click", downloadFilteredCsv);
  }

  function updateManualRatePreview() {
    const replacementCases = Number(
      document.getElementById("kneeReplacementCases")?.value || 0
    );
    const infectionCases = Number(
      document.getElementById("kneeInfectionCases")?.value || 0
    );
    const patientCount = Number(
      document.getElementById("kneePatientCount")?.value || 0
    );
    const catastrophicCount = Number(
      document.getElementById("kneeCatastrophicCount")?.value || 0
    );

    const infectionRate = replacementCases > 0
      ? infectionCases / replacementCases * 100
      : null;

    const catastrophicRate = patientCount > 0
      ? catastrophicCount / patientCount * 100
      : null;

    setText(
      "kneeManualInfectionRate",
      infectionRate === null
        ? "—"
        : `${formatDecimal.format(infectionRate)}%`
    );

    setText(
      "kneeManualCatastrophicRate",
      catastrophicRate === null
        ? "—"
        : `${formatDecimal.format(catastrophicRate)}%`
    );
  }

  function updateManualDatasetNameVisibility() {
    const select = document.getElementById("kneeTargetDataset");
    const group = document.getElementById(
      "kneeManualDatasetNameGroup"
    );
    const input = document.getElementById(
      "kneeManualDatasetName"
    );

    if (!select || !group || !input) {
      return;
    }

    const isNew = select.value === "new";

    group.hidden = !isNew;
    input.required = isNew;
  }

  function bindManualForm() {
    document.querySelectorAll(".knee-rate-input")
      .forEach(input => {
        input.addEventListener(
          "input",
          updateManualRatePreview
        );
      });

    document.getElementById("kneeTargetDataset")
      ?.addEventListener(
        "change",
        updateManualDatasetNameVisibility
      );

    updateManualRatePreview();
    updateManualDatasetNameVisibility();
  }

  function bindTablePagination() {
    document.getElementById("kneeTablePrev")
      ?.addEventListener("click", function () {
        if (kneeTablePage > 1) {
          kneeTablePage -= 1;
          renderTable(kneeFilteredRecords);
        }
      });

    document.getElementById("kneeTableNext")
      ?.addEventListener("click", function () {
        const totalPages = Math.max(
          1,
          Math.ceil(
            kneeFilteredRecords.length / kneeTablePageSize
          )
        );

        if (kneeTablePage < totalPages) {
          kneeTablePage += 1;
          renderTable(kneeFilteredRecords);
        }
      });
  }

  function bindChartTools() {
    document.querySelectorAll(".knee-chart-card")
      .forEach(card => {
        card.querySelector(".knee-chart-height")
          ?.addEventListener("click", function () {
            const current = card.dataset.localHeight || "normal";
            const next = current === "normal"
              ? "tall"
              : current === "tall"
                ? "compact"
                : "normal";

            card.dataset.localHeight = next;

            window.setTimeout(() => {
              const key = card.dataset.chartKey;
              kneeCharts[key]?.resize();
            }, 220);
          });

        card.querySelector(".knee-chart-fullscreen")
          ?.addEventListener("click", function () {
            const isFullscreen = card.classList.toggle(
              "knee-fullscreen"
            );

            document.body.classList.toggle(
              "knee-chart-open",
              isFullscreen
            );

            this.innerHTML = isFullscreen
              ? '<i class="fa fa-compress"></i>'
              : '<i class="fa fa-expand"></i>';

            window.setTimeout(() => {
              const key = card.dataset.chartKey;
              kneeCharts[key]?.resize();
            }, 220);
          });

        card.querySelector(".knee-chart-download")
          ?.addEventListener("click", function () {
            const canvas = card.querySelector("canvas");

            if (!canvas) {
              return;
            }

            const link = document.createElement("a");
            const key = card.dataset.chartKey || "chart";

            link.href = canvas.toDataURL("image/png", 1);
            link.download = `knee_quality_${key}.png`;
            link.click();
          });
      });
  }

  window.initKneeQualityAnalysis = function () {
    window.cleanupKneeQualityAnalysis();

    const root = getRoot();

    if (!root) {
      return;
    }

    kneePayload = parsePayload();

    bindDatasetControls();
    bindManualForm();

    if (!kneePayload) {
      return;
    }

    if (typeof Chart === "undefined") {
      console.error("找不到 Chart.js，無法建立人工膝關節圖表");
      return;
    }

    root.dataset.chartDensity = "normal";

    // === 每次進入頁面，三張散布圖都從完整範圍開始 ===
    scatterZoomStates = createDefaultScatterZoomStates();

    const distributionMode = document.getElementById("kneeDistributionMode");

    // === 每次進入頁面都從完整分布開始，避免上次模式突然自動套用 ===
    if (distributionMode) {
      distributionMode.value = "all";
    }

    const distributionMin = document.getElementById("kneeDistributionMin");
    const distributionMax = document.getElementById("kneeDistributionMax");

    if (distributionMin) {
      distributionMin.value = "0";
    }

    if (distributionMax) {
      distributionMax.value = "1";
    }

    populateSelects();
    bindFilterCollapse();
    bindFilters();
    bindScatterZoomControls();
    bindTablePagination();
    bindChartTools();
    renderAll();

    kneeThemeHandler = function () {
      window.setTimeout(
        rerenderChartsForTheme,
        80
      );
    };

    document.addEventListener(
      "tyy-theme-changed",
      kneeThemeHandler
    );
  };

  window.cleanupKneeQualityAnalysis = function () {
    Object.values(kneeCharts).forEach(chart => {
      chart.destroy();
    });

    kneeCharts = {};
    kneePayload = null;
    kneeFilteredRecords = [];
    kneeTablePage = 1;
    selectedHospitalCodes = new Set();
    scatterZoomStates = createDefaultScatterZoomStates();

    if (kneeThemeHandler) {
      document.removeEventListener(
        "tyy-theme-changed",
        kneeThemeHandler
      );
      kneeThemeHandler = null;
    }

    document.body.classList.remove(
      "knee-chart-open"
    );
  };
})();
