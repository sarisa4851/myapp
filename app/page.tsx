"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Noto_Sans_Thai } from "next/font/google";

const noto = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "600"],
});

/* ───────────────────────── Types ───────────────────────── */

type Screen = "calc" | "history" | "settings";
type Mode = "basic" | "sci";
type Theme = "light" | "dark" | "system";

type HistoryItem = { id: number; expr: string; result: number };

type Settings = {
  theme: Theme;
  fontLevel: number; // 0–100
  vibrate: boolean;
  sound: boolean;
  group: boolean; // thousands separator
  decimals: number;
};

const DEFAULT_SETTINGS: Settings = {
  theme: "light",
  fontLevel: 50,
  vibrate: true,
  sound: false,
  group: true,
  decimals: 2,
};

const DECIMAL_OPTIONS = [0, 2, 4, 6, 8];
const OPS = ["+", "−", "×", "÷"];
const FUNCS = ["sin", "cos", "tan", "log", "ln"];

/* ───────────────────── Expression evaluator ─────────────────────
   Safe recursive-descent parser (no eval).
   Trig functions use degrees: sin(30) = 0.5
*/

function evaluate(input: string): number {
  const s = input.replace(/\s+/g, "");
  let i = 0;

  const peek = () => s[i];
  const startsPrimary = () => {
    const c = peek();
    if (c === undefined) return false;
    return c === "(" || c === "π" || c === "√" || /[a-z]/.test(c);
  };

  function expr(): number {
    let v = term();
    while (peek() === "+" || peek() === "−" || peek() === "-") {
      const o = s[i++];
      const r = term();
      v = o === "+" ? v + r : v - r;
    }
    return v;
  }

  function term(): number {
    let v = unary();
    for (;;) {
      const c = peek();
      if (c === "×" || c === "÷") {
        i++;
        const r = unary();
        v = c === "×" ? v * r : v / r;
      } else if (startsPrimary()) {
        v = v * unary(); // implicit multiplication: 2π, 3(4)
      } else break;
    }
    return v;
  }

  function unary(): number {
    if (peek() === "−" || peek() === "-") {
      i++;
      return -unary();
    }
    if (peek() === "+") {
      i++;
      return unary();
    }
    return postfix();
  }

  function postfix(): number {
    let v = primary();
    for (;;) {
      if (peek() === "%") {
        i++;
        v /= 100;
      } else if (peek() === "²") {
        i++;
        v = v * v;
      } else break;
    }
    return v;
  }

  function primary(): number {
    const c = peek();
    if (c === "(") {
      i++;
      const v = expr();
      if (peek() === ")") i++;
      return v;
    }
    if (c === "π") {
      i++;
      return Math.PI;
    }
    if (c === "√") {
      i++;
      return Math.sqrt(primary());
    }
    const rest = s.slice(i);
    const fn = FUNCS.find((f) => rest.startsWith(f));
    if (fn) {
      i += fn.length;
      const x = primary();
      const rad = (x * Math.PI) / 180;
      switch (fn) {
        case "sin":
          return Math.sin(rad);
        case "cos":
          return Math.cos(rad);
        case "tan":
          return Math.tan(rad);
        case "log":
          return Math.log10(x);
        default:
          return Math.log(x);
      }
    }
    const m = rest.match(/^(\d+\.?\d*|\.\d+)/);
    if (m) {
      i += m[0].length;
      return parseFloat(m[0]);
    }
    throw new Error("syntax");
  }

  const result = expr();
  if (i < s.length) throw new Error("syntax");
  return Number(result.toPrecision(12)); // clean floating-point noise
}

/** Evaluate while typing: drops trailing operators and auto-closes parentheses. */
function safeEvaluate(expr: string): number | null {
  if (!expr) return null;
  let e = expr.replace(/[+−×÷.]+$/, "");
  if (!e) return null;
  const open = (e.match(/\(/g) || []).length;
  const close = (e.match(/\)/g) || []).length;
  if (open > close) e += ")".repeat(open - close);
  try {
    const v = evaluate(e);
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

function fmt(n: number, decimals: number, group: boolean): string {
  if (!Number.isFinite(n)) return "ข้อผิดพลาด";
  const r = Number(n.toFixed(decimals));
  if (Math.abs(r) >= 1e15) return r.toExponential(6).replace("-", "−");
  return r
    .toLocaleString("en-US", { useGrouping: group, maximumFractionDigits: decimals })
    .replace("-", "−");
}

function rawNumber(n: number): string {
  const t = String(Number(n.toFixed(10)));
  return t.includes("e") ? "" : t.replace("-", "−");
}

/* ───────────────────────── Icons ───────────────────────── */

const svgProps = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const IconHistory = () => (
  <svg {...svgProps}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);
const IconSliders = () => (
  <svg {...svgProps}>
    <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="8" cy="17" r="2" />
  </svg>
);
const IconBack = () => (
  <svg {...svgProps}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
);
const IconTrash = () => (
  <svg {...svgProps}>
    <path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" />
  </svg>
);
const IconBackspace = () => (
  <svg {...svgProps}>
    <path d="M9 6h11v12H9l-5-6z" />
    <path d="M12 9l5 6M17 9l-5 6" />
  </svg>
);
const AppIcon = () => (
  <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
    <rect width="56" height="56" rx="14" fill="#2F4560" />
    <rect x="12" y="10" width="32" height="12" rx="3" fill="#B6C3D3" />
    <g fill="#94A3B8">
      {[30, 38, 46].flatMap((y) =>
        [18, 28, 38].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="3" />)
      )}
    </g>
    <circle cx="38" cy="46" r="3" fill="#fff" />
  </svg>
);

/* ───────────────────────── Page ───────────────────────── */

export default function Page() {
  const [screen, setScreen] = useState<Screen>("calc");
  const [mode, setMode] = useState<Mode>("basic");
  const [expr, setExpr] = useState("");
  const [last, setLast] = useState(""); // equation shown after "="
  const [done, setDone] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);

  /* load / save (wrapped in try/catch: storage may be unavailable) */
  useEffect(() => {
    try {
      const s = localStorage.getItem("calc:settings");
      if (s) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(s) });
      const h = localStorage.getItem("calc:history");
      if (h) setHistory(JSON.parse(h));
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem("calc:settings", JSON.stringify(settings));
      localStorage.setItem("calc:history", JSON.stringify(history));
    } catch {
      /* ignore */
    }
  }, [settings, history, ready]);

  const patch = (p: Partial<Settings>) => setSettings((s) => ({ ...s, ...p }));

  const feedback = useCallback(() => {
    if (settings.vibrate && typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(10);
    }
    if (settings.sound) {
      try {
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioRef.current = audioRef.current || new Ctx();
        const ctx = audioRef.current;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 660;
        gain.gain.value = 0.04;
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.04);
      } catch {
        /* ignore */
      }
    }
  }, [settings.vibrate, settings.sound]);

  /* ── key handling ── */
  const press = (k: string) => {
    feedback();
    const endsValue = /[\d)π%²]$/.test(expr);

    // start fresh after "=" unless an operator / postfix continues the result
    const base = done && !OPS.includes(k) && k !== "%" && k !== "x²" && k !== "±" ? "" : expr;
    if (done && base === "" && k !== "=" && k !== "C" && k !== "⌫") {
      setLast("");
    }
    const append = (str: string, implicitMul = false) => {
      const needMul = implicitMul && /[\d)π%²]$/.test(base);
      setExpr(base + (needMul ? "×" : "") + str);
      setDone(false);
    };

    if (/^\d$/.test(k)) {
      const needMul = /[)π%²]$/.test(base);
      setExpr(base + (needMul ? "×" : "") + k);
      setDone(false);
      return;
    }

    switch (k) {
      case ".": {
        const cur = base.match(/[\d.]*$/)?.[0] ?? "";
        if (cur.includes(".")) return;
        append(cur === "" ? "0." : ".");
        return;
      }
      case "C":
        setExpr("");
        setLast("");
        setDone(false);
        return;
      case "⌫": {
        if (done) {
          setExpr("");
          setLast("");
          setDone(false);
          return;
        }
        const stripped = expr.replace(/(sin\(|cos\(|tan\(|log\(|ln\(|√\()$/, "");
        setExpr(stripped.length !== expr.length ? stripped : expr.slice(0, -1));
        return;
      }
      case "+":
      case "−":
      case "×":
      case "÷": {
        if (base === "") {
          if (k === "−") append("−");
          return;
        }
        if (/[+−×÷]$/.test(base)) {
          // replace trailing operator
          if (base.length === 1 && k !== "−") return;
          setExpr(base.slice(0, -1) + k);
        } else if (base.endsWith("(") && k !== "−") {
          return;
        } else {
          setExpr(base + k);
        }
        setDone(false);
        return;
      }
      case "%":
        if (base !== "" && endsValue) append("%");
        return;
      case "x²":
        if (base !== "" && endsValue) append("²");
        return;
      case "±": {
        if (expr === "") return;
        const m = expr.match(/(\d+\.?\d*|\.\d+)$/);
        if (!m) return;
        const start = expr.length - m[0].length;
        if (expr.slice(start - 2, start) === "(−") {
          setExpr(expr.slice(0, start - 2) + m[0]);
        } else {
          setExpr(expr.slice(0, start) + "(−" + m[0]);
        }
        setDone(false);
        return;
      }
      case "(":
        append("(", true);
        return;
      case ")": {
        const open = (base.match(/\(/g) || []).length;
        const close = (base.match(/\)/g) || []).length;
        if (open > close && endsValue) append(")");
        return;
      }
      case "π":
        append("π", true);
        return;
      case "sin":
      case "cos":
      case "tan":
      case "log":
      case "ln":
        append(k + "(", true);
        return;
      case "√":
        append("√(", true);
        return;
      case "=": {
        if (expr === "" || done) return;
        const v = safeEvaluate(expr);
        if (v === null) return;
        setHistory((h) => [{ id: Date.now(), expr, result: v }, ...h].slice(0, 100));
        setLast(expr);
        setExpr(rawNumber(v));
        setDone(true);
        return;
      }
    }
  };

  /* ── derived display ── */
  const live = useMemo(() => safeEvaluate(expr), [expr]);
  const bigText = expr === "" ? "0" : live === null ? "…" : fmt(live, settings.decimals, settings.group);
  const topText = done ? last : expr;
  const scale = 0.8 + (settings.fontLevel / 100) * 0.4;
  const bigSize =
    (bigText.length > 14 ? 34 : bigText.length > 10 ? 44 : bigText.length > 7 ? 56 : mode === "sci" ? 64 : 72) *
    scale;

  const rootStyle = { ["--fs" as string]: scale } as React.CSSProperties;

  /* ── UI pieces ── */
  const Key = ({ label, cls = "", aria, children }: { label: string; cls?: string; aria?: string; children?: React.ReactNode }) => (
    <button type="button" className={`k ${cls}`} aria-label={aria} onClick={() => press(label)}>
      {children ?? label}
    </button>
  );

  const sciRow = ["sin", "cos", "tan", "(", ")", "log", "ln", "√", "x²", "π"];
  const pad = mode === "sci" ? "m" : "";
  const mainKeys: { l: string; c: string }[] = [
    { l: "C", c: "u" }, { l: "⌫", c: "u" }, { l: "%", c: "u" }, { l: "÷", c: "o" },
    { l: "7", c: "" }, { l: "8", c: "" }, { l: "9", c: "" }, { l: "×", c: "o" },
    { l: "4", c: "" }, { l: "5", c: "" }, { l: "6", c: "" }, { l: "−", c: "o" },
    { l: "1", c: "" }, { l: "2", c: "" }, { l: "3", c: "" }, { l: "+", c: "o" },
    { l: "±", c: "" }, { l: "0", c: "" }, { l: ".", c: "" }, { l: "=", c: "e" },
  ];

  return (
    <div className={`root ${noto.className}`} data-theme={settings.theme} style={rootStyle}>
      <style>{css}</style>

      <main className="s">
        {/* ───────── 1 + 2 · Calculator (basic / scientific) ───────── */}
        {screen === "calc" && (
          <>
            <header className="top">
              <button type="button" className="ib" aria-label="ประวัติ" onClick={() => setScreen("history")}>
                <IconHistory />
              </button>
              <h1 className="t">เครื่องคิดเลข</h1>
              <button type="button" className="ib" aria-label="ตั้งค่า" onClick={() => setScreen("settings")}>
                <IconSliders />
              </button>
            </header>

            <div className="seg" role="tablist" style={{ marginTop: 12 }}>
              <button type="button" role="tab" aria-selected={mode === "basic"} className={mode === "basic" ? "on" : ""} onClick={() => setMode("basic")}>
                พื้นฐาน
              </button>
              <button type="button" role="tab" aria-selected={mode === "sci"} className={mode === "sci" ? "on" : ""} onClick={() => setMode("sci")}>
                วิทยาศาสตร์
              </button>
            </div>

            <section className="dp" aria-live="polite">
              <span className="expr">{topText || "\u00A0"}</span>
              <span className="big" style={{ fontSize: bigSize }}>{bigText}</span>
            </section>

            {mode === "sci" && (
              <div className="g sci">
                {sciRow.map((l) => (
                  <Key key={l} label={l} cls="f" />
                ))}
              </div>
            )}

            <div className="g">
              {mainKeys.map(({ l, c }) => (
                <Key key={l} label={l} cls={`${c} ${pad}`} aria={l === "⌫" ? "ลบ" : undefined}>
                  {l === "⌫" ? <IconBackspace /> : undefined}
                </Key>
              ))}
            </div>
          </>
        )}

        {/* ───────── 3 · History ───────── */}
        {screen === "history" && (
          <>
            <header className="top">
              <button type="button" className="ib" aria-label="กลับ" onClick={() => setScreen("calc")}>
                <IconBack />
              </button>
              <h1 className="t">ประวัติ</h1>
              <button type="button" className="ib" aria-label="ล้างประวัติ" onClick={() => setHistory([])}>
                <IconTrash />
              </button>
            </header>

            <div className="cd summary">
              <AppIcon />
              <div>
                <div className="b">วันนี้</div>
                <div className="m">คำนวณแล้ว {history.length} รายการ</div>
              </div>
            </div>

            <div className="list">
              {history.length === 0 && <p className="empty">ยังไม่มีประวัติการคำนวณ</p>}
              {history.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  className="li"
                  onClick={() => {
                    setExpr(rawNumber(h.result));
                    setLast(h.expr);
                    setDone(true);
                    setScreen("calc");
                  }}
                >
                  <span className="le">{h.expr}</span>
                  <span className="lr">{fmt(h.result, settings.decimals, settings.group)}</span>
                </button>
              ))}
            </div>

            <button type="button" className="k e clear" onClick={() => setHistory([])} disabled={history.length === 0}>
              ล้างประวัติทั้งหมด
            </button>
          </>
        )}

        {/* ───────── 4 · Settings ───────── */}
        {screen === "settings" && (
          <>
            <header className="top">
              <button type="button" className="ib" aria-label="กลับ" onClick={() => setScreen("calc")}>
                <IconBack />
              </button>
              <h1 className="t">ตั้งค่า</h1>
              <span style={{ width: 44 }} />
            </header>

            <h2 className="h">การแสดงผล</h2>
            <div className="seg" role="radiogroup" aria-label="ธีม" style={{ marginBottom: 12 }}>
              {([["light", "สว่าง"], ["dark", "มืด"], ["system", "ตามระบบ"]] as [Theme, string][]).map(([v, l]) => (
                <button key={v} type="button" role="radio" aria-checked={settings.theme === v} className={settings.theme === v ? "on" : ""} onClick={() => patch({ theme: v })}>
                  {l}
                </button>
              ))}
            </div>
            <div className="cd">
              <div className="r">
                <label htmlFor="fs">ขนาดตัวอักษร</label>
                <input id="fs" className="range" type="range" min={0} max={100} value={settings.fontLevel} onChange={(e) => patch({ fontLevel: Number(e.target.value) })} />
              </div>
            </div>

            <h2 className="h">การทำงาน</h2>
            <div className="cd">
              <div className="r">
                <span>สั่นเมื่อกดปุ่ม</span>
                <button type="button" role="switch" aria-checked={settings.vibrate} aria-label="สั่นเมื่อกดปุ่ม" className={`tg ${settings.vibrate ? "on" : ""}`} onClick={() => patch({ vibrate: !settings.vibrate })}>
                  <i />
                </button>
              </div>
              <div className="r">
                <span>เสียงปุ่ม</span>
                <button type="button" role="switch" aria-checked={settings.sound} aria-label="เสียงปุ่ม" className={`tg ${settings.sound ? "on" : ""}`} onClick={() => patch({ sound: !settings.sound })}>
                  <i />
                </button>
              </div>
              <div className="r">
                <span>ตัวคั่นหลักพัน</span>
                <button type="button" role="switch" aria-checked={settings.group} aria-label="ตัวคั่นหลักพัน" className={`tg ${settings.group ? "on" : ""}`} onClick={() => patch({ group: !settings.group })}>
                  <i />
                </button>
              </div>
              <button
                type="button"
                className="r rb"
                onClick={() => patch({ decimals: DECIMAL_OPTIONS[(DECIMAL_OPTIONS.indexOf(settings.decimals) + 1) % DECIMAL_OPTIONS.length] })}
              >
                <span>ตำแหน่งทศนิยม</span>
                <span className="mu">{settings.decimals} ตำแหน่ง ›</span>
              </button>
            </div>

            <h2 className="h">เกี่ยวกับ</h2>
            <div className="cd about">
              <AppIcon />
              <div>
                <div className="b">เครื่องคิดเลข</div>
                <div className="m">เวอร์ชัน 1.0.0</div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

/* ───────────────────────── Styles ───────────────────────── */

const css = `
.root{
  --bg:#E8EDF2;--card:#fff;--key:#fff;--util:#D5DEE8;--op:#5B7490;--eq:#2F4560;
  --text:#1E293B;--muted:#475569;--line:#E2E8F0;--seg:#D5DEE8;--segon:#fff;--segtext:#334155;
  --icon:#2F4560;--dp:#1E2D3F;--dptext:#F1F5F9;--dpmuted:#B6C3D3;--off:#94A3B8;--shadow:rgba(30,45,63,.2);
  min-height:100dvh;background:var(--bg);color:var(--text);display:flex;justify-content:center;
}
.root[data-theme="dark"]{
  --bg:#0F1722;--card:#1C2938;--key:#223246;--util:#2F4157;--op:#46627F;--eq:#3E6A9A;
  --text:#E2E8F0;--muted:#A8B7C8;--line:#2B3A4D;--seg:#1C2938;--segon:#2F4157;--segtext:#B6C3D3;
  --icon:#D5DEE8;--dp:#0A111B;--dptext:#F1F5F9;--dpmuted:#9FB0C4;--off:#566579;--shadow:rgba(0,0,0,.45);
}
@media (prefers-color-scheme: dark){
  .root[data-theme="system"]{
    --bg:#0F1722;--card:#1C2938;--key:#223246;--util:#2F4157;--op:#46627F;--eq:#3E6A9A;
    --text:#E2E8F0;--muted:#A8B7C8;--line:#2B3A4D;--seg:#1C2938;--segon:#2F4157;--segtext:#B6C3D3;
    --icon:#D5DEE8;--dp:#0A111B;--dptext:#F1F5F9;--dpmuted:#9FB0C4;--off:#566579;--shadow:rgba(0,0,0,.45);
  }
}
.root *{box-sizing:border-box}
.s{width:100%;max-width:430px;height:100dvh;display:flex;flex-direction:column;
  padding:max(16px,env(safe-area-inset-top)) 20px max(20px,env(safe-area-inset-bottom));overflow-y:auto}
.top{height:56px;flex:none;display:flex;align-items:center;justify-content:space-between}
.t{font-size:18px;font-weight:600;margin:0}
.ib{width:44px;height:44px;padding:0;border:0;border-radius:12px;background:var(--card);
  box-shadow:0 1px 3px var(--shadow);color:var(--icon);display:flex;align-items:center;justify-content:center;cursor:pointer}
.k{border:0;border-radius:16px;background:var(--key);box-shadow:0 1px 2px var(--shadow);font:inherit;font-size:26px;
  color:var(--text);display:flex;align-items:center;justify-content:center;height:clamp(58px,9.2dvh,76px);cursor:pointer;
  transition:transform .06s,filter .1s}
.k:active{transform:scale(.96);filter:brightness(.94)}
.k.u{background:var(--util)}
.k.o{background:var(--op);color:#fff}
.k.e{background:var(--eq);color:#fff}
.k.f{height:48px;font-size:16px;border-radius:12px}
.k.m{height:clamp(52px,7.4dvh,64px)}
.g{display:grid;gap:12px;grid-template-columns:repeat(4,1fr)}
.g.sci{grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:12px}
.seg{height:44px;flex:none;margin:0 0 16px;display:flex;background:var(--seg);border-radius:12px;padding:4px}
.seg button{flex:1;border:0;background:transparent;font:inherit;font-size:14px;border-radius:9px;color:var(--segtext);cursor:pointer}
.seg .on{background:var(--segon);color:var(--text);font-weight:600;box-shadow:0 1px 2px var(--shadow)}
.dp{flex:1;min-height:120px;display:flex;flex-direction:column;justify-content:flex-end;align-items:flex-end;
  padding:0 20px 20px;gap:8px;background:var(--dp);color:var(--dptext);border-radius:24px;margin-bottom:16px;overflow:hidden}
.expr{font-size:calc(20px * var(--fs));color:var(--dpmuted);max-width:100%;overflow-x:auto;white-space:nowrap}
.big{font-weight:300;line-height:1;max-width:100%;overflow-x:auto;white-space:nowrap}
.cd{background:var(--card);border-radius:16px;padding:0 16px;box-shadow:0 1px 2px var(--shadow)}
.r{height:56px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;font-size:16px}
.r:last-child{border-bottom:0}
.rb{width:100%;background:transparent;border-left:0;border-right:0;border-top:0;font:inherit;color:inherit;cursor:pointer;padding:0}
.mu{color:var(--muted)}
.h{font-size:13px;font-weight:400;color:var(--muted);margin:20px 0 8px 4px}
.tg{width:48px;height:28px;padding:0;border:0;border-radius:14px;background:var(--off);position:relative;cursor:pointer;transition:background .15s}
.tg i{position:absolute;top:4px;left:4px;width:20px;height:20px;border-radius:50%;background:#fff;transition:left .15s}
.tg.on{background:var(--eq)}
.tg.on i{left:24px}
.range{width:140px;accent-color:var(--op)}
.summary,.about{display:flex;align-items:center;gap:16px}
.summary{margin:12px 0 16px;height:80px}
.about{height:88px}
.b{font-size:16px;font-weight:600}
.m{font-size:14px;color:var(--muted)}
.list{flex:1;overflow-y:auto;display:flex;flex-direction:column}
.li{flex:none;width:100%;height:72px;border:0;border-radius:16px;margin-bottom:10px;padding:0 16px;display:flex;align-items:center;
  justify-content:space-between;background:var(--card);box-shadow:0 1px 2px var(--shadow);font:inherit;color:var(--text);cursor:pointer}
.le{font-size:16px;color:var(--muted);max-width:55%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lr{font-size:24px;font-weight:600}
.empty{color:var(--muted);text-align:center;margin-top:40px}
.clear{flex:none;height:56px;font-size:16px;margin-top:8px}
.clear:disabled{opacity:.5;cursor:default}
`;
