import { ComponentTreeNode } from '../tracer/trace';
import { DocBuilder } from './doc-builder';

export class LogBuilder implements DocBuilder {
  level: number = 0;

  getDocument(): string {
    return '';
  }

  onChild(node: ComponentTreeNode): void {
    this.level++;
    this.print(node);
  }

  onParent(node: ComponentTreeNode): void {
    this.level--;
  }

  onRoot(node: ComponentTreeNode): void {
    this.print(node);
  }

  private print(node: ComponentTreeNode): void {
    console.log(`${this.indent(this.level)}${node.name} - ${node.id}`);
  }

  private indent(level: number): string {
    return new Array(level).join(' ');
  }
}
