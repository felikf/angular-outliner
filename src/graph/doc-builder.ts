import { ComponentTreeNode } from '../tracer/trace';

export interface DocBuilder {
  onRoot(node: ComponentTreeNode): void;
  onChild(node: ComponentTreeNode): void;
  onParent(node: ComponentTreeNode): void;
  getDocument(): string;
}
