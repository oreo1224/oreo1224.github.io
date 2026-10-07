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
  let imageVersion = 0;
  let logoLoading = false;
  let animationFrame = 0;
  let popFontAvailable = false;
  let popFontCheck;

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
      text.textContent = line;
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
      text.textContent = byId(inputId).value;
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
      posterLogo.setAttribute("href", source);
      posterLogo.setAttribute("visibility", "visible");
      thumbnail.hidden = false;
      byId("uploadPrompt").hidden = true;
      byId("replaceLabel").hidden = false;
      byId("removeLogoButton").hidden = false;
      byId("logoName").textContent = file.name;
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
  byId("resetPositionButton").addEventListener("click", () => resetPositions(positionTarget.value));
  byId("resetAllPositionsButton").addEventListener("click", () => resetPositions());
  byId("resetScaleButton").addEventListener("click", () => resetScales(positionTarget.value));
  byId("resetAllScalesButton").addEventListener("click", () => resetScales());
  uploadButton.addEventListener("click", () => logoFile.click());
  logoFile.addEventListener("change", () => loadLogo(logoFile.files[0]));
  byId("removeLogoButton").addEventListener("click", () => { clearLogo(); setFeedback(); });
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
