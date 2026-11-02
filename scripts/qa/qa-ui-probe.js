(() => {
  const lum = (rgb) => {
    const ch = rgb.map((v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const parse = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { rgb: p.slice(0, 3), a: p[3] ?? 1 }; };
  const sky = parse(getComputedStyle(document.body).backgroundColor);
  const rootBg = parse(getComputedStyle(document.documentElement).backgroundColor);
  const bgOf = (el) => {
    for (let e = el; e; e = e.parentElement) {
      const before = parse(getComputedStyle(e, "::before").backgroundColor);
      if (e.classList.contains("zm-box") && before && before.a > 0.5) return before.rgb;
      const c = parse(getComputedStyle(e).backgroundColor);
      if (c && c.a > 0.5) return c.rgb;
    }
    return (sky && sky.a > 0.5 ? sky : rootBg)?.rgb ?? [0, 0, 0];
  };
  const visible = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.opacity !== "0"; };
  const short = (e) => (e.getAttribute("aria-label") || e.textContent || e.tagName).trim().replace(/\s+/g, " ").slice(0, 18);

  const small = [...document.querySelectorAll("a,button,summary,input,select,[role=button],[role=tab],[role=radio]")]
    .filter((e) => visible(e) && !e.closest("p,li>p") && e.type !== "hidden")
    .filter((e) => { const r = e.getBoundingClientRect(); const big = e.closest("label") ? e.closest("label").getBoundingClientRect() : r; return Math.max(r.height, big.height) < 44 || Math.max(r.width, big.width) < 24; })
    .filter((e) => !(e.tagName === "INPUT" && e.closest("label")))
    .map((e) => `${short(e)}:${Math.round(e.getBoundingClientRect().height)}`);

  const lowContrast = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || seen.has(el) || !n.textContent.trim() || !visible(el) || el.closest("svg,[aria-hidden=true],.sr-only")) continue;
    seen.add(el);
    const s = getComputedStyle(el);
    const fg = parse(s.color);
    if (!fg) continue;
    const bg = bgOf(el);
    const [hi, lo] = [lum(fg.rgb), lum(bg)].sort((a, b) => b - a);
    const ratio = (hi + 0.05) / (lo + 0.05);
    const large = parseFloat(s.fontSize) >= 24 || (parseFloat(s.fontSize) >= 18.66 && Number(s.fontWeight) >= 700);
    if (ratio < (large ? 3 : 4.5)) lowContrast.push(`${short(el)}=${ratio.toFixed(2)}`);
  }

  const noFocus = [];
  for (const e of [...document.querySelectorAll("a,button,[role=button],[role=tab],input,summary")].filter(visible).slice(0, 25)) {
    const rimBefore = getComputedStyle(e, "::before").boxShadow;
    e.focus({ focusVisible: true });
    if (document.activeElement !== e) continue;
    const s = getComputedStyle(e);
    const rimChanged = e.classList.contains("zm-box") && getComputedStyle(e, "::before").boxShadow !== rimBefore;
    const has = rimChanged || (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== "none";
    if (!has && e.matches(":focus-visible")) noFocus.push(short(e));
  }
  document.activeElement?.blur?.();

  const html = document.documentElement.outerHTML;
  const leaks = ["theta", "\"se\":", "latent_profile", "matricula_hash", "426144", "user_id"].filter((k) => html.includes(k));
  return JSON.stringify({ overflowX: document.documentElement.scrollWidth - innerWidth, small: small.slice(0, 6), lowContrast: lowContrast.slice(0, 6), noFocus: noFocus.slice(0, 6), leaks });
})()
