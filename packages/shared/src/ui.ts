/**
 * Renderização HTML mínima, no servidor, usada pelo CRM simples, pelo ERP simples e pelo painel.
 * Sem framework de front-end (ver ADR-010).
 */

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type BadgeKind = "ok" | "warn" | "danger" | "info" | "muted";

export function badge(text: string, kind: BadgeKind = "muted"): string {
  return `<span class="badge badge-${kind}">${escapeHtml(text)}</span>`;
}

export interface Column<T> {
  header: string;
  /** HTML já escapado pelo chamador. */
  render: (row: T) => string;
  align?: "right";
}

export function table<T>(columns: Column<T>[], rows: T[], emptyText = "Nada para mostrar ainda."): string {
  if (rows.length === 0) return `<p class="empty">${escapeHtml(emptyText)}</p>`;
  const head = columns.map((c) => `<th${c.align ? ` class="${c.align}"` : ""}>${escapeHtml(c.header)}</th>`).join("");
  const body = rows
    .map((row) => `<tr>${columns.map((c) => `<td${c.align ? ` class="${c.align}"` : ""}>${c.render(row)}</td>`).join("")}</tr>`)
    .join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

export interface PageOptions {
  title: string;
  app: string;
  accent: string;
  nav?: { href: string; label: string; active?: boolean }[];
  /** Aviso fixo no topo (por exemplo, "sistema simples criado para o estudo"). */
  notice?: string;
  banner?: string;
  body: string;
  refreshSeconds?: number;
}

const css = (accent: string): string => `
:root{--accent:${accent};--bg:#f6f7f9;--card:#fff;--ink:#1f2933;--muted:#6b7280;--line:#e5e7eb;--ok:#047857;--ok-bg:#d1fae5;--warn:#92400e;--warn-bg:#fef3c7;--danger:#b91c1c;--danger-bg:#fee2e2;--info:#1d4ed8;--info-bg:#dbeafe}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
header{background:var(--card);border-bottom:3px solid var(--accent);padding:14px 28px;display:flex;align-items:center;gap:28px;flex-wrap:wrap}
header .brand{font-weight:700;font-size:18px;color:var(--accent)}
header nav{display:flex;gap:6px;flex-wrap:wrap}
header nav a{color:var(--muted);text-decoration:none;padding:6px 12px;border-radius:6px;font-weight:500}
header nav a:hover{background:var(--bg)}
header nav a.active{background:var(--accent);color:#fff}
main{max-width:1180px;margin:0 auto;padding:24px 28px 56px}
.notice{background:var(--info-bg);color:var(--info);padding:8px 28px;font-size:13px}
.banner{padding:12px 28px;font-weight:600}
.banner.danger{background:var(--danger-bg);color:var(--danger)}
.banner.warn{background:var(--warn-bg);color:var(--warn)}
h1{font-size:22px;margin:0 0 4px}
h2{font-size:16px;margin:28px 0 10px}
.sub{color:var(--muted);margin:0 0 20px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px 18px;margin-bottom:16px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:8px}
.stat{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px}
.stat .n{font-size:26px;font-weight:700}
.stat .l{color:var(--muted);font-size:13px}
.stat.danger .n{color:var(--danger)}.stat.warn .n{color:var(--warn)}.stat.ok .n{color:var(--ok)}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}
th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:top;font-size:14px}
th{background:#f9fafb;color:var(--muted);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.04em}
tr:last-child td{border-bottom:0}
.right{text-align:right}
.badge{display:inline-block;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:600}
.badge-ok{background:var(--ok-bg);color:var(--ok)}.badge-warn{background:var(--warn-bg);color:var(--warn)}
.badge-danger{background:var(--danger-bg);color:var(--danger)}.badge-info{background:var(--info-bg);color:var(--info)}
.badge-muted{background:#e5e7eb;color:#374151}
code,.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px}
.muted{color:var(--muted)}
.empty{color:var(--muted);padding:14px 4px}
button,.btn{background:var(--accent);color:#fff;border:0;border-radius:6px;padding:6px 12px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;text-decoration:none;display:inline-block}
button.secondary{background:#fff;color:var(--accent);border:1px solid var(--accent)}
button.danger{background:var(--danger)}
form.inline{display:inline}
pre{background:#111827;color:#e5e7eb;padding:14px;border-radius:8px;overflow:auto;font-size:12.5px;line-height:1.5}
dl{display:grid;grid-template-columns:200px 1fr;gap:6px 14px;margin:0}
dt{color:var(--muted)}dd{margin:0}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
`;

export function renderPage(opts: PageOptions): string {
  const nav = (opts.nav ?? [])
    .map((n) => `<a href="${escapeHtml(n.href)}"${n.active ? ' class="active"' : ""}>${escapeHtml(n.label)}</a>`)
    .join("");
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${opts.refreshSeconds ? `<meta http-equiv="refresh" content="${opts.refreshSeconds}">` : ""}
<title>${escapeHtml(opts.title)} · ${escapeHtml(opts.app)}</title>
<style>${css(opts.accent)}</style>
</head>
<body>
<header><span class="brand">${escapeHtml(opts.app)}</span><nav>${nav}</nav></header>
${opts.notice ? `<div class="notice">${escapeHtml(opts.notice)}</div>` : ""}
${opts.banner ?? ""}
<main>
${opts.body}
</main>
</body>
</html>`;
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "medium" });
}

export function formatMoneyCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
