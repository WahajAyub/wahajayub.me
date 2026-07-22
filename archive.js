(function () {
  "use strict";
  const root = document.getElementById("archive-items");
  const empty = document.getElementById("archive-empty");

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char];
    });
  }
  function prettyDate(value) {
    const parsed = new Date((value || "") + "T12:00:00Z");
    return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("en-US", {month:"long", day:"numeric", year:"numeric", timeZone:"UTC"}).format(parsed);
  }
  function issueMarkup(issue) {
    const items = Array.isArray(issue.items) ? issue.items.slice().sort(function (a,b) {
      return Number(a.relevance_rank || 999) - Number(b.relevance_rank || 999);
    }) : [];
    return '<article class="archive-card">' +
      '<div class="archive-card-head"><div><p class="eyebrow">Weekly issue</p><h3>' + esc(issue.edition_label || "Archived issue") + '</h3></div>' +
      '<div class="archive-meta"><span>' + items.length + ' papers</span><span>Updated ' + esc(prettyDate((issue.updated_at || "").slice(0,10))) + '</span></div></div>' +
      '<div class="archive-paper-list">' + items.map(function (paper) {
        const rank = paper.relevance_rank ? '<span class="rank-chip">#' + esc(paper.relevance_rank) + ' relevance</span>' : "";
        return '<article class="archive-paper"><div class="archive-paper-kicker">' + rank + ' <span class="source-chip">' + esc(paper.source || "Paper") + '</span><span>' + esc(paper.research_relevance_score || "—") + '/10</span></div>' +
          '<h4>' + esc(paper.title) + '</h4><p>' + esc(paper.tldr || "") + '</p>' +
          (paper.critical_assessment ? '<div class="archive-critical"><span>Critical assessment</span><p>' + esc(paper.critical_assessment) + '</p></div>' : "") +
          '</article>';
      }).join("") + '</div></article>';
  }
  fetch("/archive/index.json", {cache:"no-store"})
    .then(function (response) { if (!response.ok) throw new Error("Archive index unavailable"); return response.json(); })
    .then(function (manifest) {
      const entries = Array.isArray(manifest.archives) ? manifest.archives : [];
      if (!entries.length) { root.innerHTML = ""; empty.hidden = false; return; }
      return Promise.all(entries.map(function (entry) {
        return fetch(entry.path, {cache:"no-store"}).then(function (response) {
          if (!response.ok) throw new Error("Archive issue unavailable");
          return response.json();
        });
      })).then(function (issues) {
        root.innerHTML = issues.map(issueMarkup).join("");
      });
    })
    .catch(function () {
      root.innerHTML = '<div class="feed-notice">The archive is temporarily unavailable. Please try again shortly.</div>';
    });
})();
