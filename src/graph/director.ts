import { ComponentTreeNode } from '../tracer/trace';
import { DocBuilder } from './doc-builder';

export class Director {
  constructor(private builder: DocBuilder) {}

  make(root: ComponentTreeNode): void {
    this.builder.onRoot(root);
    this.traverse(root);
  }

  traverse(node: ComponentTreeNode): void {
    if (node.children) {
      node.children.forEach(child => {
        this.builder.onChild(child);
        this.traverse(child);
      });
      this.builder.onParent(node);
    }
  }
}
