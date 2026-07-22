(function () {
  "use strict";

  const state = { papers: [], activeFilter: "all", query: "" };
  const list = document.getElementById("paper-list");
  const empty = document.getElementById("empty-state");
  const search = document.getElementById("paper-search");
  const filters = Array.from(document.querySelectorAll(".filter"));
  const notice = document.getElementById("feed-notice");

  const categoryLabels = {
    topological_photovoltaics: "Topological PV",
    shift_current: "Photocurrent",
    impurity_ballistic_bpve: "Impurity / ballistic",
    quantum_geometry: "Quantum geometry",
    topological_materials: "Topological material",
    noncentrosymmetric_materials: "Noncentrosymmetric",
    nonlinear_transport: "Nonlinear transport",
    floquet_physics: "Floquet",
    hopf_topology: "Hopf / delicate",
    mathematical_condensed_matter: "Mathematical CM"
  };

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char];
    });
  }

  function cleanUrl(value) {
    try {
      const parsed = new URL(value);
      return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : "";
    } catch (_) {
      return "";
    }
  }

  function prettyDate(value) {
    if (!value) return "Date unavailable";
    const parsed = new Date(value + (value.length === 10 ? "T12:00:00Z" : ""));
    if (Number.isNaN(parsed.getTime())) return value;
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(parsed);
  }

  function badge(category) {
    return '<span class="badge">' + esc(categoryLabels[category] || category.replaceAll("_", " ")) + "</span>";
  }

  function paperCard(paper) {
    const url = cleanUrl(paper.url || paper.preprint_url);
    const pdf = cleanUrl(paper.pdf_url || paper.preprint_pdf_url);
    const authors = Array.isArray(paper.authors) ? paper.authors.join(", ") : "";
    const categories = Array.isArray(paper.categories) ? paper.categories : [];
    const tags = Array.isArray(paper.tags) ? paper.tags.slice(0, 5) : [];
    const isHighlight = Boolean(paper.highlight);
    const score = Number.isFinite(Number(paper.research_relevance_score)) ? Number(paper.research_relevance_score) : "—";

    const links = [
      url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener">Paper</a>' : "",
      pdf ? '<a href="' + esc(pdf) + '" target="_blank" rel="noopener">PDF</a>' : ""
    ].filter(Boolean).join("");

    return [
      '<article class="paper-card' + (isHighlight ? " highlight" : "") + '">',
      '  <div class="paper-main">',
      '    <div class="paper-kicker">',
      '      <span class="source-chip">' + esc(paper.source || "Paper") + "</span>",
      "      <span>" + esc(prettyDate(paper.published)) + "</span>",
      paper.relevance_rank ? '<span class="rank-chip">#' + esc(paper.relevance_rank) + ' relevance</span>' : "",
      "    </div>",
      '    <h3 class="paper-title">' + (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(paper.title) + "</a>" : esc(paper.title)) + "</h3>",
      authors ? '    <p class="authors">' + esc(authors) + "</p>" : "",
      links ? '    <div class="paper-links">' + links + "</div>" : "",
      '    <div class="badge-row">',
      isHighlight ? '<span class="badge highlight-badge">★ ' + esc(paper.highlight_label || "Priority signal") + "</span>" : "",
      categories.map(badge).join(""),
      tags.map(function (tag) { return '<span class="badge">' + esc(tag) + "</span>"; }).join(""),
      "    </div>",
      paper.critical_assessment ? '<div class="critical-block"><p class="summary-label">Critical assessment</p><p class="paper-critical">' + esc(paper.critical_assessment) + '</p></div>' : "",
      "  </div>",
      '  <div class="paper-side">',
      '    <div class="score-box"><strong>' + esc(score) + '</strong><span>/10 relevance</span></div>',
      '    <div><p class="summary-label">At a glance</p><p class="paper-summary">' + esc(paper.tldr || paper.summary || "Summary pending.") + "</p></div>",
      '    <div class="relevance-block"><p class="summary-label">Relevance to my research</p><p class="paper-relevance">' + esc(paper.research_relevance || "Relevance analysis pending.") + "</p></div>",
      "  </div>",
      "</article>"
    ].join("");
  }

  function matches(paper) {
    const categories = paper.categories || [];
    const categoryMatch = state.activeFilter === "all" || categories.includes(state.activeFilter);
    if (!categoryMatch) return false;
    if (!state.query) return true;
    const haystack = [paper.title, paper.summary, paper.tldr, paper.research_relevance, paper.critical_assessment, paper.key_strength, paper.key_limitation, ...(paper.tags || []), ...categories].join(" ").toLowerCase();
    return haystack.includes(state.query);
  }

  function render() {
    const visible = state.papers.filter(matches).sort(function (a, b) {
      return Number(a.relevance_rank || 999) - Number(b.relevance_rank || 999) || Number(b.research_relevance_score || 0) - Number(a.research_relevance_score || 0);
    });
    list.innerHTML = visible.map(paperCard).join("");
    empty.hidden = visible.length > 0;
    list.hidden = visible.length === 0;
  }

  filters.forEach(function (button) {
    button.addEventListener("click", function () {
      state.activeFilter = button.dataset.filter;
      filters.forEach(function (item) {
        const active = item === button;
        item.classList.toggle("active", active);
        item.setAttribute("aria-pressed", String(active));
      });
      const url = new URL(window.location.href);
      if (state.activeFilter === "all") url.searchParams.delete("topic");
      else url.searchParams.set("topic", state.activeFilter);
      history.replaceState(null, "", url);
      render();
    });
  });

  search.addEventListener("input", function () {
    state.query = search.value.trim().toLowerCase();
    render();
  });

  fetch("/data/papers.json?v=20260721-4", { cache: "no-store" })
    .then(function (response) {
      if (!response.ok) throw new Error("Feed request failed");
      return response.json();
    })
    .then(function (feed) {
      state.papers = Array.isArray(feed.items) ? feed.items : [];
      document.getElementById("edition-label").textContent = feed.edition_label || "Latest issue";
      document.getElementById("updated-label").textContent = "Updated " + prettyDate((feed.updated_at || "").slice(0, 10));
      document.getElementById("paper-count").textContent = state.papers.length;
      document.getElementById("highlight-count").textContent = state.papers.filter(function (p) { return p.highlight; }).length;
      if (feed.edition_type === "foundational-preview") {
        notice.hidden = false;
        notice.textContent = "Foundational preview — the subscription-based weekly curation task will replace this selection after its first scheduled run.";
      }
      const requested = new URL(window.location.href).searchParams.get("topic");
      const matchingButton = filters.find(function (button) { return button.dataset.filter === requested; });
      if (matchingButton) matchingButton.click();
      else render();
    })
    .catch(function () {
      list.innerHTML = "";
      list.hidden = true;
      empty.hidden = false;
      empty.querySelector("h3").textContent = "The radar is temporarily unavailable";
      empty.querySelector("p").textContent = "The paper feed could not be loaded. Please try again shortly.";
      document.getElementById("edition-label").textContent = "Feed unavailable";
      document.getElementById("updated-label").textContent = "Please try again";
    });
})();
