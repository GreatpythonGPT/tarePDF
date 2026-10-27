import Konva from 'konva';
import { annotationGeometry, annotationLabelBox } from './annotations.mjs';

export function makeAnnotation(element, width, height) {
  const e = element, a = e.annotation, g = annotationGeometry(a, width);
  const group = new Konva.Group({ id: e.id, name: 'element', x: e.x * width, y: e.y * height, rotation: e.rotation, opacity: e.opacity, draggable: !e.locked });
  const strokeWidth = e.strokeWidth * width, size = a.capSize * width;
  const dash = a.dash === 'dashed' ? [strokeWidth * 4 + 2, strokeWidth * 3 + 2] : a.dash === 'dotted' ? [0.01, strokeWidth * 3 + 2] : [];
  group.add(new Konva.Line({ name: 'annotation-line', points: g.points, stroke: e.stroke, strokeWidth, dash, lineCap: 'round', lineJoin: 'round', hitStrokeWidth: Math.max(16, strokeWidth) }));
  const marker = (cap, point, angle) => {
    const common = { x: point.x, y: point.y, fill: e.stroke, stroke: e.stroke, strokeWidth: Math.max(1, strokeWidth), listening: true };
    if (cap === 'dot' || cap === 'ring') group.add(new Konva.Circle({ ...common, radius: size / 2, fill: cap === 'ring' ? a.labelColor : e.stroke }));
    else if (cap === 'arrow') group.add(new Konva.Line({ ...common, points: [0, 0, -size * 1.5, -size * 0.65, -size * 1.18, 0, -size * 1.5, size * 0.65], closed: true, rotation: angle * 180 / Math.PI, strokeWidth: 0 }));
    else if (cap === 'bar') group.add(new Konva.Line({ ...common, points: [0, -size, 0, size], rotation: angle * 180 / Math.PI, lineCap: 'round' }));
    else if (cap === 'number') {
      group.add(new Konva.Circle({ ...common, radius: size }));
      group.add(new Konva.Text({ x: point.x - size, y: point.y - size, width: size * 2, height: size * 2, text: a.badgeText, align: 'center', verticalAlign: 'middle', fontSize: size * (a.badgeText.length > 2 ? 0.65 : 0.92), fontFamily: 'Noto Sans SC', fill: a.labelColor, fontStyle: 'bold', listening: false }));
    }
  };
  marker(a.startCap, g.start, g.startAngle); marker(a.endCap, g.end, g.endAngle);
  if (a.showLabel) {
    const text = new Konva.Text({ name: 'annotation-label', text: e.text, width: a.labelWidth * width, fontSize: e.fontSize * width, fontFamily: 'Noto Sans SC', fontStyle: e.bold ? 'bold' : 'normal', fill: e.fill, align: e.align, lineHeight: 1.4, padding: e.fontSize * width * 0.28, wrap: 'word' });
    const box = annotationLabelBox(a, g, width, text.height()); text.position(box);
    if (a.labelBackground) group.add(new Konva.Rect({ ...box, fill: a.labelColor, cornerRadius: e.fontSize * width * 0.18 }));
    group.add(text);
  }
  return group;
}
