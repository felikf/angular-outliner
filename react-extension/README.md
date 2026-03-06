# React Component Outliner (samostatné rozšíření)

Tato složka obsahuje samostatnou variantu Chrome rozšíření pro React aplikace.
Scaffolding i build pipeline kopírují styl původního Angular rozšíření (`src` + `public` + webpack configy).

## Struktura

- `src/` – TypeScript zdrojové soubory (`content.ts`, `popup.ts`)
- `public/` – statické soubory kopírované do buildu (`manifest.json`, `popup.html`, `popup.css`)
- `config/` – webpack konfigurace (`webpack.common.js`, `webpack.dev.js`, `webpack.prod.js`)
- `dist/` – výsledný build, který se načítá do Chrome

## Lokální příprava

Z rootu repozitáře:

```bash
npm install
npm run react-ext:build
```

Pro průběžný vývoj s watch módem:

```bash
npm run react-ext:start
```

Volitelné vyčištění buildu:

```bash
npm run react-ext:clean
```

## Načtení do Chrome

1. Otevři `chrome://extensions/`.
2. Zapni **Developer mode**.
3. Klikni **Load unpacked**.
4. Vyber složku: `react-extension/dist`.
5. Otevři React aplikaci na `http://localhost/*` nebo `https://localhost/*`.
6. Klikni na ikonu rozšíření a použij popup ovládání pro zvýraznění komponent.

## Poznámka

Původní Angular rozšíření v kořeni projektu je ponecháno beze změny.
