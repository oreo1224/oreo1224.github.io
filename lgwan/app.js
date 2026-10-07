(() => {
  "use strict";

  const byId = (id) => document.getElementById(id);
  const form = byId("posterForm");
  const rainbowInput = byId("rainbowInput");
  const rainbowBold = byId("rainbowBold");
  const rainbowFont = byId("rainbowFont");
  const fontStatus = byId("fontStatus");
  const rainbowGroup = byId("rainbowText");
  const rainbowClip = byId("rainbowClip");
  const printButton = byId("printButton");
  const logoFile = byId("logoFile");
  const uploadButton = byId("uploadButton");
  const posterLogo = byId("posterLogo");
  const thumbnail = byId("logoThumbnail");
  const feedback = byId("feedback");
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
      ? (popFontAvailable ? "端末にある創英角ポップ体を使用しています。" : "この端末には創英角ポップ体が見つかりません。角ゴシックで表示しています。")
      : "BIZ UDPゴシックを使用しています。";
    fontStatus.classList.toggle("font-missing", selectedPop && !popFontAvailable);
    render();
    if (document.fonts) {
      await document.fonts.load(`${rainbowBold.checked ? 700 : 400} 62px "${rainbowFontFamily()}"`);
      scheduleRender();
    }
  }

  function renderRainbow() {
    const lines = getRainbowLines();
    const weight = rainbowBold.checked ? "700" : "400";
    // The fill clip and shadow must use the same actual font weight.
    rainbowGroup.setAttribute("font-weight", weight);
    rainbowClip.setAttribute("font-weight", weight);
    const usePop = rainbowFont.value === "pop" && popFontAvailable;
    rainbowGroup.classList.toggle("rainbow-pop", usePop);
    rainbowClip.classList.toggle("rainbow-pop", usePop);
    rainbowGroup.replaceChildren();
    rainbowClip.replaceChildren();
    // Four lines keep the reference layout; extra lines share the same safe area.
    const lineCount = Math.max(4, Math.min(6, lines.length));
    const lineHeight = 330 / lineCount;
    const fontSize = Math.min(62, lineHeight * 0.82);
    lines.slice(0, 6).forEach((line, lineIndex) => {
      const text = document.createElementNS(svgNamespace, "text");
      const center = lineIndex === 1 ? 422 : 366;
      const baseline = 160 + lineIndex * lineHeight;
      text.setAttribute("x", "0");
      text.setAttribute("y", "0");
      // Shear around each baseline so the slant cannot drift across lines.
      text.setAttribute("transform", `translate(${center} ${baseline}) skewX(-12)`);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("font-size", String(fontSize));
      text.setAttribute("xml:space", "preserve");
      text.style.whiteSpace = "pre";
      if (lineIndex === 0 && /^[a-zA-Z\d\s]+$/.test(line)) text.setAttribute("letter-spacing", "12");
      text.textContent = line;
      rainbowGroup.append(text);
      fitText(text, lineIndex === 1 ? 668 : 568);
      // Clip paths require direct text children; a use pointing to a group is
      // not a valid clipping shape in Chromium. Clone the fitted glyph geometry.
      rainbowClip.append(text.cloneNode(true));
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
    if (event.target === rainbowInput) {
      const valid = validateRainbow();
      setFeedback(valid ? "" : "虹色の文面は6行以内にしてください。");
    }
    if (event.target === rainbowBold || event.target === rainbowFont) loadRainbowFont().catch(scheduleRender);
    scheduleRender();
  });
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
    if (!window.confirm("文面とロゴを初期状態に戻しますか？")) return;
    form.reset();
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
