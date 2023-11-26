import { debounce } from './debounce';

export interface FindPrefixesOptions {
  displayBlock: boolean;
}

export interface NodeBoundary {
  top: number;
  left: number;
  bottom: number;
  right: number;
  width: number;
  height: number;
  name: string;
  nodeName: string;
  level: number;
  componentRef: any;
  componentId: string;
}

export interface NodePrefix {
  prefix: string;
  color: string;
  enabled: boolean;
  count?: number;
}

export interface NodeComponent {
  name: string;
  enabled: boolean;
  count?: number;
  color?: string;
  onPush?: boolean;
  selectors?: string[];
}

export interface TogglePrefixesOptions {
  prefixes: NodePrefix[];
  components: NodeComponent[];
  textPosition: ComponentTextPosition;
  nameOrSelector: NameOrSelector;
}

export interface FindPrefixesResult {
  prefixes: NodePrefix[];
  components: NodeComponent[];
  root: ComponentTreeNode;
}

export interface ComponentTreeNode {
  id: string;
  name: string;
  children: ComponentTreeNode[];
  detail: ComponentTreeNodeDetail;
}

export interface ComponentTreeNodeDetail {
  exportAs: string;
  onPush: boolean;
  standalone: string;
  selector: string[];
  inputs: string[];
  outputs: string[];
}

export type ComponentTextPosition = 'topLeft' | 'topRight';
export type NameOrSelector = 'name' | 'selector';

let _canvas: HTMLCanvasElement = null;
let _canvasHover = null;
let listener;
let _cover = false;
let nodes: NodeBoundary[];
let prefixes: NodePrefix[] = [];
let components: NodeComponent[] = [];
let position: ComponentTextPosition = 'topLeft';
let nameOrSelector: NameOrSelector = 'selector';
let extensionDebugLogEnabled = false;
const ng = window['ng'];

const originalDisplay = new Map<string, string>();

/**
 * ComponentId to drawing context
 */
let drawingContext = new Map<string, any>();

export function isAngular() {
  const isAngular = window['ng'] && !!window['Zone'];
  return {
    isAngular
  };
}

export function findPrefixes(options: FindPrefixesOptions): FindPrefixesResult {
  // debug('Find prefixes', options);
  reset();
  let rootEl = document.querySelector('body');

  const pseudoRoot: ComponentTreeNode = {
    id: 'root',
    name: 'root',
    children: [],
    detail: null
  };

  const newParent = recurse(rootEl, 0, options, pseudoRoot);

  return {
    prefixes,
    components,
    root: newParent || pseudoRoot
  };
}

function reset(): void {
  nodes = [];
  prefixes = [];
  components = [];
}

function recurse(
  el: ChildNode,
  level: number,
  options: FindPrefixesOptions,
  parent: ComponentTreeNode
): ComponentTreeNode | null {
  const newComponent = processElement(el, level, options);

  const usedParent = newComponent || parent;
  el &&
    el.childNodes &&
    el.childNodes.forEach(n => {
      const child = recurse(n, level++, options, usedParent);
      if (child) {
        // child.parent = usedParent;

        if (usedParent) {
          usedParent.children.push(child);
        }
      }
    });

  return newComponent;
}

const regexp = /([a-zA-Z]+)-([a-zA-Z]+)/i;
let counter = 0;

function processElement(el: ChildNode, level: number, options: FindPrefixesOptions): ComponentTreeNode | null {
  let hostElement: HTMLElement;
  let component;

  try {
    hostElement = ng.getHostElement(el);
    component = ng.getComponent(el);
  } catch (e) {}

  if (hostElement && component) {
    const componentId = `${counter++}`;

    const componentName = component.constructor.name;
    const tageName = hostElement.tagName.toLowerCase();

    handleDisplayBlock(options.displayBlock, componentId, hostElement);

    handleComponent(componentName, component);
    handlePrefix(tageName);

    const result: ComponentTreeNode = {
      id: componentId,
      name: componentName,
      children: [],
      detail: getComponentInstanceInfoObj(component)
    };

    handleNodeBoundary(el, componentName, tageName, level, component, componentId);

    return result;
  }

  return null;
}

function handleComponent(componentName: string, componentRef: any): void {
  const componentDescr = components.find(component => component.name === componentName);
  if (!componentDescr) {
    components.push({
      name: componentName,
      onPush: componentRef.constructor.ɵcmp.onPush,
      selectors: componentRef.constructor.ɵcmp.selectors,
      enabled: false,
      count: 1
      // componentRef // TODO
    });
  } else {
    componentDescr.count += 1;
  }
}

function handlePrefix(tageName: string): void {
  let groups = tageName.match(regexp);
  if (groups && groups[1]) {
    const prefixDescr = prefixes.find(pref => pref.prefix === groups[1]);

    if (!prefixDescr) {
      prefixes.push({
        prefix: groups[1],
        color: 'red',
        enabled: true,
        count: 1
      });
    } else {
      prefixDescr.count += 1;
    }
  }
}

function handleNodeBoundary(
  el,
  componentName: string,
  tageName: string,
  level: number,
  component: any,
  componentId: string
): void {
  if (el.getBoundingClientRect) {
    const rect = el.getBoundingClientRect();
    const node: NodeBoundary = {
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      width: rect.width,
      height: rect.height,
      name: componentName,
      nodeName: tageName,
      level: level,
      componentRef: component,
      componentId: componentId
    };

    nodes.push(node);
  }
}

export function toggleCover(enabled: boolean) {
  _cover = enabled;
  clearCanvas(_canvas);
  _draw(nodes);
}

export function togglePrefix(payload: {
  prefixes: NodePrefix[];
  components: NodeComponent[];
  textPosition: ComponentTextPosition;
  nameOrSelector: NameOrSelector;
}) {
  prefixes = payload.prefixes;
  components = payload.components;
  position = payload.textPosition;
  nameOrSelector = payload.nameOrSelector;

  clearCanvas(_canvas);
  _draw(nodes);
}

export function toggleTracing(toggle) {
  prefixes = toggle.prefixes;

  if (toggle.enabled) {
    _draw(nodes);
    tooltip(nodes);
  } else {
    clearCanvas(_canvas);
    document.body.removeEventListener('mousemove', listener);
  }
}

export function clear(): void {
  clearCanvas(_canvas);
}

function clearCanvas(canvas: HTMLCanvasElement): void {
  if (!canvas) {
    return;
  }

  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (canvas.parentNode) {
    canvas.parentNode.removeChild(canvas);
  }

  // clear cache
  drawingContext.clear();
}

function _draw(nodes: NodeBoundary[]): void {
  _canvas = ensureCanvas(_canvas, 'components', 99998);
  _canvasHover = ensureCanvas(_canvasHover, 'tooltip', 99999, 700, 700);
  const canvas = _canvas;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (_cover) {
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  nodes &&
    nodes
      .sort((a, b) => a.level - b.level)
      .forEach(node => {
        drawBorder(ctx, node);
      });
}

export function drawBorder(ctx, node: NodeBoundary) {
  // outline
  ctx.lineWidth = 1;

  const nodePrefix = prefixes.find(prefix => node.nodeName && node.nodeName.startsWith(prefix.prefix));
  const component = components.find(component => node.name && node.name === component.name);

  const prefixMatches = nodePrefix?.enabled;
  const componentMatches = component?.enabled;

  if (!prefixMatches && !componentMatches) {
    return;
  }

  const color = componentMatches ? component && component.color : (nodePrefix && nodePrefix.color) || 'blue';
  ctx.strokeStyle = color;

  ctx.strokeRect(node.left, node.top, node.width, node.height);

  if (node.name) {
    const count = handleConflictingNodes(node);
    let verticalOffset = 0;

    if (count) {
      verticalOffset = count * 15;
    }

    ctx.fillStyle = color;
    drawTextBG(
      ctx,
      nameOrSelector === 'selector' ? node.nodeName : node.name,
      node.left,
      node.top + verticalOffset,
      node.width,
      node.height,
      color
    );
  }
}

function handleConflictingNodes(node: NodeBoundary): number {
  const conflictingNodesCount = getConflictingNodesCount(node);

  drawingContext.set(node.componentId, node);
  return conflictingNodesCount;
}

function getConflictingNodesCount(node: NodeBoundary): number {
  // console.group(`Processing node ${node.name}`);

  let conflicting = nodes.filter(n => {
    // console.log(
    //   `${n.name}, left: ${Math.abs(n.left - node.left)}, top: ${Math.abs(n.top - node.top)}
    //   , ids: ${n.componentId !== node.componentId}, drawingContextHas: ${drawingContext.has(n.componentId)} `
    // );

    return (
      Math.abs(n.left - node.left) < 50 &&
      Math.abs(n.top - node.top) < 10 &&
      n.componentId !== node.componentId &&
      drawingContext.has(n.componentId)
    );
  });

  // conflicting.forEach(conflictingNode => {
  //   console.log('Conflicting node', conflictingNode.name);
  // });
  //
  // console.groupEnd();

  return conflicting.length;
}

function getCorrectTextColor(hex) {
  const threshold = 130;
  const hRed = hexToR(hex);
  const hGreen = hexToG(hex);
  const hBlue = hexToB(hex);

  function hexToR(h) {
    return parseInt(cutHex(h).substring(0, 2), 16);
  }

  function hexToG(h) {
    return parseInt(cutHex(h).substring(2, 4), 16);
  }

  function hexToB(h) {
    return parseInt(cutHex(h).substring(4, 6), 16);
  }

  function cutHex(h) {
    return h.charAt(0) == '#' ? h.substring(1, 7) : h;
  }

  const cBrightness = (hRed * 299 + hGreen * 587 + hBlue * 114) / 1000;
  if (cBrightness > threshold) {
    return '#000000';
  } else {
    return '#ffffff';
  }
}

function drawTextBG(ctx, txt, componentX, componentY, componentWidth, componentHeight, style: string) {
  /// lets save current state as we make a lot of changes
  ctx.save();

  /// set font
  // let font = ctx.font;
  ctx.font = '14px Arial';
  let font = ctx.font;

  /// draw text from top - makes life easier at the moment
  ctx.textBaseline = 'top';

  /// color for background
  ctx.fillStyle = style;

  /// get componentWidth of text
  let textDimensions = ctx.measureText(txt);

  let p = computeByStrategy(componentX, componentY, componentWidth, textDimensions.width, font);

  /// draw background rect assuming height of font
  ctx.fillRect(p.x, p.y, p.width, p.height);

  /// text color
  ctx.fillStyle = getCorrectTextColor(style);

  /// draw text on top
  ctx.fillText(txt, p.x, p.y);

  /// restore original state
  ctx.restore();
}

function computeByStrategy(
  x,
  y,
  componentWidth,
  textWidth,
  font
): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  switch (position) {
    case 'topRight':
      return {
        x: x + componentWidth - textWidth,
        y: y,
        width: textWidth,
        height: parseInt(font, 10)
      };
    case 'topLeft':
    default:
      return {
        x: x,
        y: y,
        width: textWidth,
        height: parseInt(font, 10)
      };
  }
}

let scrollFn;

function ensureCanvas(canvas: HTMLCanvasElement, id, zIndex, width?, height?): HTMLCanvasElement {
  if (canvas === null) {
    canvas = document.createElement('canvas');
    canvas.id = id;
    canvas.width = width || window.screen.availWidth;
    canvas.height = height || window.screen.availHeight;
    canvas.style.cssText = `position:fixed;top:0;right:0;bottom:0;left:0;z-index: ${zIndex};pointer-events:none;`;
  }

  document.body.insertBefore(canvas, document.body.firstChild);

  function handleScroll() {
    const val = {
      prefixes: [...prefixes],
      components: [...components],
      textPosition: position,
      nameOrSelector
    };

    findPrefixes({
      displayBlock: false
    });
    clear();
    togglePrefix(val);
  }

  if (scrollFn) {
    window.removeEventListener('scroll', scrollFn);
  }

  // Attach the debounced scroll event handler to the window
  scrollFn = debounce(handleScroll, 200);
  window.addEventListener('scroll', scrollFn);

  return canvas;
}

function getComponentInstanceInfoObj(component: any): ComponentTreeNodeDetail {
  const detail = component.constructor.ɵcmp;
  return {
    exportAs: detail.exportAs,
    onPush: detail.onPush,
    standalone: detail.standalone,
    selector: detail.selectors,
    inputs: Object.keys(detail.inputs).map(key => key),
    outputs: Object.keys(detail.outputs).map(key => key)
  };
}

function getComponentInstanceInfoCmp(component: any): string[] {
  const detail = component.constructor.ɵcmp;
  return [
    // `id: ${detail.id}`,
    `exportAs: ${detail.exportAs}`,
    `onPush: ${detail.onPush}`,
    `standalone: ${detail.standalone}`,
    `selector: ${detail.selectors.join(' ')}`,
    `inputs: ${Object.keys(detail.inputs).map(key => `${key} = ${JSON.stringify(component[key])}`)}`,
    `outputs: ${Object.keys(detail.outputs).map(key => `${key}`)}`
  ];
}

function getComponentInstanceInfo(found: NodeBoundary): string[] {
  const component = found.componentRef;
  // const detail = component.constructor.ɵcmp;

  const result = [`name: ${found.name}`, ...getComponentInstanceInfoCmp(found.componentRef)];

  // const directives = detail.directiveDefs && detail.directiveDefs();
  //
  // if (directives && directives.length) {
  //     directives
  //       .map(dir => getComponentInstanceInfoCmp(dir))
  //       .reduce((acc, current) => [...acc, ...current], result)
  // }

  return result;
}

function tooltipListener(tooltipCanvas: HTMLCanvasElement, nodes: NodeBoundary[], e) {
  let mouseX = e.clientX;
  let mouseY = e.clientY;

  let found: NodeBoundary;

  nodes &&
    nodes.forEach(node => {
      if (mouseX >= node.left && mouseX <= node.right && mouseY >= node.top && mouseY <= node.bottom) {
        found = found ? (found.level > node.level ? found : node) : node;
      }
    });

  if (found) {
    let ctx = tooltipCanvas.getContext('2d');
    ctx.clearRect(0, 0, tooltipCanvas.width, tooltipCanvas.height);

    getComponentInstanceInfo(found).forEach((text, i) => ctx.fillText(text, 40, (i + 1) * 15));
    tooltipCanvas.style.left = mouseX + 'px';
    tooltipCanvas.style.top = mouseY + 'px';
  }
}

function tooltip(nodes: NodeBoundary[]) {
  let tooltipCanvas = document.getElementById('tooltip');
  listener = tooltipListener.bind(this, tooltipCanvas, nodes);
  document.body.addEventListener('mousemove', listener);
}

function debug(...args): void {
  if (extensionDebugLogEnabled) {
    console.log(...args);
  }
}

function handleDisplayBlock(displayBlock: boolean, componentId: string, hostElement): void {
  // display block 1) this is initialization phase - remember display values for all outlined components
  if (displayBlock && !hostElement.style.display) {
    originalDisplay.set(componentId, hostElement.style.display);
    hostElement.style.display = 'block';
  }

  // display block 2) this is when user clicks toggle display block - restore display (second and next rerender)
  if (!displayBlock && originalDisplay.has(componentId)) {
    hostElement.style.display = originalDisplay.get(componentId);
  }
}
