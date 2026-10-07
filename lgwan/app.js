(() => {
  "use strict";

  const byId = (id) => document.getElementById(id);
  const form = byId("posterForm");
  const rainbowInput = byId("rainbowInput");
  const rainbowBold = byId("rainbowBold");
  const rainbowItalic = byId("rainbowItalic");
  const rainbowSpacing = byId("rainbowSpacing");
  const rainbowSpacingNumber = byId("rainbowSpacingNumber");
  const rainbowFont = byId("rainbowFont");
  const fontStatus = byId("fontStatus");
  const rainbowGroup = byId("rainbowText");
  const rainbowClip = byId("rainbowClip");
  const rainbowShadow = byId("rainbowShadow");
  const printButton = byId("printButton");
  const logoFile = byId("logoFile");
  const uploadButton = byId("uploadButton");
  const posterLogo = byId("posterLogo");
  const thumbnail = byId("logoThumbnail");
  const feedback = byId("feedback");
  const positionTarget = byId("positionTarget");
  const positionControls = {
    x: [byId("positionX"), byId("positionXNumber")],
    y: [byId("positionY"), byId("positionYNumber")],
  };
  const elementScale = byId("elementScale");
  const elementScaleNumber = byId("elementScaleNumber");
  const settingsJson = byId("settingsJson");
  const includeLogoJson = byId("includeLogoJson");
  const jsonStatus = byId("jsonStatus");
  const positionElements = {
    rainbow: "rainbowPosition",
    logo: "posterLogo",
    genuine: "genuinePosition",
    arrow: "fixedArrow",
    use: "usePosition",
    stop: "stopPosition",
    dont: "dontPosition",
    bottom: "bottomPosition",
  };
  const positions = Object.fromEntries(
    [...Object.keys(positionElements), ...Array.from({ length: 6 }, (_, index) => `rainbowLine${index}`)]
      .map((key) => [key, { x: 0, y: 0 }]),
  );
  const scales = Object.fromEntries(Object.keys(positions).map((key) => [key, 100]));
  // Keep XY offsets independent of scaling. Text rows scale around their
  // baseline anchor; badges, images, and the rainbow block around their center.
  const scaleAnchors = {
    rainbow: [400, 275],
    logo: [970, 70],
    genuine: [600, 485.5],
    arrow: [925, 338],
    use: [78, 584],
    stop: [78, 632],
    dont: [78, 695],
    bottom: [78, 747],
  };
  const unitsPerMm = { x: 1122.52 / 297, y: 793.7 / 210 };
  const svgNamespace = "http://www.w3.org/2000/svg";
  const bindings = [
    ["useInput", "useText"],
    ["stopInput", "stopText"],
    ["dontInput", "dontText"],
    ["bottomInput", "bottomText"],
  ];
  const textInputs = Object.fromEntries([
    ["rainbow", rainbowInput],
    ...bindings.map(([inputId]) => [inputId.replace(/Input$/, ""), byId(inputId)]),
  ]);
  let imageVersion = 0;
  let logoLoading = false;
  let animationFrame = 0;
  let popFontAvailable = false;
  let popFontCheck;
  let jsonDraft = false;
  let jsonApplied = false;
  let jsonRevision = 0;
  let jsonTimer = 0;
  let jsonOutputTimer = 0;
  let lastJsonWrite = 0;

  function setJsonStatus(message, error = false) {
    if (jsonStatus.textContent !== message) jsonStatus.textContent = message;
    jsonStatus.classList.toggle("is-error", error);
    settingsJson.setAttribute("aria-invalid", String(error));
  }

  function getSettings() {
    const settings = {
      version: 1,
      texts: Object.fromEntries(Object.entries(textInputs).map(([key, input]) => [key, input.value])),
      rainbowStyle: {
        font: rainbowFont.value,
        bold: rainbowBold.checked,
        italic: rainbowItalic.checked,
        letterSpacingMm: Number(rainbowSpacing.value),
      },
      elements: Object.fromEntries(Object.keys(positions).map((key) => [key, {
        xMm: positions[key].x,
        yMm: positions[key].y,
        scalePercent: scales[key],
      }])),
    };
    if (includeLogoJson.checked) {
      const dataUrl = posterLogo.getAttribute("href");
      settings.logo = dataUrl ? { name: byId("logoName").textContent, dataUrl } : null;
    }
    return settings;
  }

  function syncJsonOutput(immediate = false) {
    // Preserve a draft and its caret during font loads and preview redraws.
    if (jsonDraft) return;
    // Embedded images can be large; keep slider motion responsive while syncing.
    const largeLogo = includeLogoJson.checked && (posterLogo.getAttribute("href")?.length || 0) > 100000;
    const remaining = 150 - (Date.now() - lastJsonWrite);
    if (!immediate && largeLogo && remaining > 0) {
      clearTimeout(jsonOutputTimer);
      jsonOutputTimer = setTimeout(() => syncJsonOutput(true), remaining);
      return;
    }
    clearTimeout(jsonOutputTimer);
    const output = JSON.stringify(getSettings(), null, 2);
    if (settingsJson.value !== output) settingsJson.value = output;
    lastJsonWrite = Date.now();
  }

  function settingsChanged() {
    clearTimeout(jsonTimer);
    jsonRevision += 1;
    jsonDraft = false;
    jsonApplied = false;
    setJsonStatus("編集内容をJSONで表示しています。");
  }

  function requireObject(value, label, keys) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}はオブジェクトにしてください。`);
    if (Object.keys(value).some((key) => !keys.includes(key))) throw new Error(`${label}に未対応の項目があります。`);
  }

  function requireNumber(value, label, min, max, step) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
      throw new Error(`${label}は${min}〜${max}の数値にしてください。`);
    }
    if (Math.abs(value / step - Math.round(value / step)) > 1e-8) throw new Error(`${label}は${step}刻みにしてください。`);
    return Number((Math.round(value / step) * step).toFixed(4));
  }

  function validateSettings(data) {
    requireObject(data, "JSONのルート", ["version", "texts", "rainbowStyle", "elements", "logo"]);
    if (data.version !== 1) throw new Error("versionは1を指定してください。");
    requireObject(data.texts, "texts", Object.keys(textInputs));
    const texts = {};
    for (const key of Object.keys(textInputs)) {
      const text = data.texts[key];
      const max = key === "rainbow" ? 240 : 120;
      if (typeof text !== "string" || text.length > max) throw new Error(`texts.${key}は${max}文字以内の文字列にしてください。`);
      texts[key] = text.replace(/\r\n?/g, "\n");
      if (key === "rainbow" && texts[key].split("\n").length > 6) throw new Error("texts.rainbowは6行以内にしてください。");
      if (key !== "rainbow" && /\n/.test(texts[key])) throw new Error(`texts.${key}は改行を含まない1行の文字列にしてください。`);
    }
    requireObject(data.rainbowStyle, "rainbowStyle", ["font", "bold", "italic", "letterSpacingMm"]);
    const style = data.rainbowStyle;
    if (!["pop", "gothic"].includes(style.font)) throw new Error('rainbowStyle.fontは"pop"か"gothic"にしてください。');
    for (const key of ["bold", "italic"]) {
      if (typeof style[key] !== "boolean") throw new Error(`rainbowStyle.${key}はtrueかfalseにしてください。`);
    }
    const rainbowStyle = {
      font: style.font, bold: style.bold, italic: style.italic,
      letterSpacingMm: requireNumber(style.letterSpacingMm, "rainbowStyle.letterSpacingMm", -2, 5, 0.1),
    };
    requireObject(data.elements, "elements", Object.keys(positions));
    const elements = {};
    for (const key of Object.keys(positions)) {
      const element = data.elements[key];
      requireObject(element, `elements.${key}`, ["xMm", "yMm", "scalePercent"]);
      elements[key] = {
        xMm: requireNumber(element.xMm, `elements.${key}.xMm`, -100, 100, 0.5),
        yMm: requireNumber(element.yMm, `elements.${key}.yMm`, -100, 100, 0.5),
        scalePercent: requireNumber(element.scalePercent, `elements.${key}.scalePercent`, 25, 200, 1),
      };
    }
    const settings = { version: 1, texts, rainbowStyle, elements };
    if (Object.hasOwn(data, "logo")) {
      if (data.logo === null) settings.logo = null;
      else {
        requireObject(data.logo, "logo", ["name", "dataUrl"]);
        if (typeof data.logo.name !== "string" || !data.logo.name || data.logo.name.length > 512) throw new Error("logo.nameは1〜512文字の文字列にしてください。");
        const source = data.logo.dataUrl;
        if (typeof source !== "string" || source.length > 12 * 1024 * 1024 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(source)) {
          throw new Error("logo.dataUrlは12MB以内のPNGのdata URLにしてください。");
        }
        settings.logo = { name: data.logo.name, dataUrl: source };
      }
    }
    return settings;
  }

  async function applyJson() {
    const revision = ++jsonRevision;
    jsonDraft = true;
    jsonApplied = false;
    try {
      if (settingsJson.value.length > 20 * 1024 * 1024) throw new Error("JSONが大きすぎます。ロゴ画像の容量を減らしてください。");
      let parsed;
      try { parsed = JSON.parse(settingsJson.value); }
      catch { throw new Error("JSONの構文が正しくありません。括弧やカンマを確認してください。"); }
      const settings = validateSettings(parsed);
      if (settings.logo) {
        setJsonStatus("ロゴ画像を確認しています…");
        const image = new Image();
        image.src = settings.logo.dataUrl;
        try { await image.decode(); }
        catch { throw new Error("JSON内のロゴ画像を読み込めませんでした。"); }
        if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth > 1600 || image.naturalHeight > 800) {
          throw new Error("JSON内のロゴ画像は1600×800px以内にしてください。");
        }
      }
      if (revision !== jsonRevision) return;
      // Validate every field and decode any image before committing any changes.
      for (const [key, input] of Object.entries(textInputs)) input.value = settings.texts[key];
      rainbowFont.value = settings.rainbowStyle.font;
      rainbowBold.checked = settings.rainbowStyle.bold;
      rainbowItalic.checked = settings.rainbowStyle.italic;
      rainbowSpacing.value = String(settings.rainbowStyle.letterSpacingMm);
      rainbowSpacingNumber.value = rainbowSpacing.value;
      for (const [key, element] of Object.entries(settings.elements)) {
        positions[key] = { x: element.xMm, y: element.yMm };
        scales[key] = element.scalePercent;
      }
      includeLogoJson.checked = Object.hasOwn(settings, "logo");
      if (includeLogoJson.checked) {
        clearLogo();
        if (settings.logo) showLogo(settings.logo.dataUrl, settings.logo.name);
      }
      validateRainbow();
      setFeedback();
      render();
      syncPositionControls();
      loadRainbowFont().catch(scheduleRender);
      jsonApplied = true;
      setJsonStatus("JSONを反映しました。");
      if (document.activeElement !== settingsJson) {
        jsonDraft = false;
        syncJsonOutput();
      }
    } catch (error) {
      if (revision === jsonRevision) setJsonStatus(error.message, true);
    }
  }

  function setFeedback(message = "", success = false) {
    feedback.textContent = message;
    feedback.hidden = !message;
    feedback.classList.toggle("is-success", success);
  }

  function fitText(textElement, maxWidth) {
    textElement.removeAttribute("textLength");
    textElement.removeAttribute("lengthAdjust");
    if (textElement.getComputedTextLength() > maxWidth) {
      textElement.setAttribute("textLength", String(maxWidth));
      textElement.setAttribute("lengthAdjust", "spacingAndGlyphs");
    }
  }

  function setPosterText(textElement, value, tildeShift = 0.335) {
    if (!value.includes("~")) {
      textElement.textContent = value;
      return;
    }
    // The bundled fonts place ASCII tilde near the cap line. Lower only that
    // glyph to the digit center, then restore the baseline for the next run.
    // Keep the original character in both the SVG and the editable JSON.
    const fragment = document.createDocumentFragment();
    let lowered = false;
    for (const run of value.match(/~+|[^~]+/g)) {
      const span = document.createElementNS(svgNamespace, "tspan");
      const isTilde = run.startsWith("~");
      span.textContent = run;
      if (isTilde !== lowered) span.setAttribute("dy", `${isTilde ? tildeShift : -tildeShift}em`);
      fragment.append(span);
      lowered = isTilde;
    }
    textElement.replaceChildren(fragment);
  }

  function getRainbowLines() {
    return rainbowInput.value.replace(/\r\n?/g, "\n").split("\n");
  }

  function validateRainbow() {
    const valid = getRainbowLines().length <= 6;
    rainbowInput.setCustomValidity(valid ? "" : "虹色の文面は6行以内にしてください。");
    rainbowInput.setAttribute("aria-invalid", String(!valid));
    return valid;
  }

  function rainbowFontFamily() {
    return rainbowFont.value === "pop" && popFontAvailable ? "Poster Pop" : "Poster Gothic";
  }

  async function loadRainbowFont() {
    if (rainbowFont.value === "pop") {
      if (!popFontCheck) {
        popFontCheck = document.fonts
          ? document.fonts.load('400 62px "Poster Pop"', "光ファイバー").then((faces) => faces.length > 0, () => false)
          : Promise.resolve(false);
      }
      popFontAvailable = await popFontCheck;
    }
    const selectedPop = rainbowFont.value === "pop";
    fontStatus.textContent = selectedPop
      ? (popFontAvailable ? "追加されたHGP創英角ポップ体を使用しています。" : "創英角ポップ体を読み込めませんでした。角ゴシックで表示しています。")
      : "BIZ UDPゴシックを使用しています。";
    fontStatus.classList.toggle("font-missing", selectedPop && !popFontAvailable);
    render();
    if (document.fonts) {
      await document.fonts.load(`${rainbowBold.checked ? 700 : 400} 62px "${rainbowFontFamily()}"`);
      scheduleRender();
    }
  }

  function syncPositionControls() {
    const position = positions[positionTarget.value];
    for (const [axis, controls] of Object.entries(positionControls)) {
      for (const control of controls) control.value = String(position[axis]);
      controls[0].setAttribute("aria-valuetext", `${position[axis]} mm`);
    }
    syncScaleControls();
  }

  function syncScaleControls() {
    const amount = scales[positionTarget.value];
    elementScale.value = String(amount);
    elementScaleNumber.value = String(amount);
    elementScale.setAttribute("aria-valuetext", `${amount}%`);
  }

  function updateScale(control, normalizeNumber = false) {
    if (control.value === "") return;
    const value = Number(control.value);
    if (!Number.isFinite(value)) return;
    const amount = Math.round(Math.max(25, Math.min(200, value)));
    scales[positionTarget.value] = amount;
    elementScale.value = String(amount);
    elementScale.setAttribute("aria-valuetext", `${amount}%`);
    if (control === elementScale || normalizeNumber) elementScaleNumber.value = String(amount);
    scheduleRender();
  }

  function resetScales(target) {
    for (const key of target ? [target] : Object.keys(scales)) scales[key] = 100;
    syncScaleControls();
    scheduleRender();
  }

  function syncRainbowPositionChoices(lineCount) {
    const choices = byId("rainbowLineTargets");
    if (choices.children.length === lineCount) return;
    const selected = positionTarget.value;
    choices.replaceChildren(...Array.from({ length: lineCount }, (_, index) => {
      const option = document.createElement("option");
      option.value = `rainbowLine${index}`;
      option.textContent = `虹文字 ${index + 1}行目`;
      return option;
    }));
    positionTarget.value = selected;
    if (!positionTarget.value) positionTarget.value = "rainbow";
    syncPositionControls();
  }

  function updatePosition(control, normalizeNumber = false) {
    if (control.value === "") return;
    const value = Number(control.value);
    if (!Number.isFinite(value)) return;
    const axis = control.id.startsWith("positionX") ? "x" : "y";
    const amount = Math.round(Math.max(-100, Math.min(100, value)) * 2) / 2;
    positions[positionTarget.value][axis] = amount;
    const [slider, number] = positionControls[axis];
    slider.value = String(amount);
    slider.setAttribute("aria-valuetext", `${amount} mm`);
    // Leave a number field editable while typing a minus sign or decimal point.
    if (control === slider || normalizeNumber) number.value = String(amount);
    scheduleRender();
  }

  function renderPositions() {
    for (const [target, elementId] of Object.entries(positionElements)) {
      const { x, y } = positions[target];
      const [anchorX, anchorY] = scaleAnchors[target];
      byId(elementId).setAttribute("transform", `translate(${(x * unitsPerMm.x).toFixed(3)} ${(y * unitsPerMm.y).toFixed(3)}) translate(${anchorX} ${anchorY}) scale(${scales[target] / 100}) translate(${-anchorX} ${-anchorY})`);
    }
  }

  function resetPositions(target) {
    for (const key of target ? [target] : Object.keys(positions)) {
      positions[key] = { x: 0, y: 0 };
    }
    syncPositionControls();
    scheduleRender();
  }

  function updateRainbowSpacing(control, normalizeNumber = false) {
    if (control.value === "") return;
    const value = Number(control.value);
    if (!Number.isFinite(value)) return;
    const amount = Math.round(Math.max(-2, Math.min(5, value)) * 10) / 10;
    rainbowSpacing.value = String(amount);
    rainbowSpacing.setAttribute("aria-valuetext", `${amount} mm`);
    if (control === rainbowSpacing || normalizeNumber) rainbowSpacingNumber.value = String(amount);
    scheduleRender();
  }

  function renderRainbow() {
    const lines = getRainbowLines();
    syncRainbowPositionChoices(Math.min(6, lines.length));
    const weight = rainbowBold.checked ? "700" : "400";
    const slant = rainbowItalic.checked ? " skewX(-12)" : "";
    const spacingAdjustment = Number(rainbowSpacing.value) * unitsPerMm.x;
    rainbowSpacing.setAttribute("aria-valuetext", `${rainbowSpacing.value} mm`);
    // The fill clip and shadow must use the same actual font weight.
    rainbowGroup.setAttribute("font-weight", weight);
    rainbowClip.setAttribute("font-weight", weight);
    rainbowShadow.setAttribute("font-weight", weight);
    const usePop = rainbowFont.value === "pop" && popFontAvailable;
    rainbowGroup.classList.toggle("rainbow-pop", usePop);
    rainbowClip.classList.toggle("rainbow-pop", usePop);
    rainbowShadow.classList.toggle("rainbow-pop", usePop);
    rainbowGroup.replaceChildren();
    rainbowClip.replaceChildren();
    rainbowShadow.replaceChildren();
    // Four lines keep the reference layout; extra lines share the same safe area.
    const lineCount = Math.max(4, Math.min(6, lines.length));
    const lineHeight = 330 / lineCount;
    const fontSize = Math.min(62, lineHeight * 0.82);
    lines.slice(0, 6).forEach((line, lineIndex) => {
      const text = document.createElementNS(svgNamespace, "text");
      const center = lineIndex === 1 ? 422 : 366;
      const baseline = 160 + lineIndex * lineHeight;
      const offset = positions[`rainbowLine${lineIndex}`];
      const scale = scales[`rainbowLine${lineIndex}`] / 100;
      text.setAttribute("x", "0");
      text.setAttribute("y", "0");
      // Shear around each baseline so the slant cannot drift across lines.
      text.setAttribute("transform", `translate(${center + offset.x * unitsPerMm.x} ${baseline + offset.y * unitsPerMm.y}) scale(${scale})${slant}`);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("font-size", String(fontSize));
      text.setAttribute("xml:space", "preserve");
      text.style.whiteSpace = "pre";
      const originalSpacing = lineIndex === 0 && /^[a-zA-Z\d\s]+$/.test(line) ? 12 : 0;
      text.setAttribute("letter-spacing", String(originalSpacing + spacingAdjustment));
      setPosterText(text, line, usePop ? 0.348 : (rainbowBold.checked ? 0.335 : 0.338));
      rainbowGroup.append(text);
      fitText(text, lineIndex === 1 ? 668 : 568);
      // Clip paths require direct text children; a use pointing to a group is
      // not a valid clipping shape in Chromium. Clone the fitted glyph geometry.
      rainbowClip.append(text.cloneNode(true));
      // Scale the shadow offset with each line as well as its glyph geometry.
      const shadow = text.cloneNode(true);
      shadow.setAttribute("transform", `translate(${2.2 * scale} ${2.8 * scale}) ${text.getAttribute("transform")}`);
      rainbowShadow.append(shadow);
    });
  }

  function render() {
    renderRainbow();
    for (const [inputId, outputId] of bindings) {
      const text = byId(outputId);
      setPosterText(text, byId(inputId).value, outputId === "dontText" ? 0.389 : 0.335);
      text.setAttribute("xml:space", "preserve");
      text.style.whiteSpace = "pre";
      // A slight horizontal compression matches the tall, compact warning copy.
      text.setAttribute("transform", "translate(78 0) scale(0.86 1) translate(-78 0)");
      text.style.color = text.getAttribute("fill");
      fitText(text, 966);
    }
    // An outer dark edge keeps the white outline visible on the white paper.
    const outline = byId("useText").cloneNode(true);
    outline.removeAttribute("id");
    outline.setAttribute("stroke", "#20212b");
    outline.setAttribute("stroke-width", "4.8");
    byId("useOutline").replaceChildren(outline);
    renderPositions();
    syncJsonOutput();
  }

  function scheduleRender() {
    cancelAnimationFrame(animationFrame);
    animationFrame = requestAnimationFrame(render);
  }

  function clearLogo() {
    imageVersion += 1;
    logoLoading = false;
    printButton.disabled = false;
    logoFile.value = "";
    posterLogo.removeAttribute("href");
    posterLogo.setAttribute("visibility", "hidden");
    thumbnail.removeAttribute("src");
    thumbnail.hidden = true;
    byId("uploadPrompt").hidden = false;
    byId("replaceLabel").hidden = true;
    byId("removeLogoButton").hidden = true;
    byId("logoName").textContent = "PNG・JPG・WEBP・GIF・SVG";
    syncJsonOutput(true);
  }

  function showLogo(source, name) {
    thumbnail.src = source;
    posterLogo.setAttribute("href", source);
    posterLogo.setAttribute("visibility", "visible");
    thumbnail.hidden = false;
    byId("uploadPrompt").hidden = true;
    byId("replaceLabel").hidden = false;
    byId("removeLogoButton").hidden = false;
    byId("logoName").textContent = name;
    syncJsonOutput(true);
  }

  async function loadLogo(file) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(file.type)) {
      setFeedback("PNG・JPG・WEBP・GIF・SVGの画像を選んでください。");
      logoFile.value = "";
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setFeedback("画像は12MB以内のものを選んでください。");
      logoFile.value = "";
      return;
    }

    settingsChanged();
    const currentVersion = ++imageVersion;
    logoLoading = true;
    printButton.disabled = true;
    setFeedback("画像を読み込んでいます。", true);
    const objectUrl = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = objectUrl;
      await image.decode();
      if (currentVersion !== imageVersion) return;
      if (!image.naturalWidth || !image.naturalHeight) throw new Error("Empty image");
      // Embed a self-contained image so it remains available in the print dialog.
      const scale = Math.min(1, 1600 / image.naturalWidth, 800 / image.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas unavailable");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const source = canvas.toDataURL("image/png");
      thumbnail.src = source;
      await thumbnail.decode();
      if (currentVersion !== imageVersion) return;
      showLogo(source, file.name);
      setFeedback();
    } catch {
      if (currentVersion === imageVersion) {
        setFeedback("この画像を読み込めませんでした。別の画像を選んでください。");
        logoFile.value = "";
      }
    } finally {
      URL.revokeObjectURL(objectUrl);
      if (currentVersion === imageVersion) {
        logoLoading = false;
        printButton.disabled = false;
      }
    }
  }

  form.addEventListener("submit", (event) => event.preventDefault());
  form.addEventListener("input", (event) => {
    if (event.target === settingsJson) {
      clearTimeout(jsonTimer);
      jsonRevision += 1;
      jsonDraft = true;
      jsonApplied = false;
      setJsonStatus("JSONを確認しています…");
      jsonTimer = setTimeout(applyJson, 350);
      return;
    }
    if (event.target === logoFile) return;
    if (event.target !== positionTarget) settingsChanged();
    if (event.target === elementScale || event.target === elementScaleNumber) {
      updateScale(event.target);
      return;
    }
    if (event.target === rainbowSpacing || event.target === rainbowSpacingNumber) {
      updateRainbowSpacing(event.target);
      return;
    }
    if (event.target === positionTarget) {
      syncPositionControls();
      return;
    }
    if (Object.values(positionControls).flat().includes(event.target)) {
      updatePosition(event.target);
      return;
    }
    if (event.target === rainbowInput) {
      const valid = validateRainbow();
      setFeedback(valid ? "" : "虹色の文面は6行以内にしてください。");
    }
    if (event.target === rainbowBold || event.target === rainbowFont) loadRainbowFont().catch(scheduleRender);
    scheduleRender();
  });
  positionTarget.addEventListener("change", syncPositionControls);
  settingsJson.addEventListener("blur", () => {
    if (jsonApplied) {
      jsonDraft = false;
      syncJsonOutput(true);
    }
  });
  byId("refreshJsonButton").addEventListener("click", () => {
    settingsChanged();
    syncJsonOutput(true);
  });
  byId("copyJsonButton").addEventListener("click", async () => {
    if (!jsonDraft) syncJsonOutput(true);
    try {
      await navigator.clipboard.writeText(settingsJson.value);
      if (!jsonDraft || jsonApplied) setJsonStatus("JSONをコピーしました。");
    } catch {
      settingsJson.focus();
      settingsJson.select();
      setJsonStatus("コピーできませんでした。この欄を選択してコピーしてください。", settingsJson.getAttribute("aria-invalid") === "true");
    }
  });
  elementScaleNumber.addEventListener("change", () => {
    if (elementScaleNumber.value === "") syncScaleControls();
    else updateScale(elementScaleNumber, true);
  });
  rainbowSpacingNumber.addEventListener("change", () => {
    if (rainbowSpacingNumber.value === "") rainbowSpacingNumber.value = rainbowSpacing.value;
    else updateRainbowSpacing(rainbowSpacingNumber, true);
  });
  for (const [, number] of Object.values(positionControls)) {
    number.addEventListener("change", () => {
      if (number.value === "") syncPositionControls();
      else updatePosition(number, true);
    });
  }
  byId("resetPositionButton").addEventListener("click", () => { settingsChanged(); resetPositions(positionTarget.value); });
  byId("resetAllPositionsButton").addEventListener("click", () => { settingsChanged(); resetPositions(); });
  byId("resetScaleButton").addEventListener("click", () => { settingsChanged(); resetScales(positionTarget.value); });
  byId("resetAllScalesButton").addEventListener("click", () => { settingsChanged(); resetScales(); });
  uploadButton.addEventListener("click", () => logoFile.click());
  logoFile.addEventListener("change", () => loadLogo(logoFile.files[0]));
  byId("removeLogoButton").addEventListener("click", () => { settingsChanged(); clearLogo(); setFeedback(); });
  for (const eventName of ["dragenter", "dragover"]) {
    uploadButton.addEventListener(eventName, (event) => {
      event.preventDefault();
      uploadButton.classList.add("is-dragging");
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    });
  }
  uploadButton.addEventListener("dragleave", () => uploadButton.classList.remove("is-dragging"));
  uploadButton.addEventListener("drop", (event) => {
    event.preventDefault();
    uploadButton.classList.remove("is-dragging");
    loadLogo(event.dataTransfer?.files[0]);
  });
  // Keep dropping a file outside the upload area from navigating away.
  document.addEventListener("dragover", (event) => event.preventDefault());
  document.addEventListener("drop", (event) => event.preventDefault());

  byId("resetButton").addEventListener("click", () => {
    if (!window.confirm("文面・ロゴ・文字スタイル・位置・大きさを初期状態に戻しますか？")) return;
    settingsChanged();
    form.reset();
    resetPositions();
    resetScales();
    clearLogo();
    validateRainbow();
    setFeedback();
    render();
    loadRainbowFont().catch(scheduleRender);
  });

  printButton.addEventListener("click", async () => {
    if (logoLoading) return;
    if (!validateRainbow()) {
      setFeedback("虹色の文面は6行以内にしてください。");
      rainbowInput.reportValidity();
      return;
    }
    await loadRainbowFont();
    if (document.fonts) {
      await document.fonts.ready;
    }
    cancelAnimationFrame(animationFrame);
    render();
    window.print();
  });
  window.addEventListener("beforeprint", render);
  window.addEventListener("afterprint", scheduleRender);
  render();
  loadRainbowFont().catch(scheduleRender);
  if (document.fonts) document.fonts.ready.then(scheduleRender);
})();
