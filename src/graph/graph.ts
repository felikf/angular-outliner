import { ComponentTreeNode, NodeComponent } from '../tracer/trace';
import { Director } from './director';
import { MermaidClassDiagramBuilder } from './mermaid-class-diagram-builder';

export function buildGraph(root: ComponentTreeNode): string {
  const builder = new MermaidClassDiagramBuilder();
  // const builder = new LogBuilder();
  const director = new Director(builder);
  director.make(root);
  return builder.getDocument();

}




