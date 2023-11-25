import { ComponentTreeNode } from '../tracer/trace';
import { DocBuilder } from './doc-builder';

const SEPARATOR = '\n';
const FLOWCHART_TEMPLATE = [
  '[Mermaid](https://mermaid-js.github.io/mermaid/#/flowchart?id=graph)',
  '```mermaid',
  'flowchart TD',
  'classDef onPushClass fill:#095,stroke:#333,stroke-width:4px;',
  'TREE_PLACEHOLDER', // TO BE INSERTED HERE
  'STYLE_PLACEHOLDER', // TO BE INSERTED HERE
  // 'CLASS_PLACEHOLDER', // TO BE INSERTED HERE
  '```'
];

interface StackItem {
  parent: ComponentTreeNode;
  child: ComponentTreeNode;
  level: number;
  count: number;
}

export class MermaidClassDiagramBuilder implements DocBuilder {
  private stack: ComponentTreeNode[] = [];
  private relations: StackItem[] = [];
  private level = 0;
  private onPushIds: string[] = [];

  private countMap: { [key: string]: number } = {};

  onRoot(node: ComponentTreeNode): void {
    // this.stack.push(node);
  }

  onChild(node: ComponentTreeNode): void {
    const parent = this.stack[this.stack.length - 1];
    this.stack.push(node);

    if (this.stack.length === 1) {
      return;
    }
    this.level++;

    if (node.detail.onPush) {
      this.onPushIds.push(this.createId(node));
    }

    // const relId = `${parent.id}-${node.name}-${this.level}`;
    // if (this.countMap[relId]) {
    //   this.countMap[relId] = this.countMap[relId] + 1;
    // } else {
    //   this.countMap[relId] = 1;
    // }

    // if (this.countMap[relId] < 3) {
    this.relations.push({
      parent: {
        ...parent,
        children: []
      },
      child: {
        ...node,
        children: []
      },
      level: this.level,
      count: 1
    });
    // }
  }

  onParent(): void {
    this.level--;
    this.stack.pop();
  }

  getDocument(): string {
    const result = [...FLOWCHART_TEMPLATE];
    const tree = this.stringifyRelations();

    return (
      result
        .map(item => item.replace('TREE_PLACEHOLDER', tree))
        .map(item => item.replace('STYLE_PLACEHOLDER', this.styleOnPush()))
        // .map(item => item.replace('CLASS_PLACEHOLDER', classesDefinitions))
        .join(SEPARATOR)
    );
  }

  private stringifyRelations(): string {
    return this.relations.map(item => this.createRelationshipString(item)).join(SEPARATOR);
  }

  private createRelationshipString({ child, level, parent }: StackItem): string {
    const indent = this.indent(level);
    const parentId = `${this.createId(parent)}[${parent.name}]`;
    const childId = `${this.createId(child)}[${child.name}]`;
    return `${indent}${parentId}-->${childId}`;
  }

  private styleOnPush(): string {
    return this.onPushIds.length ? `class ${this.onPushIds.join(',')} onPushClass` : '';
  }

  private createId(node: ComponentTreeNode): string {
    return `${node.name}-${node.id}`;
  }

  private indent(level: number): string {
    return new Array(level).join(' ');
  }
}

// private componentsMap: { [key: string]: ComponentTreeNodeDetail } = {};
// if (node.detail) {
//   this.componentsMap[node.name] = node.detail;
// }
// if (node.detail) {
//   this.componentsMap[node.name] = node.detail;
// }

// const classesDefinitions = Array.from(Object.keys(this.componentsMap))
//   .map(componentName => ({ componentName, detail: this.componentsMap[componentName] }))
//   .filter(({ detail, componentName }) => detail.inputs.length || detail.outputs.length)
//   .map(({ detail, componentName }) => this.getComponentTemplate(componentName, detail))
//   .join(SEPARATOR)
//
// const CLASS_TEMPLATE = [
//   'class CLASS_NAME_PLACEHOLDER {',
//   'INPUTS_PLACEHOLDER',
//   '}'
// ];
//
// private getComponentInstanceInputsOutputs(detail: ComponentTreeNodeDetail): string {
//   const inputs = detail.inputs
//     .map(input => `  +${input}`);
//   const outputs = detail.outputs
//     .map(output => `  +${output}`);
//
//   return [...inputs, ...outputs].join(SEPARATOR);
// }
//
// private getComponentTemplate(componentName: string, detail: ComponentTreeNodeDetail): string {
//   const result = [...CLASS_TEMPLATE];
//   const inputsOutputs = this.getComponentInstanceInputsOutputs(detail);
//   return result
//     .map(item => item.replace('CLASS_NAME_PLACEHOLDER', componentName))
//     .map(item => item.replace('INPUTS_PLACEHOLDER', inputsOutputs))
//     .join(SEPARATOR);
// }
