# Analýza stávajícího Angular rozšíření a návrh React varianty

## 1) Funkcionality stávajícího Angular rozšíření

Stávající rozšíření (Angular Outliner) poskytuje hlavně:

1. **Detekci Angular runtime na stránce** (`window.ng` + `Zone`).
2. **Sběr komponent přes Angular debug API** (`ng.getComponent`, `ng.getHostElement`).
3. **Zobrazení hranic komponent v UI** přes canvas overlay.
4. **Výběr zvýraznění podle prefixu** (`app-*`, `mat-*`) i podle konkrétní komponenty.
5. **Nastavení barvy pro každý prefix/komponentu**.
6. **Přepínání labelu** (název komponenty vs. selector).
7. **Přepínání pozice labelu** (left top / right top).
8. **Filtr komponent + řazení** (název, počet výskytů).
9. **Přepínač „cover“ režimu** (překrytí plochy) a tracing režimu.
10. **Mermaid export stromu komponent** pro dokumentaci/PR.
11. **Informace o ChangeDetection strategii** (`OnPush`/`Default`) v seznamu.

## 2) Plán vytvoření stejného rozšíření pro React

Pro React neexistuje přímý ekvivalent `window.ng`, proto je vhodné:

1. **Detekce React appky**
   - použít `window.__REACT_DEVTOOLS_GLOBAL_HOOK__`.
2. **Sběr komponent**
   - procházet Fiber strom (`hook.getFiberRoots(rendererId)`).
   - ze Fiber node získat `name`, `tag`, host DOM node a parent-child strukturu.
3. **Mapování na DOM hranice**
   - použít `getBoundingClientRect` host elementu.
4. **Stejné UX jako Angular varianta**
   - prefixy, komponenty, filtry, řazení, barvy, label mode, label position, cover.
5. **Mermaid export**
   - generovat flowchart z React stromu komponent.
6. **React-analogie OnPush**
   - zvýrazňovat `memo` komponenty jako výkonový signál.
7. **Oddělený build/deployment artefakt**
   - nový samostatný Chrome extension balíček, bez zásahu do Angular extension.

## 3) Co je implementováno v této změně

Byla přidána **nová samostatná Chrome extension varianta pro React** ve složce `react-extension/`:

- modernizovaný popup UI (dark glass styl, lepší hierarchie, badge, čitelné ovládání),
- detekce React přes DevTools hook,
- extrakce Fiber stromu a mapování komponent na DOM hranice,
- zvýraznění podle prefixů i komponent,
- filtrace, řazení, hromadný výběr,
- přepínač label mode, label position, cover,
- Mermaid export stromu komponent,
- zvýraznění memoizovaných komponent v Mermaid grafu.

Původní Angular rozšíření je ponecháno beze změn.
