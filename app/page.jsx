"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Plus, Pencil, Trash2, X, Check, Wallet, TrendingUp, TrendingDown,
  Coins, RotateCcw, Sparkles, RefreshCw,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  "Private-ledger" theme: deep navy board, warm brass accent for the */
/*  dividend figures, white cards, emerald / rose only as P&L signals. */
/* ------------------------------------------------------------------ */
const C = {
  bg: "#EEF1F6", panel: "#0E1F3A", panelSoft: "#16294A", card: "#FFFFFF",
  border: "#E2E6EE", ink: "#13203B", muted: "#6B7689", gold: "#C8A24B",
  goldDark: "#9A7B2E", gain: "#0E9F6E", loss: "#E0484A",
  onNavy: "#FFFFFF", onNavyMuted: "#9FB0CC",
};
const SEG = ["#2A4E80", "#C8A24B", "#2A9D8F", "#6E7FA6", "#9B6FA0", "#7E8A57", "#B5793B", "#4C8C9B"];

const STORE_KEY = "stock-portfolio-holdings-v1";

const SAMPLE = [
  { name: "トヨタ自動車", ticker: "7203.T", shares: 100, avgPrice: 2800, currentPrice: 3200, dividendPerShare: 90 },
  { name: "三菱UFJ FG", ticker: "8306.T", shares: 200, avgPrice: 1200, currentPrice: 1850, dividendPerShare: 60 },
  { name: "NTT", ticker: "9432.T", shares: 300, avgPrice: 160, currentPrice: 155, dividendPerShare: 5.2 },
];

/* ----------------------------- helpers ---------------------------- */
const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : "id-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);

const yen = (n) => "¥" + Math.round(n || 0).toLocaleString("ja-JP");
const signedYen = (n) => (n >= 0 ? "+" : "−") + "¥" + Math.abs(Math.round(n || 0)).toLocaleString("ja-JP");
const pct = (n) => (isFinite(n) ? n.toFixed(2) : "0.00") + "%";
const signedPct = (n) => (n >= 0 ? "+" : "−") + Math.abs(isFinite(n) ? n : 0).toFixed(2) + "%";
const price = (n) =>
  Number.isInteger(n) ? n.toLocaleString("ja-JP") : (n || 0).toLocaleString("ja-JP", { maximumFractionDigits: 2 });
const clock = (ts) =>
  ts ? new Date(ts).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) : "";

function compute(h) {
  const cost = h.shares * h.avgPrice;
  const value = h.shares * h.currentPrice;
  const pl = value - cost;
  const plPct = cost > 0 ? (pl / cost) * 100 : 0;
  const annualDiv = h.shares * h.dividendPerShare;
  const yieldNow = h.currentPrice > 0 ? (h.dividendPerShare / h.currentPrice) * 100 : 0;
  const yieldCost = h.avgPrice > 0 ? (h.dividendPerShare / h.avgPrice) * 100 : 0;
  return { cost, value, pl, plPct, annualDiv, yieldNow, yieldCost };
}

/* ------------------------------ Page ------------------------------ */
export default function Page() {
  const [holdings, setHoldings] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);

  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshMsg, setRefreshMsg] = useState("");

  /* load from this browser */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.holdings)) {
          setHoldings(parsed.holdings);
          setLastUpdated(parsed.lastUpdated || null);
        } else if (Array.isArray(parsed)) {
          setHoldings(parsed);
        }
      }
    } catch (e) {
      /* no saved data yet */
    } finally {
      setLoaded(true);
    }
  }, []);

  /* save */
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ holdings, lastUpdated }));
    } catch (e) {
      /* storage full / unavailable — keep working in memory */
    }
  }, [holdings, lastUpdated, loaded]);

  const totals = useMemo(() => {
    let cost = 0, value = 0, annualDiv = 0;
    holdings.forEach((h) => {
      const d = compute(h);
      cost += d.cost; value += d.value; annualDiv += d.annualDiv;
    });
    const pl = value - cost;
    return {
      cost, value, pl,
      plPct: cost > 0 ? (pl / cost) * 100 : 0,
      annualDiv,
      yieldNow: value > 0 ? (annualDiv / value) * 100 : 0,
    };
  }, [holdings]);

  const upsert = (data) => {
    setHoldings((prev) =>
      data.id ? prev.map((h) => (h.id === data.id ? data : h)) : [...prev, { ...data, id: uid() }]
    );
    setEditing(null);
    setAdding(false);
  };
  const remove = (id) => {
    setHoldings((p) => p.filter((h) => h.id !== id));
    setPendingDelete(null);
  };
  const resetAll = () => {
    setHoldings([]);
    setLastUpdated(null);
    setPendingDelete(null);
    try { localStorage.removeItem(STORE_KEY); } catch (e) {}
  };

  /* ---- the refresh button: pull latest prices from /api/quote ---- */
  const refresh = useCallback(async () => {
    const withTicker = holdings.filter((h) => h.ticker && h.ticker.trim());
    const symbols = [...new Set(withTicker.map((h) => h.ticker.trim()))];
    if (!symbols.length) {
      setRefreshMsg("ティッカー（例 7203.T）が登録されていません");
      return;
    }
    setRefreshing(true);
    setRefreshMsg("");
    try {
      const res = await fetch("/api/quote?symbols=" + encodeURIComponent(symbols.join(",")));
      if (!res.ok) throw new Error("server " + res.status);
      const json = await res.json();
      const map = {};
      (json.quotes || []).forEach((q) => { if (q.ok) map[q.symbol] = q.price; });
      const okCount = Object.keys(map).length;

      setHoldings((prev) =>
        prev.map((h) =>
          h.ticker && map[h.ticker.trim()] != null
            ? { ...h, currentPrice: map[h.ticker.trim()] }
            : h
        )
      );
      const now = Date.now();
      setLastUpdated(now);
      const failed = symbols.length - okCount;
      const skipped = holdings.length - withTicker.length;
      setRefreshMsg(
        `${okCount}件を更新` +
          (failed > 0 ? ` / ${failed}件は取得できず` : "") +
          (skipped > 0 ? ` / ${skipped}件はティッカー未登録` : "")
      );
    } catch (e) {
      setRefreshMsg("取得に失敗しました。時間をおいて再試行してください。");
    } finally {
      setRefreshing(false);
    }
  }, [holdings]);

  return (
    <main className="min-h-screen w-full">
      <div className="mx-auto w-full max-w-2xl px-4 pb-12 pt-6">
        {/* header */}
        <header className="mb-5 flex items-end justify-between gap-3">
          <div>
            <div className="wm t11 font-semibold" style={{ color: C.gold }}>PORTFOLIO LEDGER</div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">保有株 ぜんぶ一括ビュー</h1>
          </div>
          {holdings.length > 0 && (
            <button
              onClick={() => setPendingDelete("__all__")}
              aria-label="すべてリセット"
              className="ix flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 t11"
              style={{ color: C.muted, background: "#fff", border: `1px solid ${C.border}` }}
            >
              <RotateCcw size={13} /> リセット
            </button>
          )}
        </header>

        <SummaryBoard
          t={totals}
          count={holdings.length}
          onRefresh={refresh}
          refreshing={refreshing}
          lastUpdated={lastUpdated}
          canRefresh={holdings.some((h) => h.ticker && h.ticker.trim())}
        />

        {refreshMsg && (
          <p className="mt-2 text-center text-xs" style={{ color: C.muted }}>{refreshMsg}</p>
        )}

        {holdings.length > 0 && <Allocation holdings={holdings} totalValue={totals.value} />}

        {!loaded ? (
          <div className="mt-6 text-center text-sm" style={{ color: C.muted }}>読み込み中…</div>
        ) : holdings.length === 0 ? (
          <Empty
            onAdd={() => setAdding(true)}
            onSample={() => setHoldings(SAMPLE.map((s) => ({ ...s, id: uid() })))}
          />
        ) : (
          <ul className="mt-5 space-y-3">
            {holdings.map((h, i) => (
              <HoldingCard
                key={h.id}
                h={h}
                weight={totals.value > 0 ? (compute(h).value / totals.value) * 100 : 0}
                color={SEG[i % SEG.length]}
                pending={pendingDelete === h.id}
                onEdit={() => setEditing(h)}
                onAskDelete={() => setPendingDelete(h.id)}
                onCancelDelete={() => setPendingDelete(null)}
                onConfirmDelete={() => remove(h.id)}
              />
            ))}
          </ul>
        )}

        {loaded && holdings.length > 0 && (
          <button
            onClick={() => setAdding(true)}
            className="ix mt-4 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold"
            style={{ color: C.panel, background: "#fff", border: `1.5px dashed ${C.gold}` }}
          >
            <Plus size={18} /> 銘柄を追加
          </button>
        )}

        <p className="mt-6 text-center text-xs leading-relaxed" style={{ color: C.muted }}>
          株価は更新ボタンで取得した時点の値（遅延あり）です。データはこのブラウザに保存されます。<br />
          投資の判断はご自身で行ってください。
        </p>
      </div>

      {(adding || editing) && (
        <FormModal
          initial={editing}
          onClose={() => { setAdding(false); setEditing(null); }}
          onSave={upsert}
        />
      )}

      {pendingDelete === "__all__" && (
        <ConfirmModal
          title="すべての銘柄を削除しますか？"
          body="保存したデータが消えます。この操作は元に戻せません。"
          confirmLabel="すべて削除"
          onCancel={() => setPendingDelete(null)}
          onConfirm={resetAll}
        />
      )}
    </main>
  );
}

/* -------------------------- Summary board ------------------------- */
function SummaryBoard({ t, count, onRefresh, refreshing, lastUpdated, canRefresh }) {
  const up = t.pl >= 0;
  return (
    <section className="overflow-hidden rounded-3xl" style={{ background: C.panel, boxShadow: "0 16px 40px rgba(14,31,58,.28)" }}>
      <div className="px-6 pt-6 pb-5">
        <div className="flex items-center gap-2 text-xs" style={{ color: C.onNavyMuted }}>
          <Wallet size={14} /> 評価額の合計
          <span className="num ml-auto">{count} 銘柄</span>
          <button
            onClick={onRefresh}
            disabled={refreshing || !canRefresh}
            aria-label="最新株価に更新"
            className="ix flex items-center gap-1 rounded-full px-3 py-1 t11 font-semibold"
            style={{
              background: canRefresh ? C.gold : "rgba(255,255,255,.12)",
              color: canRefresh ? C.panel : C.onNavyMuted,
              cursor: refreshing || !canRefresh ? "default" : "pointer",
            }}
          >
            <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "更新中" : "更新"}
          </button>
        </div>

        <div className="num mt-1 text-4xl font-bold" style={{ color: C.onNavy }}>{yen(t.value)}</div>

        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          {up ? <TrendingUp size={16} color={C.gain} /> : <TrendingDown size={16} color={C.loss} />}
          <span className="num text-base font-semibold" style={{ color: up ? C.gain : C.loss }}>{signedYen(t.pl)}</span>
          <span className="num text-sm font-medium" style={{ color: up ? C.gain : C.loss }}>({signedPct(t.plPct)})</span>
          <span className="t11" style={{ color: C.onNavyMuted }}>評価損益</span>
          {lastUpdated && (
            <span className="num ml-auto t10" style={{ color: C.onNavyMuted }}>最終更新 {clock(lastUpdated)}</span>
          )}
        </div>
      </div>

      <div className="flex items-stretch border-t" style={{ borderColor: "rgba(255,255,255,.08)" }}>
        <Stat label="取得額の合計" value={yen(t.cost)} />
        <div className="w-px" style={{ background: "rgba(255,255,255,.08)" }} />
        <Stat label="年間配当（見込み）" value={yen(t.annualDiv)} accent />
        <div className="w-px" style={{ background: "rgba(255,255,255,.08)" }} />
        <Stat label="配当利回り" value={pct(t.yieldNow)} accent big />
      </div>
    </section>
  );
}

function Stat({ label, value, accent, big }) {
  return (
    <div className="flex-1 px-4 py-3.5">
      <div className="flex items-center gap-1 t11" style={{ color: C.onNavyMuted }}>
        {accent && <Coins size={11} color={C.gold} />} {label}
      </div>
      <div className={"num mt-0.5 font-bold " + (big ? "text-xl" : "text-base")} style={{ color: accent ? C.gold : C.onNavy }}>
        {value}
      </div>
    </div>
  );
}

/* ---------------------- Allocation ribbon ------------------------- */
function Allocation({ holdings, totalValue }) {
  const items = holdings
    .map((h, i) => ({ name: h.name, w: totalValue > 0 ? (compute(h).value / totalValue) * 100 : 0, c: SEG[i % SEG.length] }))
    .filter((x) => x.w > 0)
    .sort((a, b) => b.w - a.w);
  if (!items.length) return null;
  return (
    <section className="mt-4 rounded-2xl p-4" style={{ background: "#fff", border: `1px solid ${C.border}` }}>
      <div className="mb-2.5 text-xs font-semibold" style={{ color: C.muted }}>構成比（評価額ベース）</div>
      <div className="flex h-3 w-full overflow-hidden rounded-full" style={{ background: "#EDF0F5" }}>
        {items.map((x, i) => (
          <div key={i} className="seg h-full" style={{ width: x.w + "%", background: x.c }} title={`${x.name} ${x.w.toFixed(1)}%`} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {items.map((x, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs" style={{ color: C.ink }}>
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: x.c }} />
            <span className="nmclip truncate">{x.name}</span>
            <span className="num font-semibold" style={{ color: C.muted }}>{x.w.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* -------------------------- Holding card -------------------------- */
function HoldingCard({ h, weight, color, pending, onEdit, onAskDelete, onCancelDelete, onConfirmDelete }) {
  const d = compute(h);
  const up = d.pl >= 0;
  const plColor = up ? C.gain : C.loss;
  return (
    <li className="row-in overflow-hidden rounded-2xl" style={{ background: "#fff", border: `1px solid ${C.border}`, boxShadow: "0 2px 8px rgba(19,32,59,.04)" }}>
      <div className="flex items-start gap-3 px-4 pt-3.5">
        <span className="mt-1.5 h-3 w-1 shrink-0 rounded-full" style={{ background: color }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate t15 font-bold leading-tight">{h.name}</span>
            {h.ticker && <span className="num t10 shrink-0 rounded px-1.5 py-0.5" style={{ color: C.muted, background: "#F1F4F9" }}>{h.ticker}</span>}
          </div>
          <div className="num mt-0.5 text-xs" style={{ color: C.muted }}>
            {price(h.shares)}株 · 取得 ¥{price(h.avgPrice)} → 現在 ¥{price(h.currentPrice)}
          </div>
        </div>
        <div className="text-right">
          <div className="num t15 font-bold" style={{ color: plColor }}>{signedYen(d.pl)}</div>
          <div className="num text-xs font-semibold" style={{ color: plColor }}>{signedPct(d.plPct)}</div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 border-t" style={{ borderColor: C.border }}>
        <Cell label="評価額" value={yen(d.value)} />
        <Cell label="年間配当" value={yen(d.annualDiv)} divider />
        <Cell label="利回り" value={pct(d.yieldNow)} sub={"取得 " + pct(d.yieldCost)} divider accent />
      </div>

      <div className="flex items-center justify-between px-4 py-2.5" style={{ background: "#FAFBFD", borderTop: `1px solid ${C.border}` }}>
        <span className="num text-xs" style={{ color: C.muted }}>構成比 {weight.toFixed(1)}%</span>
        {pending ? (
          <span className="flex items-center gap-2">
            <span className="text-xs" style={{ color: C.loss }}>削除しますか？</span>
            <button onClick={onConfirmDelete} className="ix rounded-md px-2 py-1 text-xs font-semibold text-white" style={{ background: C.loss }}>削除</button>
            <button onClick={onCancelDelete} className="ix rounded-md px-2 py-1 text-xs" style={{ color: C.muted, border: `1px solid ${C.border}` }}>取消</button>
          </span>
        ) : (
          <span className="flex items-center gap-1">
            <button onClick={onEdit} aria-label="編集" className="ix flex items-center gap-1 rounded-md px-2 py-1 text-xs" style={{ color: C.ink, border: `1px solid ${C.border}` }}>
              <Pencil size={12} /> 編集
            </button>
            <button onClick={onAskDelete} aria-label="削除" className="ix flex h-7 w-7 items-center justify-center rounded-md" style={{ color: C.muted, border: `1px solid ${C.border}` }}>
              <Trash2 size={13} />
            </button>
          </span>
        )}
      </div>
    </li>
  );
}

function Cell({ label, value, sub, divider, accent }) {
  return (
    <div className="px-3 py-2.5" style={divider ? { borderLeft: `1px solid ${C.border}` } : undefined}>
      <div className="t11" style={{ color: C.muted }}>{label}</div>
      <div className="num text-sm font-bold" style={{ color: accent ? C.goldDark : C.ink }}>{value}</div>
      {sub && <div className="num t10" style={{ color: C.muted }}>{sub}</div>}
    </div>
  );
}

/* ----------------------------- Empty ------------------------------ */
function Empty({ onAdd, onSample }) {
  return (
    <div className="mt-5 rounded-2xl px-6 py-10 text-center" style={{ background: "#fff", border: `1px dashed ${C.border}` }}>
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "#F3F6FB", color: C.gold }}>
        <Sparkles size={22} />
      </div>
      <div className="text-base font-bold">まだ銘柄がありません</div>
      <p className="mx-auto mt-1 max-w-xs text-sm leading-relaxed" style={{ color: C.muted }}>
        保有株を追加すると、損益と配当利回りがまとめて見えます。ティッカー（例 7203.T）を入れると更新ボタンで株価を取得できます。
      </p>
      <div className="mt-5 flex flex-col items-center gap-2">
        <button onClick={onAdd} className="ix flex w-full max-w-xs items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white" style={{ background: C.panel }}>
          <Plus size={18} /> 最初の銘柄を追加
        </button>
        <button onClick={onSample} className="ix text-xs font-medium" style={{ color: C.gold }}>サンプルを入れて試す</button>
      </div>
    </div>
  );
}

/* ----------------------------- Modals ----------------------------- */
function Shell({ children, onClose }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" style={{ background: "rgba(10,16,30,.55)" }} onClick={onClose}>
      <div
        className="row-in w-full max-w-md rounded-t-3xl p-5 sm:rounded-3xl"
        style={{ background: "#fff", boxShadow: "0 -10px 40px rgba(0,0,0,.25)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function ConfirmModal({ title, body, confirmLabel, onCancel, onConfirm }) {
  return (
    <Shell onClose={onCancel}>
      <div className="text-lg font-bold">{title}</div>
      <p className="mt-1.5 text-sm leading-relaxed" style={{ color: C.muted }}>{body}</p>
      <div className="mt-5 flex gap-2">
        <button onClick={onCancel} className="ix flex-1 rounded-xl py-3 text-sm font-semibold" style={{ color: C.ink, border: `1px solid ${C.border}` }}>キャンセル</button>
        <button onClick={onConfirm} className="ix flex-1 rounded-xl py-3 text-sm font-semibold text-white" style={{ background: C.loss }}>{confirmLabel}</button>
      </div>
    </Shell>
  );
}

function FormModal({ initial, onClose, onSave }) {
  const [f, setF] = useState({
    name: initial?.name ?? "",
    ticker: initial?.ticker ?? "",
    shares: initial?.shares != null ? String(initial.shares) : "",
    avgPrice: initial?.avgPrice != null ? String(initial.avgPrice) : "",
    currentPrice: initial?.currentPrice != null ? String(initial.currentPrice) : "",
    dividendPerShare: initial?.dividendPerShare != null ? String(initial.dividendPerShare) : "",
  });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const num = (s) => { const n = Number(s); return isFinite(n) ? n : 0; };
  const valid = f.name.trim() !== "" && num(f.shares) > 0;

  const submit = () => {
    if (!valid) return;
    onSave({
      id: initial?.id,
      name: f.name.trim(),
      ticker: f.ticker.trim(),
      shares: num(f.shares),
      avgPrice: num(f.avgPrice),
      currentPrice: num(f.currentPrice),
      dividendPerShare: num(f.dividendPerShare),
    });
  };

  return (
    <Shell onClose={onClose}>
      <div className="mb-4 flex items-center justify-between">
        <div className="text-lg font-bold">{initial ? "銘柄を編集" : "銘柄を追加"}</div>
        <button onClick={onClose} aria-label="閉じる" className="ix flex h-8 w-8 items-center justify-center rounded-full" style={{ color: C.muted, background: "#F3F6FB" }}>
          <X size={18} />
        </button>
      </div>

      <Input label="銘柄名" placeholder="例）トヨタ自動車" value={f.name} onChange={set("name")} />
      <Input label="ティッカー" placeholder="例）7203.T（東証）AAPL（米国）" value={f.ticker} onChange={set("ticker")} hint="更新ボタン用・任意" />
      <div className="grid grid-cols-2 gap-3">
        <Input label="株数" unit="株" value={f.shares} onChange={set("shares")} numeric />
        <Input label="取得単価" unit="円" value={f.avgPrice} onChange={set("avgPrice")} numeric />
        <Input label="現在値" unit="円" value={f.currentPrice} onChange={set("currentPrice")} numeric hint="更新で上書き" />
        <Input label="1株あたり年間配当" unit="円" value={f.dividendPerShare} onChange={set("dividendPerShare")} numeric hint="なければ 0" />
      </div>

      <button
        onClick={submit}
        disabled={!valid}
        className="ix mt-5 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold text-white"
        style={{ background: valid ? C.panel : "#AEB7C6", cursor: valid ? "pointer" : "not-allowed" }}
      >
        <Check size={18} /> {initial ? "保存する" : "追加する"}
      </button>
      {!valid && <p className="mt-2 text-center text-xs" style={{ color: C.muted }}>銘柄名と株数を入れてください</p>}
    </Shell>
  );
}

function Input({ label, unit, hint, numeric, ...rest }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-xs font-medium" style={{ color: C.muted }}>
        {label}{hint && <span className="ml-1" style={{ color: "#A6AEBC" }}>（{hint}）</span>}
      </span>
      <span className="flex items-center rounded-xl border bg-white px-3" style={{ borderColor: C.border }}>
        <input {...rest} inputMode={numeric ? "decimal" : "text"} className="fld num t15 w-full bg-transparent py-2.5" style={{ color: C.ink }} />
        {unit && <span className="ml-2 shrink-0 text-xs" style={{ color: C.muted }}>{unit}</span>}
      </span>
    </label>
  );
}
