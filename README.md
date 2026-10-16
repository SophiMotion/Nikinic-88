# SophiMotion 3D Printing Quote

A browser-based 3D printing quote workspace using the supplied SophiMotion brand template: original SVG logos, #0057FF blue, Arial typography, light/dark/system themes, and English/Chinese interface.

## Run locally

Requires Node.js 18 or newer. No dependency installation or build is required.

```sh
npm start
```

Open http://127.0.0.1:4173. If that port is already in use:

```sh
node server.cjs 4174
```

Check JavaScript syntax with `npm run check`.

## Features

- Import binary or ASCII STL files, up to 25 MB and 150,000 triangles per file.
- Rotate and zoom component previews; confirm file units in mm, cm, or inches.
- Independently configure material, method, density in **g/cm³**, infill percentage, post-processing, and quantity for each component.
- Density defaults follow material selection and remain editable. Infill is a separate percentage. Estimated mass = solid volume × material density × effective fill fraction; FDM assumes a 15% shell allowance, while SLA/SLS estimates use solid volume.
- Add client name, company, email, and project notes.
- Review preliminary mesh integrity and indicative build-envelope warnings.
- Edit estimate rates, save a browser-local draft, export a formatted Excel (.xlsx) quotation or quote JSON, or print/save PDF.

Sample brackets are marked as examples. Replace them with your actual STL files. Files are processed locally in the browser. Drafts use localStorage and are specific to the browser and site origin.

## Files and deployment

`public/` contains the complete static website and supplied SophiMotion brand assets. Serve that directory with any static web host. `server.cjs` is a dependency-free local preview server and only serves `public/`.

## Estimate limitations

Prices are configurable preliminary estimates in USD, excluding taxes and shipping. The material rate is USD/g with material multipliers; machine time uses indicative throughput. This tool does not generate slicer toolpaths or certify printability. Wall thickness, overhangs, support needs, trapped resin/powder, and functional strength require slicer and engineering review.

## Excel quotation

Select **Review quote → Export Excel (.xlsx)**. The workbook contains a client-facing Quote sheet and a Components sheet with density in g/cm³, infill, finishing, quantity, volume, mass, unit price, line totals, and risk notes. Mass and totals include formulas with cached results; unit prices are snapshots of the current quote. Regenerate the export in the app after changing the material or process. Excel files are generated locally without third-party services.

## GitHub Pages

The `.github/workflows/pages.yml` workflow deploys `public/` when website changes are pushed to `main`. In repository Settings → Pages, set the source to GitHub Actions. The expected project URL is https://sophimotion.github.io/Nikinic-88/ . The static assets use relative paths for project-site compatibility.
