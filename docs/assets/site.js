/* Shared site helpers: data loading, tables, tiny markdown renderer. No dependencies. */
"use strict";

async function loadJSON(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load " + path + " (" + res.status + ")");
  return res.json();
}

async function loadText(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load " + path + " (" + res.status + ")");
  return res.text();
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function link(url, text) {
  if (!url) return "<span class='muted'>—</span>";
  return '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(text || url) + "</a>";
}

function statusBadge(status) {
  const map = {
    "verified-live": ["b-green", "verified · live"],
    "search-corroborated": ["b-blue", "verified · corroborated"],
    "api-plus-registry": ["b-green", "verified · API + registry"],
    "fetch-plus-third-party": ["b-amber", "exists · freshness unconfirmed"],
    "verified-exists-freshness-unconfirmed": ["b-amber", "exists · freshness unconfirmed"]
  };
  const m = map[status] || ["b-gray", status || "unknown"];
  return '<span class="badge ' + m[0] + '">' + esc(m[1]) + "</span>";
}

function fmtUSD(n) {
  if (n == null || isNaN(n)) return "—";
  return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* Minimal markdown subset: headings, tables, lists, code blocks, links, bold, inline code. */
function tinyMD(src) {
  const lines = src.split("\n");
  let html = "", inCode = false, inList = false, tableBuf = [];
  function flushTable() {
    if (!tableBuf.length) return;
    const rows = tableBuf.map(r => r.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim()));
    const head = rows[0] || [];
    const body = rows.slice(1).filter(r => !r.every(c => /^:?-{2,}:?$/.test(c)));
    html += "<table><thead><tr>" + head.map(c => "<th>" + inlineMD(c) + "</th>").join("") + "</tr></thead><tbody>";
    body.forEach(r => { html += "<tr>" + r.map(c => "<td>" + inlineMD(c) + "</td>").join("") + "</tr>"; });
    html += "</tbody></table>";
    tableBuf = [];
  }
  function closeList() { if (inList) { html += "</ul>"; inList = false; } }
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (/^```/.test(line)) {
      closeList(); flushTable();
      html += inCode ? "</code></pre>" : "<pre><code>";
      inCode = !inCode; continue;
    }
    if (inCode) { html += esc(raw) + "\n"; continue; }
    if (/^\|.*\|$/.test(line.trim())) { closeList(); tableBuf.push(line); continue; }
    flushTable();
    if (/^#{1,3}\s/.test(line)) {
      closeList();
      const lvl = line.match(/^#+/)[0].length;
      html += "<h" + lvl + ">" + inlineMD(line.replace(/^#+\s*/, "")) + "</h" + lvl + ">";
    } else if (/^(\-|\*|\d+\.)\s+/.test(line)) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += "<li>" + inlineMD(line.replace(/^(\-|\*|\d+\.)\s+/, "")) + "</li>";
    } else if (line.trim() === "") {
      closeList();
    } else {
      closeList();
      html += "<p>" + inlineMD(line) + "</p>";
    }
  }
  flushTable(); closeList();
  if (inCode) html += "</code></pre>";
  return html;
}

function inlineMD(s) {
  let h = esc(s);
  h = h.replace(/`([^`]+)`/g, "<code>$1</code>");
  h = h.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  h = h.replace(/(^|[\s(])(https?:\/\/[^\s)<\]]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
  return h;
}

function showError(elId, err) {
  const el = document.getElementById(elId);
  if (el) el.innerHTML = '<div class="notice red"><strong>Could not load data.</strong> ' + esc(err.message) + "</div>";
}
