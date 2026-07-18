# wahajayub.me

Wahaj Ayub's public research radar for topological photovoltaics, nonlinear
response, noncentrosymmetric topological materials, Hopf phases, delicate
invariants, and mathematical condensed matter.

## Publishing

The site is static and deploys through GitHub Pages after changes reach `main`.
The custom domain is set by `CNAME`.

## Weekly research feed

The system deliberately separates mechanical collection from scientific
judgment:

1. GitHub Actions runs `scripts/collect_candidates.py` every Friday. It gathers
   recent arXiv and Crossref records, filters them deterministically, removes
   duplicates and previously reviewed IDs, then writes at most 20 compact
   records to `data/candidates.json`. This stage uses no AI tokens.
2. A local Codex scheduled task uses ChatGPT/Codex subscription usage to
   evaluate that shortlist, summarize at most six papers, explain their
   relevance to Wahaj's research, and update the public JSON and RSS files
   from the local checkout, then commit and push the result. This avoids the
   OpenAI API but requires the computer and Codex app to be available at run
   time.

No OpenAI API key is stored in this repository. Durable instructions for the
scheduled task live in `AUTOMATION.md`; the research scope and selection
thresholds live in `config/research-profile.yml`.

## Local preview

Serve the repository root with any static HTTP server and open `index.html`.
The feed must be served over HTTP rather than opened directly from disk because
the page fetches `data/papers.json`.
