(() => {
  "use strict";

  const byId = (id) => document.getElementById(id);
  const form = byId("posterForm");
  const rainbowInput = byId("rainbowInput");
  const rainbowGroup = byId("rainbowText");
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
  const colors = ["#c83a44", "#d58329", "#b9a22c", "#428342", "#205b73", "#25367b", "#722b78"];
  const segmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter("ja", { granularity: "grapheme" }) : null;
  let imageVersion = 0;
  let logoLoading = false;
  let animationFrame = 0;

  function setFeedback(message = "", success = false) {
    feedback.textContent = message;
    feedback.hidden = !message;
    feedback.classList.toggle("is-success", success);
  }

  function rainbowColor(position) {
    const step = position * (colors.length - 1);
    const index = Math.min(Math.floor(step), colors.length - 2);
    const fraction = step - index;
    const start = colors[index].slice(1).match(/.{2}/g).map((part) => parseInt(part, 16));
    const end = colors[index + 1].slice(1).match(/.{2}/g).map((part) => parseInt(part, 16));
    return `rgb(${start.map((value, channel) => Math.round(value + (end[channel] - value) * fraction)).join(",")})`;
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

  function renderRainbow() {
    const lines = getRainbowLines();
    rainbowGroup.replaceChildren();
    // Four lines keep the reference layout; extra lines share the same safe area.
    const lineCount = Math.max(4, lines.length);
    const lineHeight = 330 / lineCount;
    const fontSize = Math.min(62, lineHeight * 0.82);
    lines.slice(0, 6).forEach((line, lineIndex) => {
      const text = document.createElementNS(svgNamespace, "text");
      text.setAttribute("x", "422");
      text.setAttribute("y", String(160 + lineIndex * lineHeight));
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("font-size", String(fontSize));
      text.setAttribute("xml:space", "preserve");
      text.style.whiteSpace = "pre";
      if (lineIndex === 0 && /^[a-zA-Z\d\s]+$/.test(line)) text.setAttribute("letter-spacing", "12");
      const letters = segmenter ? Array.from(segmenter.segment(line), ({ segment }) => segment) : Array.from(line);
      letters.forEach((letter, index) => {
        const span = document.createElementNS(svgNamespace, "tspan");
        span.setAttribute("fill", rainbowColor(letters.length <= 1 ? 0 : index / (letters.length - 1)));
        span.textContent = letter;
        text.append(span);
      });
      rainbowGroup.append(text);
      fitText(text, 688);
    });
  }

  function render() {
    renderRainbow();
    for (const [inputId, outputId] of bindings) {
      const text = byId(outputId);
      text.textContent = byId(inputId).value;
      text.setAttribute("xml:space", "preserve");
      text.style.whiteSpace = "pre";
      fitText(text, 966);
    }
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
  });

  printButton.addEventListener("click", async () => {
    if (logoLoading) return;
    if (!validateRainbow()) {
      setFeedback("虹色の文面は6行以内にしてください。");
      rainbowInput.reportValidity();
      return;
    }
    if (document.fonts) await document.fonts.ready;
    cancelAnimationFrame(animationFrame);
    render();
    window.print();
  });
  window.addEventListener("beforeprint", render);
  window.addEventListener("afterprint", scheduleRender);
  render();
  if (document.fonts) document.fonts.ready.then(scheduleRender);
})();
